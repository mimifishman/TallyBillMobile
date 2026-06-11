-- Migration: add circles and circle_members tables for the My Circles feature

CREATE TABLE IF NOT EXISTS circles (
  id SERIAL PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS circles_owner_user_id_idx ON circles(owner_user_id);

CREATE TABLE IF NOT EXISTS circle_members (
  id SERIAL PRIMARY KEY,
  circle_id INTEGER NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS circle_members_circle_id_idx ON circle_members(circle_id);
