"""
역대 수상 표(HTML) → public/data/awards.json

수상자 이름을 실제 행정구역 이름(통계청 2018)과 대조해서 지역 코드를 붙인다.
지어내지 않는다 — 대조에 실패하면 scope를 'unknown'으로 남기고 사람이 채운다.
"""
import io, json, os, re, sys

SP = sys.argv[1]

# ── 행정구역 이름 사전 만들기 ──
sido = json.load(io.open('public/data/map-sido.json', encoding='utf-8'))['areas']
sido_by_name = {}
for s in sido:
    n = s['name']
    sido_by_name[n] = s['code']
    # 서울특별시 → 서울시/서울, 경상남도 → 경남 같은 줄임말
    short = (n.replace('특별자치도', '').replace('특별자치시', '')
              .replace('광역시', '').replace('특별시', '').replace('도', ''))
    sido_by_name.setdefault(short, s['code'])
    sido_by_name.setdefault(short + '시', s['code'])
    sido_by_name.setdefault(short + '도', s['code'])

sigungu_by_name = {}
for f in os.listdir('public/data/map-sigungu'):
    d = json.load(io.open('public/data/map-sigungu/' + f, encoding='utf-8'))
    for a in d['areas']:
        sigungu_by_name.setdefault(a['name'], []).append(a['code'])

# ── 표 읽기 ──
html = io.open('public/index.html', encoding='utf-8').read()
tbl = re.search(r'<table.*?</table>', html, re.S).group(0)
rows = re.findall(r'<tr>(.*?)</tr>', tbl, re.S)
data_rows = []
for r in rows:
    cells = [re.sub(r'<[^>]+>', '', c).replace('&amp;', '&').strip()
             for c in re.findall(r'<t[dh]>(.*?)</t[dh]>', r, re.S)]
    if len(cells) == 3 and re.match(r'^\d{4}\.', cells[0]):
        data_rows.append(cells)

assert len(data_rows) == 40, f'수상 40건이어야 하는데 {len(data_rows)}건'

# 중앙정부·공공기관으로 볼 말들.
# '청' 한 글자로 걸면 '청원군'이 중앙부처가 되어 버리므로 반드시 끝말로 본다.
CENTRAL_SUFFIX = ('부', '처', '청', '위원회', '공단', '공사', '은행',
                  '재단', '연구원', '정부', '국회', '한국전력')
MULTI = re.compile(r'\d+\s*개\s*(지방자치단체|지자체|정당|은행)')


def classify(awardee):
    a = awardee.strip()

    if MULTI.search(a) or '지방자치단체' in a or '정당' in a:
        return {'scope': 'multi', 'sido': None, 'sigungu': None}

    # 1) 시군구 이름과 정확히 일치 (양구군, 하남시, 서초구 …)
    if a in sigungu_by_name:
        codes = sigungu_by_name[a]
        if len(codes) == 1:
            return {'scope': 'local', 'sido': codes[0][:2], 'sigungu': codes[0]}
        return {'scope': 'unknown', 'sido': None, 'sigungu': None,
                'note': '같은 이름의 시군구가 여러 곳입니다: ' + ','.join(codes)}

    # 2) 구로 쪼개진 큰 시 (고양시 → 고양시덕양구 …). 시도까지만 잡는다.
    if a.endswith(('시', '군')):
        hits = {c[:2] for name, codes in sigungu_by_name.items()
                if name.startswith(a) for c in codes}
        if len(hits) == 1:
            return {'scope': 'local', 'sido': hits.pop(), 'sigungu': None,
                    'note': '이 데이터에서는 구 단위로 나뉘어 있어 시도까지만 표시'}

    # 3) 시도 이름과 일치 (서울시, 충청남도 …)
    if a in sido_by_name:
        return {'scope': 'local', 'sido': sido_by_name[a], 'sigungu': None}

    # 4) 중앙정부·공공기관 (끝말로 판단)
    if a.endswith(CENTRAL_SUFFIX):
        return {'scope': 'central', 'sido': None, 'sigungu': None}

    return {'scope': 'unknown', 'sido': None, 'sigungu': None}


awards = []
for i, (date, awardee, project) in enumerate(data_rows, start=1):
    rec = {'round': i, 'date': date.rstrip('.').strip(),
           'awardee': awardee, 'project': project}
    rec.update(classify(awardee))
    awards.append(rec)

os.makedirs('public/data', exist_ok=True)
json.dump({'note': '지역이 unknown인 항목은 사람이 채워야 합니다.', 'awards': awards},
          io.open('public/data/awards.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)

# 사람이 검토할 목록
lines = []
for a in awards:
    lines.append(f"제{a['round']:2d}회 | {a['date']:9s} | {a['scope']:8s} | "
                 f"sido={a['sido'] or '--':4s} sigungu={a['sigungu'] or '-----':6s} | "
                 f"{a['awardee']} | {a['project']}"
                 + (f"   << {a['note']}" if a.get('note') else ''))
io.open(SP + '/awards-review.txt', 'w', encoding='utf-8').write('\n'.join(lines))

from collections import Counter
print(Counter(a['scope'] for a in awards))
