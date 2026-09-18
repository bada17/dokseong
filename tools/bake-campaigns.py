"""접수 시트(Apps Script)의 사업 목록을 public/data/campaigns.json 에 사본으로 굽는다.

왜 굽는가 — Apps Script 왕복이 실측 1.2~4.2초다(그중 1.8초 이상이 리다이렉트라
서버에서 줄일 수 없다). 그동안 첫 방문자는 '지금 지켜보고 있는 예산' 칸이
비어 있는 것을 본다. 화면은 이 사본을 먼저 그리고(같은 도메인이라 즉시),
시트 것이 도착하면 조용히 갈아 끼운다.

    python tools/bake-campaigns.py

⚠️ 사본은 낡는다. 시트에서 사업을 내렸는데 이 파일에 남아 있으면 첫 방문자가
   그 사업을 1~4초 동안 본다. 급히 내려야 하는 사업이면 이 파일도 함께 갱신할 것.

⚠️ 주소를 여기에 또 적지 않는다 — public/index.html 의 DOK_SHEET_ENDPOINT 를
   읽어 쓴다. 두 군데 적어 두면 한쪽만 바뀌는 날이 온다.
"""
import json, re, sys, pathlib, urllib.request, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / 'public' / 'index.html'
OUT = ROOT / 'public' / 'data' / 'campaigns.json'

m = re.search(r"const DOK_SHEET_ENDPOINT\s*=\s*'([^']*)'", PAGE.read_text(encoding='utf-8'))
if not m or not m.group(1):
    sys.exit('index.html 에서 DOK_SHEET_ENDPOINT 를 못 찾았다(또는 비어 있다).')
url = m.group(1) + '?action=campaigns'

with urllib.request.urlopen(url, timeout=60) as r:
    got = json.loads(r.read().decode('utf-8'))
if isinstance(got, dict):
    got = got.get('campaigns') or []
if not isinstance(got, list) or not got:
    sys.exit('시트에서 받은 사업이 없다. 파일을 건드리지 않는다.')

# 시트에 없는 로컬 기록(status 가 ongoing/closed 가 아닌 줄)은 지우지 않고 남긴다.
keep = []
if OUT.exists():
    old = json.loads(OUT.read_text(encoding='utf-8'))
    if isinstance(old, dict):
        old = old.get('campaigns') or []
    ids = {c.get('id') for c in got}
    keep = [c for c in old
            if c.get('status') not in ('ongoing', 'closed') and c.get('id') not in ids]

doc = {
    '_주석': [
        '이 파일은 손으로 고치는 원본이 아니라 **접수 시트의 사본**입니다.',
        '사업을 올리고 내리는 곳은 담당자가 쓰는 구글 설문지·시트입니다.',
        '',
        '왜 사본을 두는가 — Apps Script 왕복이 1~4초라 첫 방문자가 그동안 빈 칸을',
        '봅니다. 화면은 이 파일을 먼저 그리고, 시트 것이 오면 조용히 갈아 끼웁니다.',
        '',
        '⚠️ 사본이 낡으면 첫 방문자가 옛 목록을 1~4초 동안 봅니다.',
        '   다시 굽는 법: python tools/bake-campaigns.py',
        '',
        'status 가 ongoing·closed 가 아닌 줄은 굽는 스크립트가 지우지 않고 남깁니다.',
    ],
    '구운때': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
    'campaigns': got + keep,
}
OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('구웠다: %s (사업 %d건, 남긴 줄 %d건, %d바이트)'
      % (OUT, len(got), len(keep), OUT.stat().st_size))
