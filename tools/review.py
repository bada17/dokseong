# -*- coding: utf-8 -*-
"""
밑빠진 독상 — 제보 검토실

    python tools/review.py          새로 들어온 제보만
    python tools/review.py --all    이미 처리한 것까지 (지난 분기 다시 보기)

브라우저가 열리고, 제보가 **회차(분기)별로 묶여** 사진과 함께 나옵니다.
읽고 나서 넷 중 하나를 고르면 됩니다 — 확인 / 후보 / 탈락 / 스팸.
고른 것을 저장하면 그때 지도에 반영됩니다.

밑빠진 독상은 분기마다 한 번씩 돕니다. 회차는 제보가 들어온 때의
`CURRENT_ROUND`(wrangler.toml) 값이라, 분기가 바뀌면 그 값을 올려야
새 제보가 다음 회차로 묶입니다.

왜 관리자 웹페이지가 아니라 이 방식인가
──────────────────────────────────────────
공개된 주소에 관리자 화면을 두면, 비밀번호 하나로 제보자 정보 전체가 열리는
문이 인터넷에 생깁니다. 이 도구는 담당자 컴퓨터에서만 돌고 127.0.0.1 로만
열리므로 그 문이 아예 없습니다. 대신 이 컴퓨터에서만 검토할 수 있습니다.

드나드는 곳
──────────────────────────────────────────
  제보 글  : Cloudflare D1  `dokseong`         (wrangler 로 읽고 씁니다)
  제보 사진: Cloudflare R2  `dokseong-photos`  (검토하는 동안만 임시로 내려받습니다)
  둘 다 action@action.or.kr 계정입니다. `npx wrangler login` 이 돼 있어야 합니다.

파기
──────────────────────────────────────────
시작할 때마다 기간이 지난 것을 먼저 지웁니다(개인정보 처리방침 7번).
지우는 것은 되돌릴 수 없습니다. 무엇을 지웠는지는 화면에 적습니다.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = 'dokseong'
BUCKET = 'dokseong-photos'
PORT = 8322

# 방침 7번의 기간. 여기를 고치면 public/privacy.html 도 같이 고쳐야 합니다.
#
# ★ 방침은 "접수한 회차가 끝난 날부터 1년" 이지만 여기서는 **접수한 날부터** 1년으로
#   셉니다. 회차 종료일은 접수일보다 늦으므로, 이 기준은 방침이 약속한 기한보다
#   이르거나 같습니다 — 약속보다 오래 들고 있는 일은 생기지 않습니다.
KEEP_MONTHS = 12        # 제보 내용·사진·지역
KEEP_TRACE_MONTHS = 6   # 바꾼 IP 값, 브라우저 종류

STATES = [
    ('reviewing', '확인',  '읽었고 이상 없음. 지도에 셉니다'),
    ('candidate', '후보',  '이번 회차 후보로 올립니다. 지도에 셉니다'),
    ('dropped',   '탈락',  '제보는 맞지만 다루지 않습니다. 지도에 안 셉니다'),
    ('spam',      '스팸',  '장난·광고. 지도에 안 셉니다'),
]


# ── wrangler 부르기 ────────────────────────────────────────────────

def wrangler(args, capture=True):
    cmd = ['npx', 'wrangler'] + args
    r = subprocess.run(cmd, cwd=ROOT, shell=True,
                       capture_output=capture, text=True, encoding='utf-8')
    if r.returncode != 0:
        sys.exit('wrangler 실패:\n%s' % ((r.stderr or r.stdout or '').strip()))
    return r.stdout or ''


def sql(command):
    """D1 에 한 문장 보내고 결과 줄들을 돌려줍니다."""
    out = wrangler(['d1', 'execute', DB, '--remote', '--json', '-y',
                    '--command', command])
    # wrangler 가 앞에 배너를 붙일 때가 있어 JSON 이 시작하는 곳부터 읽습니다.
    i = out.find('[')
    if i < 0:
        return []
    return json.loads(out[i:])[0].get('results', [])


def photo_keys(row):
    if not row.get('photos'):
        return []
    try:
        return json.loads(row['photos'])
    except (ValueError, TypeError):
        return []


# ── 파기 ──────────────────────────────────────────────────────────

def purge():
    print('기간이 지난 것을 지웁니다 (개인정보 처리방침 7번)')

    # (1) 접속 흔적은 6개월. 제보 자체는 남기고 그 두 칸만 비웁니다.
    n = sql("SELECT COUNT(*) AS n FROM reports "
            "WHERE created_at < datetime('now', '-%d months') "
            "AND (ip_hash IS NOT NULL OR user_agent IS NOT NULL)" % KEEP_TRACE_MONTHS)
    n = n[0]['n'] if n else 0
    if n:
        sql("UPDATE reports SET ip_hash = NULL, user_agent = NULL "
            "WHERE created_at < datetime('now', '-%d months')" % KEEP_TRACE_MONTHS)
    print('  · 접속 흔적(바꾼 IP·브라우저) %d건 지움' % n)

    # (2) 1년 지난 제보는 사진부터 지우고 줄을 지웁니다.
    #     사진을 먼저 지우는 이유 — 줄을 먼저 지우면 어느 사진이 남았는지
    #     알 길이 없어 R2 에 주인 없는 파일이 쌓입니다.
    old = sql("SELECT id, photos FROM reports "
              "WHERE created_at < datetime('now', '-%d months')" % KEEP_MONTHS)
    shots = 0
    for row in old:
        for key in photo_keys(row):
            wrangler(['r2', 'object', 'delete', '%s/%s' % (BUCKET, key), '--remote'])
            shots += 1
    if old:
        sql("DELETE FROM reports "
            "WHERE created_at < datetime('now', '-%d months')" % KEEP_MONTHS)
    print('  · 기간 지난 제보 %d건, 사진 %d장 지움' % (len(old), shots))
    print()


# ── 검토할 것 모으기 ───────────────────────────────────────────────

def gather(workdir, include_all=False):
    # 회차는 큰 것부터(최근 분기가 위로), 그 안에서는 들어온 차례대로.
    where = '' if include_all else "WHERE status = 'new' "
    rows = sql("SELECT id, round, region, detail, email, sido, sigungu, photos, "
               "status, created_at FROM reports %s"
               "ORDER BY round DESC, created_at" % where)
    if not rows:
        return []

    shots = os.path.join(workdir, 'shots')
    os.makedirs(shots, exist_ok=True)
    for row in rows:
        row['files'] = []
        for key in photo_keys(row):
            name = key.split('/')[-1]
            wrangler(['r2', 'object', 'get', '%s/%s' % (BUCKET, key),
                      '--file', os.path.join(shots, name), '--remote'])
            row['files'].append(name)
    return rows


# ── 화면 ──────────────────────────────────────────────────────────

def esc(v):
    return (str(v if v is not None else '')
            .replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def build_html(rows):
    # 회차별로 묶습니다. 분기마다 한 묶음으로 검토하기 때문입니다.
    rounds = []
    for row in rows:
        if not rounds or rounds[-1][0] != row['round']:
            rounds.append((row['round'], []))
        rounds[-1][1].append(row)

    tabs = ''.join(
        '<button class="tab" data-round="{r}">제{r}회차 <b>{n}</b></button>'.format(
            r=esc(r), n=len(group)) for r, group in rounds)
    tabs = ('<button class="tab on" data-round="all">전체 <b>%d</b></button>%s'
            % (len(rows), tabs)) if len(rounds) > 1 else ''

    blocks = []
    for rnd, group in rounds:
        blocks.append('<section class="round" data-round="%s">'
                      '<h2>제%s회차 <span>%d건</span></h2>'
                      % (esc(rnd), esc(rnd), len(group)))
        blocks.append(cards_of(group))
        blocks.append('</section>')

    return SHELL.replace('%TABS%', tabs) \
                .replace('%CARDS%', ''.join(blocks) or
                         '<p class="empty">검토할 제보가 없습니다.</p>') \
                .replace('%COUNT%', str(len(rows)))


def cards_of(rows):
    cards = []
    for row in rows:
        shots = ''.join(
            '<a href="shots/{f}" target="_blank"><img src="shots/{f}" alt=""></a>'.format(f=esc(f))
            for f in row['files'])
        # --all 로 열었을 때는 지금 상태를 미리 눌러 둡니다.
        # 무엇으로 처리했는지 보이지 않으면 다시 볼 이유가 없습니다.
        picks = ''.join(
            '<label class="pick"><input type="radio" name="s{id}" value="{v}"{on}>'
            '<b>{lab}</b><span>{why}</span></label>'.format(
                id=row['id'], v=v, lab=lab, why=esc(why),
                on=' checked' if row.get('status') == v else '')
            for v, lab, why in STATES)
        cards.append("""
<article class="card" data-id="{id}">
  <header><span class="no">#{id}</span>
    <span class="when">{when}</span>
    <span class="where">{round}회차 · {region}</span></header>
  <p class="detail">{detail}</p>
  {shotbox}
  <p class="mail">{mail}</p>
  <div class="picks">{picks}</div>
</article>""".format(
            id=row['id'],
            when=esc(row['created_at']),
            round=esc(row['round']),
            region=esc(row.get('region') or '지역 없음'),
            detail=esc(row.get('detail') or '(내용 없이 사진만)') or '&nbsp;',
            shotbox='<div class="shots">%s</div>' % shots if shots else
                    '<p class="noshot">사진 없음</p>',
            mail=('회신 이메일: <code>%s</code>' % esc(row['email'])) if row.get('email')
                 else '회신 이메일 없음 — 이 제보자에게는 답할 수 없습니다',
            picks=picks))
    return ''.join(cards)


SHELL = """<!doctype html><html lang="ko"><meta charset="utf-8">
<title>제보 검토실</title>
<style>
 body{font:15px/1.6 "맑은 고딕",system-ui,sans-serif;margin:0;background:#f3f5f7;color:#1a1a1a}
 header.top{position:sticky;top:0;background:#0b3d5c;color:#fff;padding:14px 20px;z-index:5;
   display:flex;align-items:center;gap:16px}
 header.top h1{font-size:17px;margin:0}
 header.top .left{opacity:.8;font-size:13px}
 button{margin-left:auto;font:inherit;font-weight:700;padding:9px 20px;border:0;
   border-radius:6px;background:#ffd23f;color:#1a1a1a;cursor:pointer}
 button:disabled{opacity:.45;cursor:default}
 main{max-width:860px;margin:20px auto;padding:0 16px}
 .card{background:#fff;border:1px solid #dde3e8;border-radius:10px;padding:18px;margin-bottom:18px}
 .card.done{border-color:#9ac; background:#f7fbfd}
 .card header{display:flex;gap:12px;font-size:13px;color:#5a6b78;margin-bottom:10px;flex-wrap:wrap}
 .no{font-weight:700;color:#0b3d5c}
 .detail{white-space:pre-wrap;margin:0 0 12px}
 .shots{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
 .shots img{height:150px;border-radius:6px;border:1px solid #dde3e8}
 .noshot,.mail{font-size:13px;color:#5a6b78;margin:0 0 12px}
 .picks{display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid #eef1f4;padding-top:12px}
 .pick{flex:1;min-width:150px;border:1px solid #dde3e8;border-radius:8px;padding:9px 11px;cursor:pointer}
 .pick:has(:checked){border-color:#0b3d5c;background:#eef6fb}
 .pick input{margin-right:6px}
 .pick span{display:block;font-size:12px;color:#5a6b78;margin-top:2px}
 .empty{text-align:center;padding:60px 0;color:#5a6b78}
 .tabs{display:flex;gap:6px;flex-wrap:wrap;max-width:860px;margin:18px auto 0;padding:0 16px}
 .tab{margin:0;background:#fff;color:#0b3d5c;border:1px solid #dde3e8;font-weight:600;
   padding:7px 14px;border-radius:20px;font-size:13.5px}
 .tab.on{background:#0b3d5c;color:#fff;border-color:#0b3d5c}
 .tab b{opacity:.7;margin-left:4px;font-weight:600}
 .round > h2{max-width:860px;margin:26px auto 12px;font-size:15px;color:#0b3d5c;
   display:flex;align-items:center;gap:9px}
 .round > h2::after{content:"";flex:1;height:1px;background:#dde3e8}
 .round > h2 span{font-weight:400;color:#5a6b78;font-size:13px}
 .round[hidden]{display:none}
</style>
<header class="top">
  <h1>제보 검토실</h1>
  <span class="left">제보 <b id="left">%COUNT%</b>건 · 고른 것만 반영됩니다</span>
  <button id="save" disabled>저장하고 닫기</button>
</header>
<div class="tabs">%TABS%</div>
<main>%CARDS%</main>
<script>
// 회차 고르기. 숨기기만 할 뿐 고른 것은 그대로 남습니다 —
// 회차를 옮겨 다녀도 앞서 고른 것이 사라지지 않습니다.
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const want = tab.dataset.round;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === tab));
    document.querySelectorAll('.round').forEach(sec => {
      sec.hidden = (want !== 'all' && sec.dataset.round !== want);
    });
  });
});
const save = document.getElementById('save');
document.addEventListener('change', () => {
  document.querySelectorAll('.card').forEach(c =>
    c.classList.toggle('done', !!c.querySelector('input:checked')));
  save.disabled = !document.querySelector('input:checked');
});
save.addEventListener('click', async () => {
  const picks = {};
  // 숨겨 둔 회차의 것도 함께 보냅니다.
  document.querySelectorAll('.card').forEach(c => {
    const hit = c.querySelector('input:checked');
    if (hit) picks[c.dataset.id] = hit.value;
  });
  save.disabled = true; save.textContent = '저장 중…';
  const res = await fetch('/save', { method:'POST', body: JSON.stringify(picks) });
  document.body.innerHTML = '<p class="empty">' +
    (res.ok ? '저장했습니다. 이 창을 닫으세요.' : '저장하지 못했습니다. 터미널을 보세요.') + '</p>';
});
</script>
</html>"""


# ── 결정을 되돌려 쓰기 ─────────────────────────────────────────────

def apply_picks(picks):
    valid = {v for v, _, _ in STATES}
    done = {}
    for raw_id, state in picks.items():
        if state not in valid or not str(raw_id).isdigit():
            continue
        rid = int(raw_id)
        # 탈락·스팸은 회신할 일이 없습니다. 방침 7번이 "안내를 마치면 곧바로" 라고
        # 했으므로 여기서 이메일을 함께 지웁니다. 제보 내용은 회차 정리에 쓰이므로
        # 남깁니다 — 지우는 것은 연락처뿐입니다.
        drop_mail = ', email = NULL' if state in ('dropped', 'spam') else ''
        sql("UPDATE reports SET status = '%s'%s WHERE id = %d"
            % (state, drop_mail, rid))
        done[state] = done.get(state, 0) + 1
    return done


class Handler(BaseHTTPRequestHandler):
    rows = []
    workdir = ''
    result = None

    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype='text/html; charset=utf-8'):
        self.send_response(code)
        self.send_header('content-type', ctype)
        self.send_header('content-length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/':
            self._send(200, build_html(Handler.rows).encode('utf-8'))
        elif self.path.startswith('/shots/'):
            name = os.path.basename(self.path)
            path = os.path.join(Handler.workdir, 'shots', name)
            if os.path.isfile(path):
                with open(path, 'rb') as fh:
                    self._send(200, fh.read(), 'image/*')
            else:
                self._send(404, b'no')
        else:
            self._send(404, b'no')

    def do_POST(self):
        if self.path != '/save':
            return self._send(404, b'no')
        size = int(self.headers.get('content-length') or 0)
        try:
            picks = json.loads(self.rfile.read(size).decode('utf-8'))
            Handler.result = apply_picks(picks)
            self._send(200, b'ok', 'text/plain')
        except Exception as err:                      # noqa: BLE001
            print('저장 실패:', err)
            self._send(500, b'fail', 'text/plain')
        threading.Thread(target=self.server.shutdown, daemon=True).start()


def main():
    include_all = '--all' in sys.argv[1:]

    purge()

    workdir = tempfile.mkdtemp(prefix='dok-review-')
    try:
        rows = gather(workdir, include_all)
        if not rows:
            print('검토할 제보가 없습니다.' if include_all else
                  '검토할 새 제보가 없습니다. (--all 을 붙이면 지난 것도 봅니다)')
            return

        print('%s %d건. 브라우저에서 검토하세요 — http://127.0.0.1:%d/'
              % ('제보' if include_all else '새 제보', len(rows), PORT))
        print('(저장하면 이 창이 저절로 끝납니다. 그냥 닫으려면 Ctrl+C)')

        Handler.rows = rows
        Handler.workdir = workdir
        server = HTTPServer(('127.0.0.1', PORT), Handler)
        webbrowser.open('http://127.0.0.1:%d/' % PORT)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print('\n검토를 멈췄습니다. 아무것도 바꾸지 않았습니다.')
            return

        done = Handler.result or {}
        if done:
            label = dict((v, lab) for v, lab, _ in STATES)
            print('반영했습니다 — ' +
                  ', '.join('%s %d건' % (label[k], n) for k, n in done.items()))
        else:
            print('반영된 것이 없습니다.')
    finally:
        # 내려받은 사진은 검토가 끝나면 이 컴퓨터에 남기지 않습니다.
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == '__main__':
    main()
