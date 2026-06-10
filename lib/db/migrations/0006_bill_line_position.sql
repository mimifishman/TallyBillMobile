-- Migration: add position column to bill_lines for stable item ordering
-- Backfills existing rows so they retain their current ID-based order.

ALTER TABLE bill_lines
  ADD COLUMN IF NOT EXISTS position DOUBLE PRECISION;

UPDATE bill_lines SET position = id WHERE position IS NULL;
