/**
 * 밑빠진 독상 — 제보 받는 쪽 (구글 Apps Script)
 * ─────────────────────────────────────────────────────────────
 * 제보 폼이 보낸 것을 이 스프레드시트에 한 줄씩 쌓고, 사진은 드라이브에 넣고,
 * 알림 메일을 한 통 보냅니다. 지도가 쓰는 지역별 건수도 여기서 셉니다.
 *
 * 스프레드시트에 붙여 두는 스크립트입니다(확장 프로그램 › Apps Script).
 * 설치·배포 순서는 옆의 README.md 에 있습니다.
 *
 * 2026-09-04 사용자 결정: 제보를 구글 스프레드시트로 받는다.
 * 그 전에 만든 Cloudflare D1 + R2 방식(`functions/api/`)은 쓰지 않습니다.
 *
 * ★ 왜 시트인가 — **검토를 여러 사람이 나눠 하기 때문입니다.**
 *   담당자 컴퓨터에서만 도는 `tools/review.py` 로는 한 사람밖에 못 봅니다.
 *   시트는 계정만 나눠 주면 여럿이 동시에 보고, 누가 무엇을 봤는지도 남습니다.
 *   그래서 시트가 곧 검토실입니다 — 따로 관리 화면을 만들지 않습니다.
 *
 * 참여예산 상담소의 `intake/Code.gs` 를 본보기로 삼았습니다. 다른 점은 셋입니다 —
 *   (1) 사진을 받습니다(드라이브에 넣고 시트에는 링크만)
 *   (2) 지도가 쓸 지역별 건수를 `doGet` 으로 내줍니다
 *   (3) 여럿이 검토하므로 `상태` 를 바꾸면 **누가 언제 바꿨는지 자동으로 적힙니다**
 */

/* 알림을 받는 메일함. */
var NOTIFY_TO = 'action@action.or.kr';

/* 지금 도는 회차. 밑빠진 독상은 분기마다 한 번 돌고, 제보는 들어온 때의
   회차로 묶입니다. **분기가 바뀌면 이 숫자를 올리고 새 버전으로 배포하세요.**
   안 올리면 새 제보가 지난 회차에 섞여 들어갑니다. */
var CURRENT_ROUND = 41;

/* 제보 사진을 담는 드라이브 폴더의 이름. 없으면 처음 사진이 올 때 만듭니다.
   회차마다 그 아래에 `제41회` 같은 폴더가 하나씩 더 생깁니다.
   ⚠️ 만들어진 폴더는 **이 계정만** 볼 수 있습니다. 다른 검토자가 사진을 보려면
      그 사람에게 이 폴더를 '보기' 권한으로 공유해 주어야 합니다(README 4번).
      링크가 있는 모든 사용자에게 여는 것은 하지 마세요 — 제보 사진입니다. */
var PHOTO_ROOT = '밑빠진 독상 제보 사진';

/* 시트 한 장. 폼이 채우는 칸이 앞이고, 사람이 채우는 칸(TRACK)이 뒤입니다.
   appendRow 는 앞쪽만 채우므로 뒤 네 칸은 빈 채로 남습니다 — 그대로 두면 됩니다.

   wide 는 글이 길어 줄바꿈과 넓은 폭이 필요한 열 번호입니다(1부터 셉니다). */
var SHEET = {
  name: '제보',
  head: ['접수시각', '회차', '시도', '시도코드', '기관',
         '제보 내용', '사진', '회신 이메일', '유입 경로', '개인정보 동의'],
  wide: [6, 7]
};

/* 사람이 채우는 칸. `상태` 를 고르면 뒤 둘은 onEdit 이 저절로 채웁니다. */
var TRACK = ['상태', '검토한 사람', '검토한 날', '메모'];

/* 상태 다섯. D1 시절의 new/reviewing/candidate/dropped/spam 을 그대로 옮긴 것입니다.
   ⚠️ 여기 말을 바꾸면 아래 LIVE 와 시트에 이미 쌓인 값이 어긋납니다. */
var STATES = ['접수', '검토중', '후보', '탈락', '스팸'];

/* 지도에 오르는 상태. **사람이 한 번 열어본 것만 셉니다.**
   장난 제보 한 건에 지역 색이 바뀌면 지도를 믿을 수 없게 되기 때문입니다.
   ⚠️ 그래서 아무도 상태를 안 바꾸면 지도는 계속 0건입니다. */
var LIVE = ['검토중', '후보'];

/* 시도 코드 → 이름. `public/data/map-sido.json` 과 같은 값입니다.
   코드만 적어 두면 시트를 읽을 때마다 눈으로 옮겨야 해서 이름도 함께 적습니다.
   ⚠️ 36 은 전남과 광주가 합쳐진 코드입니다(2026 통합). 지도 쪽과 같이 맞춰야 합니다. */
var SIDO = {
  '11': '서울특별시', '21': '부산광역시', '22': '대구광역시', '23': '인천광역시',
  '25': '대전광역시', '26': '울산광역시', '29': '세종특별자치시', '31': '경기도',
  '32': '강원도', '33': '충청북도', '34': '충청남도', '35': '전라북도',
  '36': '전남광주통합특별시', '37': '경상북도', '38': '경상남도', '39': '제주특별자치도'
};

/* 한 칸에 들어올 수 있는 글자 수. 넘으면 자릅니다.
   시트 한 칸의 한계는 5만 자인데, 그보다 먼저 사람이 못 읽습니다. */
var MAX_LEN = 5000;

/* 사진. 폼이 캔버스로 1600px·품질 0.82 로 줄여 보내므로 실제로는 한 장에
   1MB 를 넘지 않습니다. 이 상한은 브라우저를 거치지 않고 바로 찔러 넣는 쪽에만
   의미가 있습니다 — 드라이브 용량을 지키려는 것입니다. */
var MAX_PHOTOS = 3;
var MAX_PHOTO_BYTES = 2 * 1024 * 1024;
var ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];


/**
 * ★ 붙여넣고 딱 한 번 누르는 것 — 편집기 위쪽에서 `setUp` 을 골라 ▶ 실행.
 *
 * 시트 탭과 사진 폴더를 **미리** 만들어 둡니다. 안 눌러도 첫 제보가 들어올 때
 * 저절로 만들어지지만, 그러면 나눠 줄 것이 없어 **나중에 또 들어와야 합니다.**
 * 미리 만들어 두면 배포하기 전에 시트와 폴더를 검토자들에게 한 번에 나눠 줄 수 있습니다.
 *
 * 실행하면 아래 '실행 로그' 에 나눠 줄 주소 둘이 찍힙니다.
 * 권한을 묻는 창이 뜨면 허용하세요 — 시트·드라이브·메일 셋이 필요합니다.
 */
function setUp() {
  var sh = sheet();                       // 없으면 만들고 꾸밉니다
  var folder = photoFolder();             // 없으면 만듭니다

  var lines = [
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '준비가 끝났습니다. 아래 둘을 검토자들에게 나눠 주세요.',
    '',
    '1) 시트 — 편집자로 (상태를 바꿔야 합니다)',
    '   ' + SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    '',
    '2) 사진 폴더 — 뷰어로 (읽기만 하면 됩니다)',
    '   ' + folder.getParents().next().getUrl(),
    '',
    '⚠️ 둘 다 "링크가 있는 모든 사용자" 로 열지 마세요.',
    '   시트에는 회신용 이메일이, 폴더에는 제보 사진이 들어 있습니다.',
    '   사람을 하나씩 더하는 방식만 씁니다.',
    '',
    '다음은 배포입니다 — 배포 › 새 배포 › 웹 앱,',
    '실행 계정 "나", 액세스 권한 "모든 사용자".',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  ];
  console.log(lines.join('\n'));
  return sh.getName() + ' 탭과 사진 폴더를 만들었습니다.';
}


/**
 * 폼이 부르는 곳. 화면에서 text/plain 으로 보내므로 본문을 직접 JSON 으로 읽습니다.
 * (application/json 으로 보내면 브라우저가 먼저 OPTIONS 를 던지는데,
 *  Apps Script 웹앱은 거기에 답하지 않아 CORS 에서 막힙니다.)
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return reply(false, '빈 요청');

    var d = JSON.parse(e.postData.contents);
    if (d.form !== 'dok-report') return reply(false, '모르는 폼');

    /* 허니팟 — 사람에게는 안 보이는 칸입니다. 채워져 있으면 자동 프로그램입니다.
       조용히 성공으로 답합니다. 막혔다고 알려 주면 다음에 피해서 옵니다. */
    if (trim(d.website)) return reply(true, '');

    var detail = cut(d.detail);
    var photos = Array.isArray(d.photos) ? d.photos.slice(0, MAX_PHOTOS) : [];

    /* 사진만 있고 글이 없는 제보도 받습니다 — 사진이 곧 증거입니다. */
    if (!detail && photos.length === 0) {
      return reply(false, '제보 내용을 적거나 사진을 올려주세요.');
    }
    if (detail && detail.length < 10 && photos.length === 0) {
      return reply(false, '제보 내용을 조금만 더 자세히 적어주세요.');
    }

    var email = cut(d.email);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply(false, '이메일 주소를 다시 확인해주세요.');
    }

    /* 지도용 지역 코드. 형식이 안 맞으면 비웁니다 — 제보 자체는 살립니다. */
    var sido = /^\d{2}$/.test(trim(d.sido)) ? trim(d.sido) : '';

    var now = new Date();
    var links = savePhotos(photos, now);

    /* 마지막 `접수` 는 상태 칸의 첫 값입니다. 비워 두면 안 됩니다 —
       비어 있으면 필터 보기(`상태 = 접수`)로 밀린 것을 못 찾고,
       '아직 아무도 안 봤다' 와 '누가 실수로 지웠다' 를 구별할 수도 없습니다.
       뒤 세 칸(검토한 사람·검토한 날·메모)은 빈 채로 남습니다. */
    /* 동의 문구의 판 번호가 그대로 들어옵니다(예: `2026-09-07`).
       ⚠️ 비어 있어도 제보를 버리지 않습니다 — 화면에서 이미 두 번 막았고,
          이 스크립트를 사이트보다 먼저 배포하면 아직 옛 화면을 보고 있는
          사람의 제보가 통째로 튕기기 때문입니다. 빈 칸은 옛 화면에서 온 것입니다. */
    var row = [now, CURRENT_ROUND, SIDO[sido] || '', sido, cut(d.region),
               detail, links.join('\n'), email, utmText(d.utm), cut(d.consent),
               STATES[0]];

    sheet().appendRow(row);
    notify(row, links.length);
    return reply(true, '');

  } catch (err) {
    /* 실패해도 무엇이 왔는지는 남겨야 고칠 수 있습니다. 본문은 남기지 않습니다 —
       개인정보가 로그로 새어 나가지 않게 하려는 것입니다. */
    console.error(err);
    return reply(false, '접수 중 문제가 생겼습니다. 잠시 후 다시 시도해주세요.');
  }
}


/**
 * 지도가 부르는 곳 — `?action=regions` 로 **건수만** 내줍니다.
 *
 * 제보 '내용'은 여기서 절대 나가지 않습니다. 시민이 쓴 글을 확인 없이 공개하면
 * 사실 확인이 안 된 지목이 그대로 노출되기 때문입니다.
 * 내용 공개는 검토를 마친 것만 사람이 골라 화면에 옮겨 적습니다.
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  if (action !== 'regions') {
    return ContentService
      .createTextOutput('밑빠진 독상 제보 접수처입니다. 폼에서만 씁니다.')
      .setMimeType(ContentService.MimeType.TEXT);
  }

  var round = (e.parameter.round || '').replace(/\D/g, '');   // 없으면 전체 합계
  var key = 'regions:' + (round || 'all');

  /* 지도는 페이지를 열 때마다 한 번씩 부릅니다. 시트를 매번 훑을 이유가 없어
     1분 동안 답을 재워 둡니다. 상태를 바꿔도 늦어야 1분 뒤에는 지도에 뜹니다. */
  var cache = CacheService.getScriptCache();
  var hit = cache.get(key);
  if (hit) return ContentService.createTextOutput(hit)
    .setMimeType(ContentService.MimeType.JSON);

  var out = { ok: true, total: 0, sido: {}, sigungu: {} };
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.name);
    var last = sh ? sh.getLastRow() : 0;
    if (last > 1) {
      /* 세 칸만 읽습니다 — 회차·시도코드·상태. 제보 내용은 읽지도 않습니다. */
      var roundCol = 2, sidoCol = 4, statusCol = SHEET.head.length + 1;
      var rows = sh.getRange(2, 1, last - 1, statusCol).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (LIVE.indexOf(trim(rows[i][statusCol - 1])) < 0) continue;
        if (round && String(rows[i][roundCol - 1]) !== round) continue;
        out.total++;
        var code = trim(rows[i][sidoCol - 1]);
        if (code) out.sido[code] = (out.sido[code] || 0) + 1;
      }
    }
  } catch (err) {
    /* 지도는 수상 내역만으로도 볼 수 있어야 하므로, 실패해도 빈 집계를 줍니다. */
    console.error(err);
    out = { ok: false, total: 0, sido: {}, sigungu: {} };
  }

  var body = JSON.stringify(out);
  if (out.ok) cache.put(key, body, 60);
  return ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * 여럿이 검토하기 위한 것 — `상태` 를 고치면 **누가 언제 고쳤는지** 옆 칸에 적힙니다.
 *
 * 손으로 적게 두면 아무도 안 적습니다. 그러면 넷이 같은 제보를 세 번 읽고,
 * 아무도 안 읽은 제보가 남습니다. 이 함수 하나가 그것을 막습니다.
 *
 * 시트를 여는 것만으로 도는 단순 트리거라 따로 설치할 것이 없습니다.
 * ⚠️ 대신 권한이 없어 메일 같은 것은 못 보냅니다 — 칸을 채우는 일만 합니다.
 * ⚠️ `e.user` 는 같은 도메인(action.or.kr) 안에서만 이름이 나옵니다.
 *    바깥 계정이면 비워 둡니다 — 그 사람이 손으로 적으면 됩니다.
 */
function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  if (sh.getName() !== SHEET.name) return;

  var statusCol = SHEET.head.length + 1;
  if (e.range.getColumn() !== statusCol || e.range.getRow() < 2) return;

  var row = e.range.getRow();
  var who = '';
  try { who = (e.user && e.user.getEmail()) || ''; } catch (err) { who = ''; }

  sh.getRange(row, statusCol + 1).setValue(who);
  sh.getRange(row, statusCol + 2).setValue(new Date());
}


/* ── 아래는 거들기만 하는 것들 ───────────────────────────────── */

/* 탭 하나에 다 모읍니다. 회차별로 나누지 않습니다 —
   밀린 것을 한 곳에서 훑을 수 있어야 하고, 구글 시트는 줄이 몇만 개여도 멀쩡합니다.
   회차별로 보고 싶으면 나누는 게 아니라 필터 보기(`회차 = 41`)로 봅니다. */
function sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.name);
  if (!sh) {
    sh = ss.insertSheet(SHEET.name);
    setUpSheet(sh);
  }
  return sh;
}

/* 탭이 처음 생길 때 한 번만 합니다 — 읽을 수 있게 꾸미는 일입니다.
   이걸 안 하면 긴 제보가 한 줄로 뭉개지고, 검토했는지 적을 칸도 없습니다.
   ⚠️ 이미 만들어진 탭에는 안 걸립니다. 편집기에서 `setUpSheet(제보시트)` 를 직접 부르세요. */
function setUpSheet(sh) {
  var head = SHEET.head.concat(TRACK);
  var n = head.length;

  sh.appendRow(head);
  sh.getRange(1, 1, 1, n)
    .setFontWeight('bold')
    .setBackground('#e2f5fd')
    .setVerticalAlignment('middle');
  sh.setFrozenRows(1);

  /* 접수시각 — 로케일에 따라 다르게 보이지 않게 못 박습니다. */
  sh.getRange(2, 1, sh.getMaxRows() - 1, 1).setNumberFormat('yyyy-MM-dd HH:mm');
  sh.setColumnWidth(1, 130);

  /* 시도코드는 `11` 같은 두 자리입니다. 숫자로 두면 앞의 0 이 날아가고
     `09` 가 `9` 가 됩니다 — 지도가 못 알아봅니다. 글자로 못 박습니다. */
  sh.getRange(2, 4, sh.getMaxRows() - 1, 1).setNumberFormat('@');

  for (var i = 1; i <= n; i++) {
    if (SHEET.wide.indexOf(i) >= 0) {
      sh.setColumnWidth(i, 460);
      sh.getRange(2, i, sh.getMaxRows() - 1, 1).setWrap(true);
    } else if (i > 1) {
      sh.setColumnWidth(i, 130);
    }
  }

  /* 상태 칸은 골라 넣게 합니다 — 사람마다 다르게 적으면 세지를 못하고,
     지도가 보는 값(LIVE)과 어긋나면 제보가 있어도 지도가 0건이 됩니다. */
  var statusCol = SHEET.head.length + 1;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATES, true)
    .setAllowInvalid(false)
    .build();
  sh.getRange(2, statusCol, sh.getMaxRows() - 1, 1).setDataValidation(rule);

  sh.getRange(2, statusCol + 2, sh.getMaxRows() - 1, 1).setNumberFormat('yyyy-MM-dd');
  sh.setColumnWidth(statusCol + 1, 190);   // 검토한 사람 (메일 주소가 들어갑니다)
  sh.setColumnWidth(n, 300);               // 메모
  sh.getRange(2, n, sh.getMaxRows() - 1, 1).setWrap(true);
}

/**
 * 사진을 드라이브에 넣고 링크만 돌려줍니다.
 * 실패해도 제보 자체는 살립니다 — 사진 때문에 제보를 통째로 잃는 편이 더 나쁩니다.
 */
function savePhotos(photos, when) {
  var links = [];
  if (!photos.length) return links;

  var folder;
  try {
    folder = photoFolder();
  } catch (err) {
    console.error('폴더를 열지 못했습니다', err);
    return links;
  }

  var stamp = Utilities.formatDate(when, 'Asia/Seoul', 'yyyyMMdd-HHmmss');
  for (var i = 0; i < photos.length; i++) {
    try {
      var p = photos[i] || {};
      var type = trim(p.type).toLowerCase();
      if (ALLOWED_TYPES.indexOf(type) < 0) continue;

      /* 폼은 데이터 URL 의 머리(`data:image/jpeg;base64,`)를 떼고 보냅니다.
         그래도 남아 오는 경우가 있어 여기서 한 번 더 떼어 냅니다. */
      var raw = String(p.data || '').replace(/^data:[^,]*,/, '');
      var bytes = Utilities.base64Decode(raw);
      if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) continue;

      var ext = type.split('/')[1];
      var blob = Utilities.newBlob(bytes, type, stamp + '-' + (i + 1) + '.' + ext);
      links.push(folder.createFile(blob).getUrl());
    } catch (err) {
      console.error('사진을 저장하지 못했습니다', err);
    }
  }
  return links;
}

/* 이번 회차 사진 폴더. 없으면 만듭니다.
   찾은 폴더 번호는 스크립트 속성에 적어 둡니다 — 제보마다 드라이브를 뒤지지
   않으려는 것입니다. 사람이 폴더를 옮기거나 지우면 다시 찾습니다. */
function photoFolder() {
  var name = '제' + CURRENT_ROUND + '회';
  var props = PropertiesService.getScriptProperties();
  var key = 'photoFolder:' + CURRENT_ROUND;

  var id = props.getProperty(key);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { props.deleteProperty(key); }
  }

  var folder = childFolder(childFolder(DriveApp.getRootFolder(), PHOTO_ROOT), name);
  props.setProperty(key, folder.getId());
  return folder;
}

function childFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function notify(row, photoCount) {
  /* 메일에는 '무엇이 들어왔는지'만 적고 제보 내용과 회신 이메일은 넣지 않습니다.
     메일함은 시트보다 오래 남고 여기저기 전달되기 때문입니다.
     실제 내용은 시트에서 봅니다 — 그래서 링크를 함께 보냅니다. */
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = [
    '제보가 한 건 들어왔습니다.',
    '',
    '받은 때 : ' + Utilities.formatDate(row[0], 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
    '회차    : 제' + row[1] + '회',
    '지역    : ' + (row[2] || '(안 적음)'),
    '사진    : ' + (photoCount ? photoCount + '장' : '없음'),
    '',
    '내용은 시트에서 보세요 —',
    ss.getUrl(),
    '',
    '읽으셨으면 `상태` 를 바꿔 주세요. 검토중·후보로 바꾼 것만 지도에 오릅니다.',
    '',
    '— 밑빠진 독상 접수처가 자동으로 보낸 메일입니다.'
  ];
  MailApp.sendEmail(NOTIFY_TO, '[밑빠진 독상] 제보 1건', lines.join('\n'));
}

/* 유입 경로는 한 칸에 `utm_source=…, utm_medium=…` 꼴로 눌러 적습니다.
   JSON 을 그대로 넣으면 시트에서 읽을 수가 없습니다. */
function utmText(utm) {
  if (!utm || typeof utm !== 'object') return '';
  var out = [];
  for (var k in utm) { if (utm[k]) out.push(k + '=' + String(utm[k])); }
  return out.join(', ').slice(0, 300);
}

function reply(ok, why) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: ok, error: why }))
    .setMimeType(ContentService.MimeType.JSON);
}

function trim(v) { return (typeof v === 'string') ? v.trim() : ''; }
function cut(v) { var s = trim(v); return s.length > MAX_LEN ? s.slice(0, MAX_LEN) + '…' : s; }
