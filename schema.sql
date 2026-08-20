-- 밑빠진 독상 DB 스키마 (Cloudflare D1 / SQLite)
--
-- 적용:
--   npx wrangler d1 execute dokseong --remote --file=schema.sql
--   npx wrangler d1 execute dokseong --local  --file=schema.sql   (로컬 테스트용)
--
-- 밑빠진 독상은 분기마다 한 번씩 돈다. 그래서 거의 모든 표에
-- `round`(회차) 칸이 있다. 제41회 = 41.

-- ── 시민 제보 ────────────────────────────────────────────────
-- 사이클의 입구. 여기 쌓인 제보에서 그 분기 후보를 고른다.
CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  round         INTEGER NOT NULL,
  -- 사업명은 선택입니다. 일반 시민은 「○○천 수변경관 개선사업」 같은
  -- 정식 명칭을 모릅니다. 필수로 두면 이미 답을 아는 사람만 제보하게 됩니다.
  project_name  TEXT,                      -- 사업명 (알면 적는 정도)
  region        TEXT,                      -- 지역·기관
  detail        TEXT,                      -- 제보 내용 (사진만 제보할 수도 있음)
  email         TEXT,                      -- 회신용 (선택 입력)

  -- 지역. 지도에 찍기 위해 코드로 받는다.
  -- 통계청 2018 행정구역 코드 체계 (public/data/map-*.json과 같은 값)
  --   sido    두 자리  예: 11 서울, 31 경기
  --   sigungu 다섯 자리 예: 11010 종로구, 31180 하남시
  -- 중앙부처 제보처럼 지역이 없으면 둘 다 비운다.
  sido          TEXT,
  sigungu       TEXT,

  -- 제보 사진. R2에 올리고 키 목록만 JSON 배열로 둔다.
  -- 예: ["reports/41/9f2c….jpg"]
  photos        TEXT,

  -- new: 접수됨 / reviewing: 검토 중 / candidate: 후보로 채택
  -- dropped: 후보 탈락 / spam: 스팸
  status        TEXT    NOT NULL DEFAULT 'new',
  memo          TEXT,                      -- 내부 검토 메모

  ip_hash       TEXT,                      -- 원본 IP는 저장하지 않음 (해시만)
  user_agent    TEXT,
  utm           TEXT,                      -- 유입 경로 (JSON 문자열)
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_round  ON reports(round, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
-- 같은 사람이 같은 내용을 연타로 넣는 것을 막기 위한 조회용
CREATE INDEX IF NOT EXISTS idx_reports_iphash ON reports(ip_hash, created_at DESC);
-- 지도에서 지역별 건수를 셀 때
CREATE INDEX IF NOT EXISTS idx_reports_sido    ON reports(sido);
CREATE INDEX IF NOT EXISTS idx_reports_sigungu ON reports(sigungu);

-- ── 감시 참여 (사업별 서명) ──────────────────────────────
-- "이 감시에 참여하기"로 받는 정보. 개인정보 처리방침의
-- '캠페인 참여·서명' 항목에 해당한다.
--
-- ⚠️ 전화번호가 들어 있는 표입니다.
--    - 조회·내보내기는 담당자만
--    - 보유기간이 지나면 반드시 파기 (방침에 적은 기간)
--    - 백업 파일에도 같이 담기므로 백업 보관에 주의
CREATE TABLE IF NOT EXISTS participations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id   TEXT    NOT NULL,          -- index.html 캠페인 JSON의 id
  campaign_name TEXT,                      -- 당시 사업명 (나중에 제목이 바뀌어도 남게)
  round         INTEGER,

  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL,
  phone         TEXT    NOT NULL,

  -- 동의 기록. 언제, 어떤 문구에 동의했는지 남겨야 나중에 증명이 된다.
  consent_privacy INTEGER NOT NULL DEFAULT 0,  -- 개인정보 수집·이용 (필수)
  consent_news    INTEGER NOT NULL DEFAULT 0,  -- 캠페인 소식·후원 정보 수신
  consent_version TEXT,                        -- 동의문 판 번호
  consented_at    TEXT,

  ip_hash       TEXT,
  user_agent    TEXT,
  utm           TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 같은 사업에 같은 이메일로 두 번 참여하지 않게
CREATE UNIQUE INDEX IF NOT EXISTS idx_part_unique   ON participations(campaign_id, email);
CREATE INDEX        IF NOT EXISTS idx_part_campaign ON participations(campaign_id, created_at DESC);
