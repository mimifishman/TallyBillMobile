---
name: Bill table swap bug
description: bill_users and bill_members can end up swapped in the DB; how it happened and how to detect/fix it.
---

## The rule
If the API throws "Failed query: select ... from bill_users" with no rows or a column-not-found error, check whether `bill_users` actually has a `name` column. That means the tables are swapped.

**Why:** Migration 0004 (`0004_rename_bill_tables.sql`) performs a three-step swap (bill_members → tmp, bill_users → bill_members, tmp → bill_users). Each step is guarded by IF EXISTS / IF NOT EXISTS. If both tables already existed when the migration ran, all three steps were skipped silently — leaving the DB in the inverted state. Migration 0009 then successfully added a unique constraint on `bill_users(bill_id, name)` (the wrong table), making it harder to spot.

**How to apply:** When diagnosing 500s on `/api/bills` or `POST /api/bills`, run:
```sql
SELECT table_name, column_name FROM information_schema.columns
WHERE table_name IN ('bill_users','bill_members') ORDER BY table_name, ordinal_position;
```
Correct state: `bill_users` has `user_id, role, joined_at`; `bill_members` has `name, color, tip_percent_override`.
Inverted state: `bill_users` has `name, color`; `bill_members` has `user_id, role`.

Fix: migration `0011_fix_bill_table_swap.sql` detects the inverted state (checks for `name` column on `bill_users`) and swaps the tables. It is idempotent.
