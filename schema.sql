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
  project_name  TEXT    NOT NULL,          -- 사업명
  region        TEXT,                      -- 지역·기관
  detail        TEXT    NOT NULL,          -- 제보 내용
  email         TEXT,                      -- 회신용 (선택 입력)

  -- 지역. 지도에 찍기 위해 코드로 받는다.
  -- 통계청 2018 행정구역 코드 체계 (public/data/map-*.json과 같은 값)
  --   sido    두 자리  예: 11 서울, 31 경기
  --   sigungu 다섯 자리 예: 11010 종로구, 31180 하남시
  -- 중앙부처 제보처럼 지역이 없으면 둘 다 비운다.
  sido          TEXT,
  sigungu       TEXT,

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
