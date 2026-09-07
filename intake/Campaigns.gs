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
 * 설치 — 편집기에서 `setUpCampaignForm()` 을 실행하고, 로그가 시키는 대로
 *        **설문지에서 사진 칸 하나만 손으로** 더하면 끝입니다.
 *        로그에 담당자에게 줄 설문지 주소도 함께 찍힙니다.
 *
 * ⚠️ 사진 칸을 코드가 못 만듭니다. Apps Script 의 Forms 서비스에는 파일 올리는
 *    물음을 만드는 길이 없습니다(2026-09-07 확인 — `addFileUploadItem` 은 없는
 *    함수라 `TypeError` 가 납니다). 읽는 쪽은 멀쩡하므로, 사람이 한 번 달아 두면
 *    그 뒤로는 코드가 알아서 읽습니다.
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
 * 설문지를 만들고 이 스프레드시트에 붙입니다.
 *
 * 여러 번 눌러도 됩니다 — 이미 만든 설문지가 있으면 새로 만들지 않고 그것을 다시
 * 씁니다(물음만 지웠다 다시 답니다). 시트에 붙이는 것도 아직 안 붙어 있을 때만 합니다.
 *
 * ⚠️ **사진 칸은 이 코드가 못 만듭니다.** Apps Script 에는 파일 올리는 물음을
 *    만드는 길이 아예 없습니다(`addFileUploadItem` 같은 것이 없습니다).
 *    실행이 끝나면 로그가 시키는 대로 **설문지에서 손으로 한 칸 더하세요.**
 *    안 더해도 나머지는 그대로 돌아갑니다 — 카드가 빈 액자로 둘 뿐입니다.
 */
function setUpCampaignForm() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();

  /* 이미 있는 설문지를 찾습니다. 먼저 적어 둔 번호로, 없으면 이름으로 —
     이름으로도 찾는 이유는 앞서 실패한 실행이 남긴 설문지를 주워 쓰기 위해서입니다.
     그러지 않으면 다시 누를 때마다 못 쓰는 설문지가 드라이브에 쌓입니다. */
  var form = null;
  var saved = props.getProperty('campaignFormId');
  if (saved) {
    try { form = FormApp.openById(saved); }
    catch (err) { props.deleteProperty('campaignFormId'); }
  }
  if (!form) {
    var found = DriveApp.getFilesByName(CAMP.formTitle);
    while (found.hasNext()) {
      var f = found.next();
      if (f.getMimeType() !== MimeType.GOOGLE_FORMS) continue;
      try { form = FormApp.openById(f.getId()); break; } catch (err) { /* 남의 것 */ }
    }
  }
  var isNew = !form;
  if (isNew) form = FormApp.create(CAMP.formTitle);
  props.setProperty('campaignFormId', form.getId());

  form.setDescription(CAMP.formHelp);
  form.setCollectEmail(false);

  /* 물음을 싹 지우고 다시 답니다 — 다시 눌러도 같은 물음이 겹쳐 붙지 않게.
     ⚠️ 손으로 더한 사진 칸도 이때 같이 지워집니다. 다시 더하세요(로그 참고). */
  var had = form.getItems();
  for (var k = had.length - 1; k >= 0; k--) form.deleteItem(had[k]);

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

  /* 사진 칸은 여기 없습니다 — 코드로 만들 수 없어서 사람이 손으로 답니다.
     아래 로그가 순서를 알려 줍니다. 칸이 없어도 `campaignsJson` 은 멀쩡히 돕니다
     (머리글 이름으로 찾으므로, 없으면 사진 없는 것으로 봅니다). */

  /* 이미 붙어 있으면 다시 붙이지 않습니다 — 다시 붙이면 탭이 하나 더 생깁니다.
     ⚠️ `getDestinationId()` 는 안 붙어 있을 때 null 을 주는 게 아니라
        **예외를 던집니다**("The form currently has no response destination").
        그래서 값을 보는 게 아니라 던지는지로 판단합니다. */
  var linked = false;
  try { linked = !!form.getDestinationId(); } catch (err) { linked = false; }
  if (!linked) {
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  }

  /* 설문지가 만든 탭 이름은 제멋대로라 우리 이름으로 바꿔 둡니다.
     (붙인 직후에는 목록에 늦게 잡힐 때가 있어 잠깐 기다립니다.) */
  SpreadsheetApp.flush();
  Utilities.sleep(1500);
  var made = null;
  var sheets = ss.getSheets();
  for (var i = sheets.length - 1; i >= 0; i--) {
    /* 설문지가 안 붙은 탭에서도 안전하게 — 오늘 이 API 들에 두 번 데였습니다. */
    var url = null;
    try { url = sheets[i].getFormUrl(); } catch (err) { url = null; }
    if (url) { made = sheets[i]; break; }
  }
  if (made && made.getName() !== CAMP.sheetName) made.setName(CAMP.sheetName);
  if (made) {
    made.setFrozenRows(1);
    made.getRange(1, 1, 1, made.getLastColumn())
        .setFontWeight('bold').setBackground('#fde8d7');
  }

  /* 사진 칸이 이미 붙어 있는지 봅니다 — 두 번째 실행부터는 사람이 더해 두었을
     수 있는데, 위에서 물음을 싹 지웠으므로 지금은 없는 것이 정상입니다. */
  var hasPhoto = false;
  var now = form.getItems();
  for (var m = 0; m < now.length; m++) {
    if (now[m].getTitle() === CAMP.q.photo) { hasPhoto = true; break; }
  }

  Logger.log(isNew ? '설문지를 새로 만들었습니다.' : '이미 있던 설문지를 다시 썼습니다.');
  Logger.log('');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('★ 아직 한 가지 남았습니다 — 사진 칸을 손으로 더하세요.');
  Logger.log('  Apps Script 로는 파일 올리는 물음을 만들 수 없습니다.');
  Logger.log('');
  Logger.log('  1) 아래 「고칠 때 여는 주소」 를 엽니다');
  Logger.log('  2) 맨 아래 ⊕ (질문 추가) 를 누릅니다');
  Logger.log('  3) 물음 종류를 「파일 업로드」 로 바꿉니다');
  Logger.log('     — 처음이면 "파일 업로드를 사용 설정" 안내가 뜹니다. 계속을 누르세요');
  Logger.log('  4) 제목을 정확히  ' + CAMP.q.photo + '  이라고 적습니다  ← 글자가 다르면 안 읽힙니다');
  Logger.log('  5) 「특정 파일 형식만 허용」 › 이미지, 최대 파일 수 1 로 둡니다');
  Logger.log('  6) 설명에 적어 두면 좋습니다 — "한 장. 없어도 됩니다"');
  Logger.log('');
  Logger.log('  ⚠️ 이 함수를 다시 실행하면 이 칸도 지워집니다. 그때 다시 더하세요.');
  Logger.log('  ⚠️ 안 더해도 나머지는 그대로 돕니다 — 카드가 빈 액자로 둘 뿐입니다.');
  Logger.log('  지금 사진 칸: ' + (hasPhoto ? '있음' : '없음 — 위 순서대로 더하세요'));
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('');
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
