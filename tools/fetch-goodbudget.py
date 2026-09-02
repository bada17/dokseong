# -*- coding: utf-8 -*-
u"""좋은예산센터 「월간 좋은예산」 예산낭비 사례 10건을 받아 둡니다.

    python tools/fetch-goodbudget.py

받는 곳 : goodbudget.kr/pot_archive (역대 밑빠진독상 목록 안에 섞여 있습니다)
쓰는 곳 : docs/goodbudget/원문/*.html  (받은 그대로)
          docs/goodbudget/글/*.txt     (태그 걷어낸 본문)
          docs/goodbudget/목록.json    (제목·날짜·주소·글자 수)

★ 왜 받아 두는가 — 이식이 아니라 백업입니다.
  goodbudget.kr 은 XpressEngine 1.4.3(2013년 판)으로 돌고, HTTPS 가 붙어 있지
  않습니다(TLS 핸드셰이크가 끊깁니다). 언제 내려가도 이상하지 않은 사이트인데
  그 10건은 다른 어디에도 없습니다. 화면에 붙이지 않더라도 자료는 남겨 둡니다.

★ 화면에 게시하는 것과는 다른 이야기입니다.
  좋은예산센터는 시민행동 산하지만 별개 단체입니다. 원문을 우리 사이트에
  올릴지는 확인한 뒤에 정합니다. 이 스크립트는 저장소에 받아만 둡니다.

★ 목록이 늘면 여기 ITEMS 에 주소를 더하고 다시 도세요. 이미 받은 것은 건너뜁니다.
"""
import io
import json
import os
import re
import sys
import time
import urllib.request

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except AttributeError:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'docs', 'goodbudget')

# 2026-09-02 사용자가 고른 범위 — [2010년3월호] 부터 [2011년 10월호] 까지.
# 이 사이의 「월간 좋은예산」 기사가 정확히 열 건입니다.
ITEMS = [
    (2802, '2010-03', '앞에선 막는 척 뒤로는 예산지원, 호화청사에 거액 국비보조', 4802),
    (2807, '2010-07', '가든파이브, 사업목적 잃어버린 채 좌초 위기', 4805),
    (2808, '2010-08', '적십자사, 피 값 수백억 멋대로 쓰고도 평온', 4810),
    (2809, '2010-09', '감사원·국회를 비웃는 특별교부금의 힘', 4813),
    (2810, '2010-10', '동막골 다윗은 골리앗을 이겼지만', 4816),
    (2811, '2010-11', 'F1 코리아, 빵이냐 자긍심이냐', 4823),
    (2902, '2011-02', "국회 '나 홀로' 무상의료", 4885),
    (2903, '2011-03', '흥청망청 재외공관, 나라망신도 다반사', 4977),
    (2905, '2011-05', '미신 때문에 낭비된 예산', 5019),
    (2910, '2011-10', '군납비리, 지겨운 재방송', 19028),
]

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
    for enc in ('utf-8', 'euc-kr', 'cp949'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode('utf-8', 'replace')


def article_text(html):
    u"""XE 본문(.xe_content)만 남기고 태그를 걷어냅니다."""
    m = re.search(r'<div[^>]*class="[^"]*xe_content[^"]*"[^>]*>(.*?)</div>\s*(?:<!--|</div>)',
                  html, re.S)
    body = m.group(1) if m else html
    body = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', body, flags=re.S)
    body = re.sub(r'<br\s*/?>|</p>|</tr>|</div>', '\n', body, flags=re.I)
    body = re.sub(r'<[^>]+>', ' ', body)
    for a, b in (('&nbsp;', ' '), ('&amp;', '&'), ('&lt;', '<'), ('&gt;', '>'),
                 ('&quot;', '"'), ('&#39;', "'")):
        body = body.replace(a, b)
    body = re.sub(r'[ \t]+', ' ', body)
    body = re.sub(r'\n\s*\n\s*\n+', '\n\n', body)
    return body.strip()


def main():
    for d in ('원문', '글'):
        p = os.path.join(OUT, d)
        if not os.path.exists(p):
            os.makedirs(p)

    index = []
    for key, ym, title, srl in ITEMS:
        url = 'http://goodbudget.kr/pot_archive/%d' % srl
        raw_p = os.path.join(OUT, '원문', '%s.html' % ym)
        txt_p = os.path.join(OUT, '글', '%s.txt' % ym)

        if os.path.exists(raw_p):
            html = io.open(raw_p, encoding='utf-8').read()
            print(u'  %s  이미 받아 둠' % ym)
        else:
            try:
                html = fetch(url)
            except Exception as e:                      # noqa: BLE001
                print(u'  %s  못 받음 — %s' % (ym, e))
                continue
            io.open(raw_p, 'w', encoding='utf-8', newline='\n').write(html)
            time.sleep(1)                               # 남의 서버다. 천천히.
            print(u'  %s  받음 (%d 바이트)' % (ym, len(html.encode('utf-8'))))

        text = article_text(html)
        io.open(txt_p, 'w', encoding='utf-8', newline='\n').write(text)
        index.append({
            'ym': ym, 'title': title, 'url': url,
            'chars': len(text),
            'raw': '원문/%s.html' % ym, 'text': '글/%s.txt' % ym,
        })

    io.open(os.path.join(OUT, '목록.json'), 'w', encoding='utf-8', newline='\n').write(
        json.dumps(index, ensure_ascii=False, indent=2))
    print(u'\n  %d건 · %s' % (len(index), OUT))
    return 0


if __name__ == '__main__':
    sys.exit(main())
