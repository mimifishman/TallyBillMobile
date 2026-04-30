#!/bin/bash
set -e
pnpm install --frozen-lockfile
psql "$DATABASE_URL" -f lib/db/migrations/0001_tax_tip_as_percent.sql
pnpm --filter db push
