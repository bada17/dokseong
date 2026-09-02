# -*- coding: utf-8 -*-
u"""홈페이지 공통 하단을 이 사이트에 옮겨 넣습니다.

    python tools/port-footer.py

읽는 것 : ../action-home-renewal/tools/parts/footer.html
쓰는 것 : public/index.html 의 표시 사이 (DOK:FOOTER START ~ END)

★ 손으로 옮기지 않는 이유
  하단은 홈페이지(캠페이너스)와 이 사이트 둘 다에 나갑니다. 한 번 복사해 두면
  주소나 대표 이름이 바뀔 때 한쪽만 고쳐져 갈라집니다. 원본은 개편 저장소
  한 곳이고, 여기서는 굽기만 합니다. 다시 돌려도 쌓이지 않습니다.

★ 옮기면서 바꾸는 것
  1. 캠페이너스 전용 표시와 기본 푸터 감추는 규칙을 걷어냅니다.
  2. 안쪽 주소(/34 · /37 · /8)를 action.or.kr 절대 주소로 바꿉니다.
     개인정보처리방침만은 이 사이트가 가진 privacy.html 로 보냅니다.
  3. 전체 폭으로 펼치는 음수 여백을 껍니다. 캠페이너스 안에서는 좁은 칸을
     비집고 나오려고 쓰는 값인데, 여기서는 이미 문서 폭이라 가로 스크롤만 생깁니다.
"""
import io
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except AttributeError:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SRC = os.environ.get(
    'AH_FOOTER',
    os.path.join(os.path.dirname(ROOT), 'action-home-renewal',
                 'tools', 'parts', 'footer.html'))
DST = os.path.join(ROOT, 'public', 'index.html')

BEGIN = u'<!-- DOK:FOOTER START — tools/port-footer.py 가 채웁니다. 손으로 고치지 마세요. -->'
END = u'<!-- DOK:FOOTER END -->'

LINKS = {
    '/34': 'https://action.or.kr/34',
    '/37': 'https://action.or.kr/37',
    '/8': 'privacy.html',          # 이 사이트가 가진 방침을 씁니다
}


def main():
    if not os.path.exists(SRC):
        print(u'공통 하단을 못 찾았습니다: %s' % SRC)
        print(u'AH_FOOTER 환경변수로 footer.html 경로를 알려 주세요.')
        return 1

    src = io.open(SRC, encoding='utf-8').read()
    dst = io.open(DST, encoding='utf-8').read()

    # ── 캠페이너스 전용 부분 걷어내기 ──
    body = re.sub(r'<!-- CAMPAIGNERS:COMMON-FOOTER START -->\s*', '', src, count=1)
    body = re.sub(r'<!-- 이 파일 전체를 캠페이너스 하단 반복 섹션[^>]*-->\s*', '', body, count=1)
    body = re.sub(r'\s*<!-- CAMPAIGNERS:COMMON-FOOTER END -->\s*$', '\n', body)
    # 캠페이너스 기본 푸터를 감추는 규칙은 여기서 쓸모가 없습니다.
    body = re.sub(r'\s*/\* 캠페이너스 기본 푸터는[^*]*\*/\s*\n\s*#doz_footer_wrap[^\n]*\n', '\n', body, count=1)

    # ── 안쪽 주소 → 절대 주소 ──
    moved = 0
    for rel, abs_ in LINKS.items():
        body, n = re.subn(r'href="%s"' % re.escape(rel), 'href="%s"' % abs_, body)
        moved += n
    left = sorted(set(re.findall(r'href="(/[^"]*)"', body)))
    if left:
        print(u'  ! 안쪽 주소가 남았습니다 — LINKS 에 넣으세요: %s' % ', '.join(left))
        return 1

    # ── 전체 폭 음수 여백 끄기 ──
    body = body.replace(
        u"""    /* 전체 폭으로 펼치기. 뿌리(#act 등)와 같은 값을 씁니다. */
    margin-left:calc(50% - 50vw + var(--ah-sb, 0px) / 2);
    margin-right:calc(50% - 50vw + var(--ah-sb, 0px) / 2);
""",
        u"""    /* 캠페이너스에서는 좁은 칸을 비집고 나오려고 음수 여백을 썼지만,
       이 사이트는 문서 폭이 이미 전체라 그냥 두면 가로 스크롤만 생깁니다. */
""", 1)

    block = u'%s\n%s\n%s' % (BEGIN, body.strip(), END)

    i, j = dst.find(BEGIN), dst.find(END)
    if i < 0 or j < 0:
        print(u'  ! public/index.html 에 표시가 없습니다.')
        print(u'    아래 두 줄을 넣을 자리에 두고 다시 돌리세요 —')
        print(u'    %s\n    %s' % (BEGIN, END))
        return 1
    dst = dst[:i] + block + dst[j + len(END):]

    io.open(DST, 'w', encoding='utf-8', newline='\n').write(dst)
    print(u'  읽음   %s' % SRC)
    print(u'  주소 %d 곳을 바꿨습니다' % moved)
    print(u'  씀     %s (%d 바이트)' % (DST, len(dst.encode('utf-8'))))
    return 0


if __name__ == '__main__':
    sys.exit(main())
