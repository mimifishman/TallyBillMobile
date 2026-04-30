-- Migration: rename tax_amount/tip_amount to tax_percent/tip_percent
-- These columns now store percentage values (e.g. 8.5 for 8.5%) instead of dollar amounts.
-- Safe to run multiple times (checks column existence before renaming).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bills' AND column_name = 'tax_amount'
  ) THEN
    ALTER TABLE bills RENAME COLUMN tax_amount TO tax_percent;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bills' AND column_name = 'tip_amount'
  ) THEN
    ALTER TABLE bills RENAME COLUMN tip_amount TO tip_percent;
  END IF;
END $$;
