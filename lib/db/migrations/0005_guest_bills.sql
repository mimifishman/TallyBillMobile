-- Migration: add guest bill columns to bills table
-- Adds guestOwnerId, isGuestBill, and expiresAt to support unauthenticated
-- bill creation. Existing bills get isGuestBill = false (already the default).

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS guest_owner_id TEXT,
  ADD COLUMN IF NOT EXISTS is_guest_bill BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
