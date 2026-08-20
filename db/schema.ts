import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const reports = sqliteTable(
  "reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    round: integer("round").notNull(),
    projectName: text("project_name").notNull(),
    region: text("region"),
    detail: text("detail").notNull(),
    email: text("email"),
    sido: text("sido"),
    sigungu: text("sigungu"),
    status: text("status").notNull().default("new"),
    memo: text("memo"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    utm: text("utm"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_reports_round").on(table.round, table.createdAt),
    index("idx_reports_status").on(table.status),
    index("idx_reports_iphash").on(table.ipHash, table.createdAt),
    index("idx_reports_sido").on(table.sido),
    index("idx_reports_sigungu").on(table.sigungu),
  ]
);
export const participations = sqliteTable(
  "participations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campaignId: text("campaign_id").notNull(),
    campaignName: text("campaign_name"),
    round: integer("round"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    consentPrivacy: integer("consent_privacy").notNull().default(0),
    consentNews: integer("consent_news").notNull().default(0),
    consentVersion: text("consent_version"),
    consentedAt: text("consented_at"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    utm: text("utm"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("idx_part_unique").on(table.campaignId, table.email),
    index("idx_part_campaign").on(table.campaignId, table.createdAt),
  ]
);
