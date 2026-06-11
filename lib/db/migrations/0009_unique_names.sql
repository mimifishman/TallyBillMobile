-- Migration: enforce unique names within a circle and within a bill
-- Deduplicates existing rows (keeps the lowest id per group) before adding constraints.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'circle_members_circle_id_name_unique'
      AND table_name = 'circle_members'
  ) THEN
    DELETE FROM circle_members
    WHERE id NOT IN (
      SELECT MIN(id) FROM circle_members GROUP BY circle_id, name
    );
    ALTER TABLE circle_members
      ADD CONSTRAINT circle_members_circle_id_name_unique UNIQUE (circle_id, name);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'bill_users_bill_id_name_unique'
      AND table_name = 'bill_users'
  ) THEN
    DELETE FROM bill_line_members
    WHERE bill_member_id IN (
      SELECT id FROM bill_users
      WHERE id NOT IN (
        SELECT MIN(id) FROM bill_users GROUP BY bill_id, name
      )
    );
    DELETE FROM bill_users
    WHERE id NOT IN (
      SELECT MIN(id) FROM bill_users GROUP BY bill_id, name
    );
    ALTER TABLE bill_users
      ADD CONSTRAINT bill_users_bill_id_name_unique UNIQUE (bill_id, name);
  END IF;
END $$;
