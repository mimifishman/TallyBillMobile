-- Migration: fix bill_users / bill_members swap
-- The database ended up in the wrong state: bill_users has participant data
-- (name, color, tip_percent_override) and bill_members has authenticated-user
-- access data (user_id, role, joined_at). The ORM schema expects the opposite.
-- This migration detects the inverted state and swaps the tables.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bill_users' AND column_name = 'name'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bill_members' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'bill_users_swap_tmp'
  ) THEN
    ALTER TABLE bill_users RENAME TO bill_users_swap_tmp;
    ALTER TABLE bill_members RENAME TO bill_users;
    ALTER TABLE bill_users_swap_tmp RENAME TO bill_members;
  END IF;
END $$;
