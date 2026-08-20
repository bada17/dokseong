# 배포 요청 (2026-08-20)

**요청: 비공개로 한 번 올려주세요.** 아직 공개할 상태가 아니고, 실제 화면에서
계속 고칠 예정입니다. 공개 전환은 나중에 따로 요청드리겠습니다.

Claude는 코드만 고치고 배포는 하지 않습니다. 이 문서는 배포하는 쪽에서 볼 내용입니다.

---

---

## 2026-08-20 추가 — 지금 배포에는 영향 없습니다

배포 중에 제보 사진 기능이 들어갔지만, **첫 배포를 방해하지 않도록 정리해
두었습니다. 지금 `main` 을 그대로 배포하시면 됩니다.** 아래는 배포가 끝난 뒤에
하시면 되는 것들입니다.

### (배포 후) 사진 기능 켜기

제보에 사진을 최대 3장 붙일 수 있게 했습니다. 사진은 D1 에 넣을 수 없어 R2 를 씁니다.
**버킷이 없는 상태로 바인딩이 들어가면 배포가 막힐 수 있어 지금은 꺼 두었습니다.**

```bash
npx wrangler r2 bucket create dokseong-photos
# 그다음 wrangler.toml 맨 아래 [[r2_buckets]] 세 줄의 주석을 풀고 다시 배포
```

켜기 전까지는 **사진을 올려도 저장되지 않고 글만 접수됩니다.** 오류는 나지 않습니다.

> 버킷을 **공개로 열지 마세요.** 제보 사진은 내부 확인용이고, 사람 얼굴이나
> 차량 번호가 찍혀 들어올 수 있습니다. 공개용 엔드포인트는 만들지 않았습니다.

### (확인만) schema.sql 이 바뀌었습니다

`reports` 에 `photos` 칸이 생겼고, `project_name` 이 선택으로 바뀌었습니다.

- **아직 `schema.sql` 을 실행하지 않으셨다면** 최신 파일로 그냥 실행하시면 끝입니다.
- **이미 실행하셨다면** 알려 주세요. 표를 다시 만들어야 하는데, `reports` 에
  실제 데이터가 있는지부터 확인하고 진행해야 합니다.
  (데이터가 없다면 `DROP TABLE reports;` 후 `schema.sql` 재실행이 가장 깔끔합니다.)

### 새로 생긴 환경변수 두 개

```toml
REPORT_DEADLINE = "2026-09-15"
REPORT_DEADLINE_LABEL = "하반기 1차 제보 마감"
```

제보는 상시로 받고, 이 날짜까지 들어온 것을 한 묶음으로 봅니다.
지나도 접수는 계속되고 화면 문구만 바뀝니다.

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

R2 버킷은 첫 배포에 필요하지 않습니다 — 위 "사진 기능 켜기" 를 보세요.

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

## 4. 주소 — `dok.action.or.kr` 로 정했습니다

`*.pages.dev` 주소만 쓰면 나중에 플랫폼을 옮길 때 그때까지 공유한 링크,
뉴스레터에 실린 주소, QR 코드가 전부 죽습니다. 커스텀 도메인이면 DNS 만
돌리면 되고 사람들이 보는 주소는 그대로입니다. 그래서 처음부터 붙입니다.

### 확인한 DNS 상태 (2026-08-20, 공개 조회)

```
action.or.kr          NS  cns1~cns4.hostcocoa.com
cns1.hostcocoa.com    →   205.251.196.138
205.251.196.138       역조회 →  ns-1162.awsdns-17.org     ← AWS Route 53
zzz-test-random.action.or.kr → action.or.kr 과 같은 주소  ← 와일드카드
dok.action.or.kr      →   CloudFront 403 (설정된 배포가 없음)
```

**`cns1~4.hostcocoa.com` 은 AWS Route 53 네임서버입니다.**
이름만 호스트코코아로 바꿔 단 것(화이트라벨)이고, 실제 DNS 는 **AWS Route 53**
에서 돌아갑니다. `hostcocoa.com` 자체는 웹사이트가 응답하지 않습니다.

그래서 레코드를 넣을 곳은 호스트코코아 관리자 페이지가 아니라
**action.or.kr 이 들어 있는 AWS 계정의 Route 53 호스팅 영역**입니다.
호스트코코아가 그 계정을 대행 관리하고 있을 가능성이 큽니다.

`*.action.or.kr` 와일드카드가 걸려 있어 `dok.action.or.kr` 도 CloudFront 로
가는데, CloudFront 에 그 호스트 이름으로 설정된 배포가 없어서 **403** 이 납니다.
지금 브라우저로 열면 이 403 이 보입니다 — 정상입니다. CNAME 을 넣으면 사라집니다.

### 그래서 필요한 순서

1. Pages 프로젝트를 먼저 만들어 `<프로젝트>.pages.dev` 주소를 확보
2. Pages → Custom domains 에 `dok.action.or.kr` 추가
3. **Route 53 의 action.or.kr 호스팅 영역에** CNAME 추가
   ```
   레코드 이름   dok.action.or.kr
   유형          CNAME
   값            <프로젝트>.pages.dev
   ```
   와일드카드(`*.action.or.kr`)보다 이 레코드가 우선합니다.
4. Pages 에서 검증이 끝나면 인증서는 Cloudflare 가 발급합니다

**3번은 Claude 도 GPT 도 할 수 없습니다.** 그 AWS 계정에 들어갈 수 있는 사람
(시민행동 웹 담당 또는 호스트코코아)이 넣어야 합니다. 누가 넣을지 정해 주세요.

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
3. **글 없이 사진만** 제출해도 접수되는지 (일부러 허용했습니다)
   — R2 버킷을 만든 뒤에 확인하시면 됩니다
