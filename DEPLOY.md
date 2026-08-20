# 배포 요청 (2026-08-20)

**요청: 비공개로 한 번 올려주세요.** 아직 공개할 상태가 아니고, 실제 화면에서
계속 고칠 예정입니다. 공개 전환은 나중에 따로 요청드리겠습니다.

Claude는 코드만 고치고 배포는 하지 않습니다. 이 문서는 배포하는 쪽에서 볼 내용입니다.

---

## 1. 무엇을 배포하는가

밑빠진 독상 사이트. **Cloudflare Pages + Functions**입니다. 빌드 단계가 없습니다.

```
public/          그대로 서비스되는 정적 파일 (index.html, privacy.html, data/)
functions/api/   파일 하나가 곧 주소 하나
  report.js      POST /api/report   시민 제보 접수
  regions.js     GET  /api/regions  지역별 제보 건수
  join.js        POST /api/join     감시 참여 접수
                 GET  /api/join     사업별 참여자 수
schema.sql       D1 테이블 정의
wrangler.toml    Pages 설정 · 회차 번호
```

예산게임(budget-mbti)의 Vite + Worker 구성은 일부러 따라가지 않았습니다.
번들러도 마이그레이션 도구도 없고, `wrangler.toml`과 `schema.sql`이 전부입니다.

## 2. 처음 한 번 해야 하는 것

```bash
# D1 만들기 → 출력된 database_id 를 wrangler.toml 에 붙여넣기
npx wrangler d1 create dokseong

# 테이블 만들기
npx wrangler d1 execute dokseong --remote --file=schema.sql

# 제보자 IP 를 원본 저장하지 않기 위한 소금값
npx wrangler pages secret put IP_SALT
```

`wrangler.toml` 의 `database_id` 가 지금 `REPLACE_WITH_D1_DATABASE_ID` 입니다.

`[vars]` 두 개는 분기마다 바뀝니다.

| 변수 | 지금 값 | 뜻 |
|---|---|---|
| `CURRENT_ROUND` | `"41"` | 진행 중인 회차 |
| `REPORT_OPEN` | `"1"` | `"0"` 이면 제보 접수가 닫힘 |

## 3. 비공개로 두는 방법

Pages 배포 주소는 그 자체로는 공개입니다. 접근을 막는 쪽을 권합니다.

**권장 — Cloudflare Access (Zero Trust)**
Pages 프로젝트에 Access 정책을 걸어 지정한 이메일만 들어오게 합니다.
링크를 아는 사람도 이메일 인증을 통과해야 하고, 나중에 정책만 지우면
그대로 공개로 전환됩니다. 무료 플랜에 소수 인원용으로 포함돼 있으니
현재 한도는 확인 부탁드립니다.

**대안 — preview 배포만 쓰기**
`main` 을 production 에 연결하지 않고 preview 주소만 공유하는 방법입니다.
주소를 모르면 못 들어오지만 *주소가 새면 그대로 열립니다.* 임시로만 쓰세요.
`public/privacy.html` 에는 이미 `noindex` 를 넣어 두었고, 비공개 기간에는
`index.html` 에도 넣는 편이 안전합니다.

## 4. ⚠️ 지금 정하면 나중이 편한 것 — 주소

**커스텀 도메인을 처음부터 붙여 주세요.** 예: `dok.action.or.kr`

`*.pages.dev` 주소만 쓰다가 나중에 플랫폼을 옮기면 그때까지 공유한 링크,
뉴스레터에 실린 주소, QR 코드가 전부 죽습니다. 커스텀 도메인이면 DNS 만
돌리면 되고 사람들이 보는 주소는 그대로입니다.

플랫폼을 바꿀 가능성이 있다고 하셨으니, 이건 지금이 제일 쌉니다.

## 5. 나중에 플랫폼을 바꿀 때 무엇이 걸리는가

| 옮기는 것 | 난이도 | 비고 |
|---|---|---|
| `public/` 정적 파일 | 그대로 | 어느 호스팅이든 올리면 끝 |
| `functions/api/*.js` | 손봐야 함 | Pages Functions 형식(`onRequestPost`)이라 Netlify·Vercel로 가면 시그니처를 고쳐야 합니다. 파일 3개, 로직은 그대로 |
| **D1 데이터** | **여기가 핵심** | `npx wrangler d1 export dokseong --remote --output=backup.sql` 로 뽑습니다. SQLite 표준 SQL이라 Postgres·MySQL로도 옮길 수 있지만, 옮기기 전에 반드시 이 파일을 확보해야 합니다 |
| 주소 | 커스텀 도메인이면 무통증 | 위 4번 |

정적 화면만 놓고 보면 이 사이트는 **한 파일**(`public/index.html`)입니다.
CSS 를 전부 `#dok` 안에 가두고 클래스에 `dok-` 접두사를 붙여 두었기 때문에,
캠페이너스 같은 CMS 페이지에 통째로 붙여넣어도 바깥을 건드리지 않습니다.
움직이는 부분(제보·참여 저장)만 서버가 필요합니다.

## 6. ⚠️ 개인정보 — 공개 전환 전에 반드시

`participations` 표에 **이름·이메일·휴대전화번호**가 들어갑니다.

1. **`public/privacy.html` 이 아직 초안입니다.** 노란 배경으로 표시한 16곳
   (법인 명칭, 개인정보보호 책임자와 연락처, 위탁업체, 보유기간, 시행일)을
   채우기 전에는 공개하면 안 됩니다.
2. **비공개 기간의 테스트 데이터를 공개 시점에 지워 주세요.** 시험 삼아 넣은
   제보·참여가 실제 집계에 섞이면 되돌리기 어렵습니다.
   ```sql
   DELETE FROM participations;
   DELETE FROM reports;
   ```
3. 백업 파일에도 전화번호가 그대로 담깁니다. 백업을 어디에 두는지 정해 주세요.

## 7. 지금 화면에 예시 데이터인 것

배포 후 확인하실 때 참고하시라고 적습니다. 화면에도 "예시 데이터입니다"라고
표시해 두었습니다.

- 예산감시 사업 4건과 그 상세 보고서 본문
- 투표 후보 5개 (투표 자체는 접어 두었습니다 — 12월 왕중왕전 예정)
- 첫 화면 지표의 **1,000억 원** — 아직 확인되지 않은 값입니다.
  40회까지 수상 사업의 사업비 합계로 뜻을 좁혀 두었으니 실제 값으로 바꿔야 합니다
- GA4 측정 ID (`G-XXXXXXXXXX`)
- 사업 이미지 — 자리만 있고 파일이 없습니다

## 8. 확인 부탁드릴 것

배포 후 아래 두 가지만 실제로 눌러봐 주시면 됩니다. API 가 200을 준다는 것과
사람이 끝까지 간다는 것은 다른 얘기라서요.

1. **제보** — 지도에서 지역을 고르고 "이 지역 예산낭비 제보하기" →
   팝업에서 제출 → D1 `reports` 에 지역 코드까지 들어갔는지
2. **참여** — 진행 중인 사업의 "이 감시에 참여하기" → 제출 →
   `participations` 에 `consented_at` 과 `consent_version` 이 채워졌는지,
   같은 이메일로 다시 넣었을 때 행이 하나로 유지되는지
