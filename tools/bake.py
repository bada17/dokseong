"""접수 시트(Apps Script)의 사업·활동가의 글을 사본으로 굽습니다.

    python tools/bake.py

왜 굽는가 — Apps Script 왕복이 실측 1.2~4.2초다(그중 1.8초 이상이 리다이렉트라
서버에서 줄일 수 없다). 그동안 첫 방문자는 '준비 중' 문구와 빈 글 칸을 본다.
화면은 이 사본을 먼저 그리고(같은 도메인이라 즉시), 시트 것이 도착하면 갈아 끼운다.

굽는 것 —
  public/data/campaigns.json   사업 목록 + 사진 사본 표
  public/data/stories.json     활동가의 글 목록 + 본문
  public/img/camp-*·story-*    본문·카드에 박힌 사진

사진을 파일로 꺼내는 까닭 —
  · 카드 사진은 구글 드라이브 썸네일 주소라 한 장에 0.9초쯤 걸린다.
  · 글 본문의 사진은 base64 로 본문에 통째로 실려 온다(상담소에서 한 편이 392KB 였다).
  파일로 꺼내면 브라우저가 따로 받아 캐시에 남기고, 두 번째부터는 아예 안 받는다.

⚠️ 사본은 낡는다. 시트에서 사업이나 글을 급히 내렸다면 이것도 다시 돌릴 것.
⚠️ 주소를 여기에 또 적지 않는다 — public/index.html 의 DOK_SHEET_ENDPOINT 를 읽어 쓴다.
   두 군데 적어 두면 한쪽만 바뀌는 날이 온다.
⚠️ 시트가 답하지 않으면 그 부분은 **건드리지 않는다.** 배포 전이거나 인터넷이
   없다고 해서 이미 구워 둔 사본을 지우면 안 된다.
"""
import base64
import datetime
import json
import mimetypes
import os
import re
import sys
import time
import urllib.request

# 윈도우 콘솔은 cp949 라 '—' 한 글자에 죽는다. 찍는 자리마다 신경 쓰지 않도록 여기서 한 번.
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except AttributeError:
    pass

ROOT = os.path.dirname(os.path.abspath(os.path.dirname(__file__)))
PAGE = os.path.join(ROOT, 'public', 'index.html')
DATA = os.path.join(ROOT, 'public', 'data')
IMG = os.path.join(ROOT, 'public', 'img')

# 본문 한 편 / 모두 합쳐. 이보다 크면 목록만 담고 본문은 누를 때 받게 둔다.
BODY_MAX_ONE = 120 * 1024
BODY_MAX_ALL = 400 * 1024

DATA_URI = re.compile(r'data:(image/[a-z+]+);base64,([A-Za-z0-9+/=]+)')
EXT = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
       'image/gif': 'gif', 'image/webp': 'webp'}

made = []


def endpoint():
    with open(PAGE, encoding='utf-8') as f:
        m = re.search(r"const DOK_SHEET_ENDPOINT\s*=\s*'([^']*)'", f.read())
    if not m or not m.group(1):
        sys.exit('index.html 에서 DOK_SHEET_ENDPOINT 를 못 찾았다(또는 비어 있다).')
    return m.group(1)


def get(url, timeout=60, tries=3):
    """접수처는 이따금 404 나 아주 느린 응답을 낸다(2026-09-18 에 겪었다 — 같은
    주소가 2.5초 · 99초 뒤 404 · 2.5초로 널뛰었다). 한 번 실패했다고 사본을
    갈아엎으면 안 되므로 몇 번 더 두드린다."""
    req = urllib.request.Request(url, headers={'User-Agent': 'dokseong-bake/1.0'})
    for n in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read(), r.headers.get('Content-Type', '')
        except Exception:
            if n == tries - 1:
                raise
            time.sleep(2 * (n + 1))


def put_file(name, raw):
    """같은 그림이면 다시 쓰지 않는다 — 깃에 쓸데없는 변경이 남지 않게."""
    path = os.path.join(IMG, name)
    if os.path.exists(path):
        with open(path, 'rb') as f:
            if f.read() == raw:
                return
    with open(path, 'wb') as f:
        f.write(raw)
    made.append((name, len(raw)))


def save_remote(url, stem):
    """바깥 주소의 사진을 img/ 로 내려받는다. 못 받으면 None."""
    try:
        raw, ctype = get(url, timeout=40)
    except Exception:
        return None
    ext = EXT.get((ctype or '').split(';')[0].strip())
    if not ext:
        ext = EXT.get(mimetypes.guess_type(url)[0] or '')
    if not ext or len(raw) < 100:
        return None                     # 사진이 아니라 오류 화면일 수 있다
    name = '%s.%s' % (stem, ext)
    put_file(name, raw)
    return 'img/' + name


def stem_for(kind, ident):
    """파일 이름 앞머리. 'camp-' + 'camp-3' 이 'camp-camp-3' 이 되지 않게 한다."""
    ident = re.sub(r'[^A-Za-z0-9_-]', '', str(ident or 'x'))[:12].lower() or 'x'
    return ident if ident.startswith(kind + '-') else '%s-%s' % (kind, ident)


def unpack_data_uris(html, stem):
    """본문에 base64 로 박힌 사진을 파일로 꺼내고 주소를 바꾼다."""
    n = [0]

    def one(m):
        ext = EXT.get(m.group(1))
        if not ext:
            return m.group(0)
        try:
            raw = base64.b64decode(m.group(2))
        except Exception:
            return m.group(0)
        n[0] += 1
        name = '%s-%d.%s' % (stem, n[0], ext)
        put_file(name, raw)
        return 'img/' + name

    return DATA_URI.sub(one, html)


# ── 사업 ──────────────────────────────────────────────────────────
def bake_campaigns(ep):
    out = os.path.join(DATA, 'campaigns.json')
    try:
        raw, _ = get(ep + '?action=campaigns')
        got = json.loads(raw.decode('utf-8'))
    except Exception as err:
        print('  사업   못 받았다(%s) — 사본을 그대로 둔다' % err)
        return
    if isinstance(got, dict):
        got = got.get('campaigns') or []
    if not isinstance(got, list) or not got:
        print('  사업   시트에서 받은 것이 없다 — 사본을 그대로 둔다')
        return

    # 사진 사본 표. 시트에서 온 목록에도 이 표를 씌워 같은 파일을 보게 한다
    # (안 그러면 사본 → 시트로 갈아 끼울 때 사진만 드라이브 주소로 되돌아간다).
    shots = {}
    for c in got:
        url = (c.get('image') or '').strip()
        if url.startswith('http'):
            local = save_remote(url, stem_for('camp', c.get('id')))
            if local:
                shots[url] = local
                c['image'] = local
        body = c.get('body')
        if isinstance(body, list):
            for i, row in enumerate(body):
                if isinstance(row, list) and len(row) > 1 and row[0] == 'img':
                    u = str(row[1] or '').strip()
                    if u.startswith('http'):
                        local = save_remote(u, stem_for('camp', c.get('id')) + '-b%d' % i)
                        if local:
                            shots[u] = local
                            row[1] = local

    keep = []
    if os.path.exists(out):
        with open(out, encoding='utf-8') as f:
            old = json.load(f)
        if isinstance(old, dict):
            old = old.get('campaigns') or []
        ids = set(c.get('id') for c in got)
        keep = [c for c in old
                if c.get('status') not in ('ongoing', 'closed') and c.get('id') not in ids]

    write(out, {
        '_주석': [
            '이 파일은 손으로 고치는 원본이 아니라 **접수 시트의 사본**입니다.',
            '사업을 올리고 내리는 곳은 담당자가 쓰는 구글 설문지·시트입니다.',
            '다시 굽는 법: python tools/bake.py',
            '',
            '"사진사본" 은 드라이브 주소 → 이 저장소 파일의 표입니다. 시트에서 온',
            '목록에도 이 표를 씌워, 사본과 시트가 같은 사진을 보게 합니다.',
            '',
            'status 가 ongoing·closed 가 아닌 줄은 굽는 스크립트가 지우지 않고 남깁니다.',
        ],
        '구운때': now(),
        '사진사본': shots,
        'campaigns': got + keep,
    })
    print('  사업   %d건을 담았다(남긴 줄 %d건)' % (len(got), len(keep)))


# ── 활동가의 글 ───────────────────────────────────────────────────
def bake_stories(ep):
    out = os.path.join(DATA, 'stories.json')
    try:
        raw, _ = get(ep + '?action=stories')
        top = json.loads(raw.decode('utf-8'))
    except Exception as err:
        print('  글     못 받았다(%s) — 사본을 그대로 둔다' % err)
        return
    items = (top or {}).get('items') if isinstance(top, dict) else None
    if not items:
        # 배포 전이면 접수처가 안내 문구만 돌려준다. 그것도 '못 받은' 것으로 본다.
        print('  글     시트가 글을 내주지 않는다(배포 전으로 보인다) — 사본을 그대로 둔다')
        return

    bodies, used, heavy, failed = {}, 0, 0, 0
    for p in items:
        pid = p.get('id')
        if not pid:
            continue
        try:
            raw, _ = get(ep + '?action=story&id=' + pid)
            r = json.loads(raw.decode('utf-8'))
        except Exception:
            failed += 1
            continue
        if not r or not r.get('ok') or not r.get('html'):
            failed += 1
            continue
        html = unpack_data_uris(r['html'], stem_for('story', pid))
        size = len(html.encode('utf-8'))
        if size > BODY_MAX_ONE or used + size > BODY_MAX_ALL:
            heavy += 1
            continue
        used += size
        bodies[pid] = html

    write(out, {
        '_주석': [
            '이 파일은 손으로 고치는 원본이 아니라 **접수 시트의 사본**입니다.',
            '글을 올리고 내리는 곳은 시트의 `활동가의 글` 탭과 구글 문서입니다.',
            '다시 굽는 법: python tools/bake.py',
            '',
            '본문에 박혀 오던 사진은 img/story-* 로 꺼내 두었습니다.',
        ],
        '구운때': now(),
        'items': items,
        'bodies': bodies,
    })
    print('  글     %d편 목록 · 본문 %d편을 담았다 (%.0fKB)'
          % (len(items), len(bodies), used / 1024.0))
    if heavy:
        print('         %d편은 커서 담지 않았다 — 누를 때 받는다' % heavy)
    if failed:
        print('         %d편은 본문을 못 받았다 — 누를 때 받는다' % failed)


def now():
    return datetime.datetime.now().strftime('%Y-%m-%d %H:%M')


def write(path, doc):
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')


def main():
    ep = endpoint()
    bake_campaigns(ep)
    bake_stories(ep)
    if made:
        print('  사진   %d장을 img/ 로 꺼냈다 — %s'
              % (len(made), ', '.join('%s %.0fKB' % (n, s / 1024.0) for n, s in made)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
