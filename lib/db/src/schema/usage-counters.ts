import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Call counters for the OCR routes, one row per caller per hour or day (see
 * artifacts/api-server/src/lib/usage-limits.ts). Rows past expires_at are
 * swept by the api-server.
 *
 * The api-server also creates this table itself if it is missing, so a
 * deployment whose database was never pushed still limits calls. Keep the two
 * definitions identical (middlewares/ocrGuard.ts).
 */
export const usageCountersTable = pgTable("usage_counters", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
