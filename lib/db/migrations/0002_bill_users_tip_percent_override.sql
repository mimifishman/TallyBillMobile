-- Migration: rename tip_override -> tip_percent_override on bill_users
-- The column now stores a tip percentage (e.g. 20.0 for 20%) instead of a fixed dollar amount.
-- Existing overrides are reset to NULL (persons will use the bill-level tip % by default).
-- Safe to run multiple times and on fresh databases.

DO $$
BEGIN
  -- Only run if bill_users table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'bill_users'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'bill_users' AND column_name = 'tip_override'
    ) THEN
      ALTER TABLE bill_users RENAME COLUMN tip_override TO tip_percent_override;
      -- Reset to NULL: old dollar overrides are not valid as percentages
      UPDATE bill_users SET tip_percent_override = NULL;
    END IF;

    -- Ensure column type is numeric(10,4) if the column now exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'bill_users' AND column_name = 'tip_percent_override'
    ) THEN
      ALTER TABLE bill_users
        ALTER COLUMN tip_percent_override TYPE numeric(10,4) USING tip_percent_override::numeric(10,4);
    END IF;
  END IF;
END $$;
