#!/bin/bash
set -e
pnpm install --frozen-lockfile
psql "$DATABASE_URL" -f lib/db/migrations/0001_tax_tip_as_percent.sql
psql "$DATABASE_URL" -f lib/db/migrations/0002_bill_users_tip_percent_override.sql
pnpm --filter db push
