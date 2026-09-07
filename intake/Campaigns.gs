/**
 * 밑빠진 독상 — 감시사업 등록 (구글 설문지 → 시트 → 사이트)
 * ─────────────────────────────────────────────────────────────
 * 담당자가 **구글 설문지 하나만 채우면** 사이트의 '예산감시 사업' 칸에 올라갑니다.
 * 코드도, 배포도, 깃허브도 거치지 않습니다.
 *
 *   담당자 → 구글 설문지 (사진 포함)
 *              ↓  응답이 이 스프레드시트의 '감시사업' 탭에 쌓임
 *   사이트 → ?action=campaigns 로 읽어 카드로 그림  (1분마다 새로 봄)
 *
 * ★ 왜 시트를 손으로 안 고치고 설문지인가
 *   시트 칸에는 **사진을 넣을 수 없습니다.** 설문지에는 파일 올리는 칸이 있습니다.
 *   덤으로 필수 칸을 빠뜨릴 수 없고, 남의 줄을 실수로 지울 일도 없습니다.
 *
 * ⚠️ 파일 올리는 칸이 있는 설문지는 **응답자가 구글 로그인**을 해야 합니다.
 *    담당자용이라 괜찮습니다(단체 계정이 이미 구글입니다).
 *
 * ⚠️ 여기 사진은 **공개해도 되는 사진**입니다(사이트에 그대로 걸립니다).
 *    그래서 '링크가 있는 누구나 보기' 로 엽니다.
 *    제보 사진(PHOTO_ROOT)과 **폴더가 다릅니다.** 절대 섞지 마세요.
 *
 * 설치 — 편집기에서 `setUpCampaignForm()` 을 **한 번** 실행하면 끝입니다.
 *        실행 기록(로그)에 담당자에게 줄 설문지 주소가 찍힙니다.
 */

var CAMP = {
  /* 응답이 쌓일 탭 이름. setUpCampaignForm 이 이 이름으로 바꿔 둡니다. */
  sheetName: '감시사업',

  formTitle: '밑빠진 독상 — 감시사업 등록',
  formHelp: '여기 채운 내용이 밑빠진 독상 사이트의 「예산감시 사업」 칸에 그대로 올라갑니다.\n'
          + '다 쓰기 전에는 상태를 「숨김」으로 두세요. 「진행 중」으로 바꾸면 바로 공개됩니다.',

  /* 사업 사진이 들어갈 드라이브 폴더. 제보 사진과 다른 곳입니다. */
  photoFolder: '밑빠진 독상 사업 사진',

  /* 물음의 제목이 곧 시트의 머리글입니다. **여기 말을 바꾸면 시트 머리글도 바꿔야 합니다.**
     자리(몇 번째 칸)가 아니라 이름으로 찾으므로, 물음 순서는 바꿔도 괜찮습니다. */
  q: {
    status:  '상태',
    title:   '사업 이름',
    summary: '한 줄 요약',
    period:  '기간',
    body:    '자세한 내용',
    outcome: '결과 한 줄',
    link:    '관련 링크',
    photo:   '사진'
  },

  /* 화면에 오르는 상태 둘. **그 밖의 값(숨김·빈칸)은 어느 탭에도 안 나옵니다.** */
  states: { '진행 중': 'ongoing', '종료': 'closed' },

  /* 사이트가 1분에 한 번만 시트를 훑게 합니다. 상태를 바꾸면 늦어야 1분 뒤에 반영됩니다. */
  cacheSeconds: 60
};


/**
 * 설문지를 만들고 이 스프레드시트에 붙입니다. **한 번만** 실행하세요.
 * 여러 번 눌러도 설문지가 여러 개 생길 뿐 해가 되지는 않지만, 시트 탭도 같이 늘어납니다.
 */
function setUpCampaignForm() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var form = FormApp.create(CAMP.formTitle);
  form.setDescription(CAMP.formHelp);
  form.setCollectEmail(false);

  form.addMultipleChoiceItem()
      .setTitle(CAMP.q.status)
      .setHelpText('다 쓰기 전에는 「숨김」. 「진행 중」이나 「종료」로 바꾸면 사이트에 뜹니다.')
      .setChoiceValues(['숨김', '진행 중', '종료'])
      .setRequired(true);

  form.addTextItem().setTitle(CAMP.q.title)
      .setHelpText('카드에 크게 뜹니다.').setRequired(true);

  form.addTextItem().setTitle(CAMP.q.summary)
      .setHelpText('카드에 딸리는 한 문장. 무엇이 문제인지 적습니다.').setRequired(true);

  form.addTextItem().setTitle(CAMP.q.period)
      .setHelpText('예) 2026.9 ~   또는   2026.9 ~ 2026.12');

  form.addParagraphTextItem().setTitle(CAMP.q.body)
      .setHelpText('「자세히 보기」를 눌렀을 때 나올 글입니다.\n'
                 + '· 빈 줄 하나로 문단을 나눕니다\n'
                 + '· 줄 맨 앞에 # 을 쓰면 소제목이 됩니다');

  form.addTextItem().setTitle(CAMP.q.outcome)
      .setHelpText('끝난 사업만. 무엇이 바뀌었는지 한 줄.');

  form.addTextItem().setTitle(CAMP.q.link)
      .setHelpText('관련 글이나 자료가 있으면 주소를 붙여넣으세요.');

  form.addFileUploadItem().setTitle(CAMP.q.photo)
      .setHelpText('한 장. 없으면 비워 두세요 — 카드가 알아서 빈 액자로 둡니다.')
      .setMaxFileSize(5 * 1024 * 1024)
      .setMaxFiles(1)
      .setAllowedFileTypes([FormApp.FileType.IMAGE]);

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  /* 설문지가 만든 탭 이름은 제멋대로라 우리 이름으로 바꿔 둡니다.
     (붙인 직후에는 목록에 늦게 잡힐 때가 있어 잠깐 기다립니다.) */
  SpreadsheetApp.flush();
  Utilities.sleep(1500);
  var made = null;
  var sheets = ss.getSheets();
  for (var i = sheets.length - 1; i >= 0; i--) {
    if (sheets[i].getFormUrl()) { made = sheets[i]; break; }
  }
  if (made && made.getName() !== CAMP.sheetName) made.setName(CAMP.sheetName);
  if (made) {
    made.setFrozenRows(1);
    made.getRange(1, 1, 1, made.getLastColumn())
        .setFontWeight('bold').setBackground('#fde8d7');
  }

  Logger.log('setUpCampaignForm: 끝났습니다.');
  Logger.log('담당자에게 줄 주소 — ' + form.getPublishedUrl());
  Logger.log('고칠 때 여는 주소 — ' + form.getEditUrl());
  return form.getPublishedUrl();
}


/**
 * 사이트가 부르는 곳 — `?action=campaigns`.
 * '감시사업' 탭에서 상태가 「진행 중」·「종료」인 줄만 골라 카드 모양으로 내줍니다.
 * 「숨김」과 빈 줄은 나가지 않습니다.
 */
function campaignsJson() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('campaigns');
  if (hit) return hit;

  var out = [];
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CAMP.sheetName);
    var last = sh ? sh.getLastRow() : 0;
    if (sh && last > 1) {
      var wide = sh.getLastColumn();
      var head = sh.getRange(1, 1, 1, wide).getValues()[0];
      var at = {};
      for (var c = 0; c < wide; c++) at[String(head[c]).trim()] = c;

      var rows = sh.getRange(2, 1, last - 1, wide).getValues();
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var pick = function (name) {
          var i = at[CAMP.q[name]];
          return (i === undefined) ? '' : String(row[i] === null ? '' : row[i]).trim();
        };

        var status = CAMP.states[pick('status')];
        var title = pick('title');
        if (!status || !title) continue;

        out.push({
          id: 'camp-' + (r + 2),
          title: title,
          summary: pick('summary'),
          status: status,
          period: pick('period'),
          outcome: pick('outcome'),
          link: pick('link'),
          image: publicPhoto(pick('photo')),
          image_alt: title,
          body: campBody(pick('body'))
        });
      }
    }
  } catch (err) {
    /* 시트가 없거나 읽다 막혀도 빈 목록을 냅니다 — 사이트는 원래 카드를 그대로 둡니다. */
    out = [];
  }

  var text = JSON.stringify(out);
  cache.put('campaigns', text, CAMP.cacheSeconds);
  return text;
}


/* 긴 글 한 덩이를 화면이 아는 모양으로 바꿉니다.
   빈 줄 하나 = 문단, 줄 맨 앞의 # = 소제목. 그 이상은 일부러 안 받습니다 —
   담당자가 규칙을 외워야 하는 것이 늘면 아무도 안 씁니다. */
function campBody(text) {
  if (!text) return [];
  var out = [];
  var blocks = String(text).replace(/\r\n/g, '\n').split(/\n\s*\n/);
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i].trim();
    if (!b) continue;
    var lines = b.split('\n');
    for (var j = 0; j < lines.length; j++) {
      var line = lines[j].trim();
      if (!line) continue;
      if (line.charAt(0) === '#') out.push(['h', line.replace(/^#+\s*/, '')]);
      else if (j === 0) out.push(['p', lines.join(' ').trim()]);
    }
  }
  return out;
}


/* 설문지가 올린 사진을 사이트에서 볼 수 있게 만듭니다.
   시트 칸에는 드라이브 주소가 들어 있으므로 거기서 파일 번호만 뽑습니다.

   ⚠️ 이 사진은 사이트에 그대로 걸리는 **공개 사진**이라 '링크가 있는 누구나 보기'
      로 엽니다. 제보 사진은 절대 이렇게 하지 않습니다 — 폴더부터 다릅니다.
   ⚠️ 드라이브의 보통 주소(`/file/d/…/view`)는 <img> 에서 안 뜹니다.
      그림으로 내주는 `thumbnail` 주소를 씁니다. */
function publicPhoto(cell) {
  if (!cell) return '';
  var m = String(cell).match(/[-\w]{25,}/);
  if (!m) return '';
  var id = m[0];
  try {
    var file = DriveApp.getFileById(id);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    campPhotoFolder().addFile(file);
  } catch (err) {
    /* 권한이 없거나 이미 옮겨진 파일이면 그냥 둡니다 — 주소는 그대로 씁니다. */
  }
  return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600';
}


/* 사업 사진을 담는 폴더. 제보 사진 폴더(PHOTO_ROOT)와 **다른 곳**입니다. */
function campPhotoFolder() {
  var found = DriveApp.getFoldersByName(CAMP.photoFolder);
  return found.hasNext() ? found.next() : DriveApp.createFolder(CAMP.photoFolder);
}
