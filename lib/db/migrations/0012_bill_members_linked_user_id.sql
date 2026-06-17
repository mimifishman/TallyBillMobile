-- Migration: add linked_user_id to bill_members for account linking from the bill screen
ALTER TABLE bill_members ADD COLUMN IF NOT EXISTS linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
