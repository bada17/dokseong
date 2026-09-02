# -*- coding: utf-8 -*-
u"""역대 수상 요약 40회를 개편 저장소 dok-history.html → 독상 사이트 public/index.html 로 옮깁니다.

한 번 쓰고 버리는 스크립트가 아닙니다. 요약을 고친 뒤 다시 돌리면 갱신됩니다.
(다만 원본이 둘이 되는 것은 그대로입니다 — 사용자 결정 A.)
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
    'AH_DOK_HISTORY',
    os.path.join(os.path.dirname(ROOT), 'action-home-renewal', 'dok-history.html'))
DST = os.path.join(ROOT, 'public', 'index.html')

MARK_CSS = u'/* ▼▼ 역대 수상 요약 팝업 — dok-history.html 에서 옮겨 온 것 ▼▼ */'
MARK_CSS_END = u'/* ▲▲ 역대 수상 요약 팝업 끝 ▲▲ */'
MARK_JS = u'/* ▼▼ 역대 수상 요약 팝업 — dok-history.html 에서 옮겨 온 것 ▼▼ */'
MARK_JS_END = u'/* ▲▲ 역대 수상 요약 팝업 끝 ▲▲ */'


def slice_between(text, start, end, label):
    i = text.find(start)
    if i < 0:
        raise SystemExit(u'못 찾음(시작): %s' % label)
    j = text.find(end, i)
    if j < 0:
        raise SystemExit(u'못 찾음(끝): %s' % label)
    return text[i:j]


def main():
    src = io.open(SRC, encoding='utf-8').read()
    dst = io.open(DST, encoding='utf-8').read()

    # ── 1. CSS ──
    css = slice_between(
        src,
        u"/* 맨 오른쪽 '요약 →' 칸.",
        u'/* ── Footer CTA ── */',
        u'CSS')

    # ── 2. 요약 데이터 ──
    data = slice_between(src, u'  var DOK_SUMMARY = {', u'\n  /* ── 팝업 ──', u'DOK_SUMMARY')
    data = data.rstrip()

    # 근거 링크가 캠페이너스 안쪽 주소다. 독립 사이트에서는 자기 자신을 가리켜 깨진다.
    data, nlink = re.subn(r"'(/\d+/\?idx=[^']*)'", r"'https://action.or.kr\1'", data)

    # ── 3. 팝업 엔진 ──
    engine = slice_between(src, u'  var modal, modalBody, modalHd,',
                           u'  // ── 역대 수상 표 ──', u'팝업 엔진')
    hashjs = slice_between(src, u'  /* ── 주소로 회차 열기 ──',
                           u'  // ── 숫자 올리기 ──', u'해시 처리')

    js = u"""
%(mark)s
/* 개편 저장소 action-home-renewal/dok-history.html 의 DOK_SUMMARY 와 팝업을
   그대로 옮겨 온 것입니다. 사용자 결정(2026-09-02)으로 두 곳에서 관리합니다.
   ⚠️ 요약을 고칠 때는 **두 파일을 다 고쳐야 합니다.** 한쪽만 고치면 어긋납니다.
      옮기는 일은 scratchpad 의 port_summary.py 가 대신할 수 있습니다.

   이 파일의 역대 수상 표는 40줄이 HTML 에 손으로 적혀 있습니다(개편 쪽은
   awards.json 으로 그립니다). 그래서 표를 다시 그리지 않고, 이미 있는 줄에
   회차 번호와 '요약 →' 칸만 덧붙입니다 — tools/build-awards.py 가 이 표를
   읽으므로 줄 자체는 건드리지 않는 편이 안전합니다. */
(function () {
  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

%(data)s

  /* 표에 적힌 40줄에서 회차 정보를 읽어 옵니다. 화면에 보이는 것과
     팝업이 여는 것이 어긋날 수 없습니다 — 같은 줄에서 나왔으니까요. */
  var awards = [];

  function readTable() {
    var table = document.querySelector('#dok .dok-all-table');
    if (!table) return null;

    var head = table.querySelector('thead tr');
    if (head && head.children.length === 4) {
      var th = document.createElement('th');
      th.innerHTML = '<span class="dok-sr">요약 열기</span>';
      head.appendChild(th);
    }

    [].forEach.call(table.querySelectorAll('tbody tr'), function (tr) {
      var td = tr.children;
      if (td.length < 4) return;
      var round = parseInt((td[0].textContent || '').replace(/[^0-9]/g, ''), 10);
      if (!round) return;
      awards.push({
        round: round,
        date: (td[1].textContent || '').trim(),
        awardee: (td[2].textContent || '').trim(),
        project: (td[3].textContent || '').trim()
      });
      tr.dataset.round = round;
      tr.setAttribute('tabindex', '0');
      if (td.length === 4) {
        var go = document.createElement('td');
        go.className = 'dok-go';
        go.setAttribute('aria-hidden', 'true');
        go.textContent = '요약 →';
        tr.appendChild(go);
      }
    });
    return awards.length ? table : null;
  }

%(engine)s
%(hashjs)s
  if (readTable()) {
    wireOpeners();
    openFromHash();
  }
})();
%(markend)s
""" % {'mark': MARK_JS, 'markend': MARK_JS_END,
       'data': data, 'engine': engine.rstrip(), 'hashjs': hashjs.rstrip()}

    css_block = u'\n%s\n%s\n%s\n' % (MARK_CSS, css.strip(), MARK_CSS_END)

    # 이미 옮겨 놓은 것이 있으면 걷어내고 다시 넣습니다(다시 돌려도 쌓이지 않게).
    for a, b in ((MARK_CSS, MARK_CSS_END), (MARK_JS, MARK_JS_END)):
        i = dst.find(a)
        if i >= 0:
            j = dst.find(b, i)
            dst = dst[:i] + dst[j + len(b):]

    dst = dst.replace(u'\n</style>', css_block + u'</style>', 1)

    tail = dst.rfind(u'</script>')
    dst = dst[:tail] + js + dst[tail:]

    # 지도 옆 목록에서도 열 수 있게 회차를 붙입니다.
    old_li = u'''        ? '<ul class="dok-map-list">' + list.map((a) =>
            `<li>'''
    new_li = u'''        ? '<ul class="dok-map-list">' + list.map((a) =>
            `<li data-round="${a.round}" tabindex="0">'''
    if old_li in dst:
        dst = dst.replace(old_li, new_li)
        print(u'  지도 옆 목록에 회차를 붙였습니다')
    else:
        print(u'  ! 지도 옆 목록 <li> 를 못 찾았습니다 — 표에서만 열립니다')

    io.open(DST, 'w', encoding='utf-8', newline='\n').write(dst)
    print(u'  요약 %d회분을 옮겼습니다' % len(re.findall(r'\n    \d+: \{', data)))
    print(u'  근거 링크 %d 곳을 action.or.kr 절대 주소로 바꿨습니다' % nlink)
    print(u'  씀     %s (%d 바이트)' % (DST, len(dst.encode('utf-8'))))


if __name__ == '__main__':
    main()
