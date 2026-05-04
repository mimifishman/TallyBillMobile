-- Migration: rename bill_line_users → bill_line_members,
--            bill_members ↔ bill_users (swapped),
--            and rename the bill_user_id column in the junction table.
--
-- "bill_users" was people added to a bill for cost-splitting.
-- "bill_members" was authenticated app users who have access to a bill.
-- After the rename:
--   bill_members = cost-splitting participants
--   bill_users   = authenticated app users with bill access
--   bill_line_members = junction between line items and participants

DO $$
BEGIN
  -- Step 1: Rename bill_members → temporary name (to allow the swap)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'bill_members'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'bill_users_tmp'
  ) THEN
    ALTER TABLE bill_members RENAME TO bill_users_tmp;
  END IF;

  -- Step 2: Rename bill_users → bill_members
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'bill_users'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'bill_members'
  ) THEN
    ALTER TABLE bill_users RENAME TO bill_members;
  END IF;

  -- Step 3: Rename temporary → bill_users
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'bill_users_tmp'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'bill_users'
  ) THEN
    ALTER TABLE bill_users_tmp RENAME TO bill_users;
  END IF;

  -- Step 4: Rename bill_line_users → bill_line_members
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'bill_line_users'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'bill_line_members'
  ) THEN
    ALTER TABLE bill_line_users RENAME TO bill_line_members;
  END IF;

  -- Step 5: Rename column bill_user_id → bill_member_id in bill_line_members
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bill_line_members' AND column_name = 'bill_user_id'
  ) THEN
    ALTER TABLE bill_line_members RENAME COLUMN bill_user_id TO bill_member_id;
  END IF;
END $$;
