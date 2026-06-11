#!/bin/bash
set -e
pnpm install --frozen-lockfile
psql "$DATABASE_URL" -f lib/db/migrations/0001_tax_tip_as_percent.sql
psql "$DATABASE_URL" -f lib/db/migrations/0002_bill_users_tip_percent_override.sql
psql "$DATABASE_URL" -f lib/db/migrations/0003_users_first_last_name.sql
psql "$DATABASE_URL" -f lib/db/migrations/0004_rename_bill_tables.sql
psql "$DATABASE_URL" -f lib/db/migrations/0005_guest_bills.sql
psql "$DATABASE_URL" -f lib/db/migrations/0006_bill_line_position.sql
psql "$DATABASE_URL" -f lib/db/migrations/0007_original_description.sql
psql "$DATABASE_URL" -f lib/db/migrations/0008_circles.sql
psql "$DATABASE_URL" -f lib/db/migrations/0009_unique_names.sql
pnpm --filter db push --force
