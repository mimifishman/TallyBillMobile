-- Migration: drop bill_lines.discount_label.
--
-- The column held how a receipt worded a discount, e.g. "25% Happy Hour". It
-- was written and never read. What the app shows is worked out from
-- original_total and total, which is what fixed three problems at once: a
-- stored label goes stale when a price is edited, is lost by any write that
-- forgets to send it, and differed between items depending on where the
-- discount came from.
--
-- RUN THIS AFTER the code that stops writing the column is deployed, never
-- before. The previous build maps discount_label in its Drizzle schema, so it
-- names the column in every bill_lines SELECT and INSERT; dropping it while
-- that build is still serving would break reading and adding bill lines.
--
-- Nothing else reads the column, so no data is copied out first.

ALTER TABLE "bill_lines" DROP COLUMN IF EXISTS "discount_label";
