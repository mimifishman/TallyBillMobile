-- Migration: discounts on a bill and on its lines.
--
-- A discount is stored on the line it applies to, as MONEY rather than as a
-- rate. Receipts round their own discounts their own way — a "25% Happy Hour"
-- on 57.00 prints as -14.00 where the arithmetic says 14.25 — so a stored rate
-- would make the app disagree with the paper in the user's hand. The percent is
-- what someone types; the amount is what is kept.
--
-- Because `total` stays the amount actually charged, every existing sum keeps
-- working untouched: each person's share is still total / people-on-the-line,
-- and tax and tip still follow from those shares.

ALTER TABLE bills ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(10, 4) NOT NULL DEFAULT 0;

ALTER TABLE bill_lines ADD COLUMN IF NOT EXISTS original_total NUMERIC(10, 2);
ALTER TABLE bill_lines ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE bill_lines ADD COLUMN IF NOT EXISTS discount_label TEXT;
