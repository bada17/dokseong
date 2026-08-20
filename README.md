# 밑빠진 독상 (dokseong)

함께하는 시민행동 **밑빠진 독상** 사이트. 2000년 제1회부터 2025년 제40회까지 이어온
예산낭비 감시 활동을, 제41회부터는 **분기마다** 시민 제보와 투표로 함께 만들어갑니다.

```
제보 접수 → 후보 선정 → 시민 투표 → 수상 발표 → 캠페인 서명 → (다음 분기)
```

## 구조

```
dokseong/
├── public/
│   └── index.html          # 페이지 전체 (HTML + CSS + JS 한 파일)
├── functions/
│   └── api/
│       └── report.js       # POST /api/report — 시민 제보 접수
├── schema.sql              # D1 테이블 정의
└── wrangler.toml           # Cloudflare Pages 설정 · 회차 번호
```

**Cloudflare Pages + Functions**를 씁니다. 빌드 단계가 없습니다 —
`public/`은 그대로 서비스되고, `functions/` 안의 파일 하나가 그대로 API 주소가 됩니다
(`functions/api/report.js` → `/api/report`).

> 예산게임(budget-mbti)의 Vite + Worker 구성은 일부러 따라가지 않았습니다.
> 로컬에서 DB 붙이는 것만도 손이 많이 가는 구조라, 여기서는 단순한 쪽을 골랐습니다.

## CSS 범위 규칙 (중요)

나중에 이 페이지를 **캠페이너스 홈페이지 안에 통째로 붙여넣을** 예정입니다.
그래서 모든 CSS 규칙이 `#dok` 안에 갇혀 있고, 클래스는 전부 `dok-` 로 시작합니다.

- ❌ `.card { ... }`, `body { ... }`, `* { ... }`
- ✅ `#dok .dok-card { ... }`

전역 선택자를 쓰면 붙여넣는 순간 홈페이지 전체 레이아웃이 깨집니다.
전역 규칙은 `html { scroll-behavior }` 하나뿐이고, 이식할 때 그 줄만 지우면 됩니다.
이식 단위는 `public/index.html` 안의 `<div id="dok">` … `</div>` 통째입니다.

## 회차 관리

분기마다 바뀌는 값은 코드가 아니라 `wrangler.toml`의 `[vars]`에 있습니다.

| 변수 | 뜻 |
|---|---|
| `CURRENT_ROUND` | 지금 진행 중인 회차 (제41회 = `"41"`) |
| `REPORT_OPEN` | `"0"`으로 두면 제보 접수가 닫힘 |

## 처음 한 번 해야 하는 세팅

```bash
# 1. D1 데이터베이스 만들기
npx wrangler d1 create dokseong
#    → 출력된 database_id를 wrangler.toml에 붙여넣기

# 2. 테이블 만들기
npx wrangler d1 execute dokseong --remote --file=schema.sql

# 3. IP 해시용 소금값 (제보자 IP를 원본으로 저장하지 않기 위함)
npx wrangler pages secret put IP_SALT
```

## 로컬에서 보기

```bash
npx wrangler pages dev public --d1 DB=dokseong
npx wrangler d1 execute dokseong --local --file=schema.sql   # 최초 1회
```

DB 없이 화면만 볼 거면 `python -m http.server 8000 -d public` 으로도 충분합니다
(제보 폼만 동작하지 않습니다).

## 지금 상태

| 기능 | 상태 |
|---|---|
| 시민 제보 | ✅ D1에 저장됨 (허니팟 + IP당 10분 5건 제한) |
| 진행 중 / 종료된 예산감시 사업 목록 | 🔜 작업 중 |
| 캠페인 서명 (이름·이메일·전화번호) | ⬜ 개인정보 동의 절차부터 설계 필요 |
| 시민 투표 | ⬜ 지금은 데모 — 새로고침하면 초기화 |
| 회차별 결과 아카이브 | ⬜ |
| GA4 | ⬜ `G-XXXXXXXXXX` 자리표시자 |

## 배포

**배포는 GPT/Codex 담당입니다.** Claude는 코드만 수정하고 배포하지 않습니다.
