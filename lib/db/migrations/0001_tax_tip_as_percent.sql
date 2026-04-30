-- Migration: rename tax_amount/tip_amount to tax_percent/tip_percent
-- These columns now store percentage values (e.g. 8.5 for 8.5%) instead of dollar amounts.
-- Existing dollar values are reset to 0 because they cannot be meaningfully converted
-- to percentages without knowing the original subtotal at time of entry.
-- Safe to run multiple times (checks column existence before renaming).

DO $$
BEGIN
  -- Rename tax_amount -> tax_percent if old column still exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bills' AND column_name = 'tax_amount'
  ) THEN
    ALTER TABLE bills RENAME COLUMN tax_amount TO tax_percent;
    -- Reset to 0: old dollar values are not valid as percentages
    UPDATE bills SET tax_percent = '0';
  END IF;

  -- Rename tip_amount -> tip_percent if old column still exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bills' AND column_name = 'tip_amount'
  ) THEN
    ALTER TABLE bills RENAME COLUMN tip_amount TO tip_percent;
    -- Reset to 0: old dollar values are not valid as percentages
    UPDATE bills SET tip_percent = '0';
  END IF;

  -- Ensure column type is numeric(10,4) regardless of rename status
  ALTER TABLE bills
    ALTER COLUMN tax_percent TYPE numeric(10,4) USING tax_percent::numeric(10,4);
  ALTER TABLE bills
    ALTER COLUMN tip_percent TYPE numeric(10,4) USING tip_percent::numeric(10,4);
END $$;
