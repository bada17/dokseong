import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const database = new DatabaseSync(":memory:");
const readMigration = (path) =>
  readFileSync(path, "utf8").replaceAll("--> statement-breakpoint", "");

database.exec(readMigration("drizzle/0000_serious_marvel_zombies.sql"));
database
  .prepare(
    "INSERT INTO reports(round, project_name, detail, sido, sigungu) VALUES (?, ?, ?, ?, ?)"
  )
  .run(41, "테스트", "기존 데이터", "11", "11010");
database.exec(readMigration("drizzle/0001_slimy_mentallo.sql"));

const columns = database.prepare("PRAGMA table_info(reports)").all().map((row) => row.name);
const row = database
  .prepare("SELECT id, round, project_name, detail, sido, sigungu, photos FROM reports")
  .get();

if (!columns.includes("photos")) throw new Error("photos column missing");
if (
  row.id !== 1 ||
  row.round !== 41 ||
  row.project_name !== "테스트" ||
  row.detail !== "기존 데이터" ||
  row.sido !== "11" ||
  row.sigungu !== "11010" ||
  row.photos !== null
) {
  throw new Error("existing row was not preserved");
}

database
  .prepare(
    "INSERT INTO reports(round, project_name, detail, sido, sigungu) VALUES (?, ?, ?, ?, ?)"
  )
  .run(41, "광주 테스트", "지역 코드 이동", "24", "24110");

const regionMigration = readFileSync(
  "migrations/2026-08-24-gwangju-to-jeonnam.sql",
  "utf8"
);
database.exec(regionMigration);
database.exec(regionMigration);

const moved = database
  .prepare("SELECT sido, sigungu FROM reports WHERE project_name = ?")
  .get("광주 테스트");

if (moved.sido !== "36" || moved.sigungu !== "24110") {
  throw new Error("Gwangju report migration failed or changed sigungu");
}

console.log("migration_ok");
