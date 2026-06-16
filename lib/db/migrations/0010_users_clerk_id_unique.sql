DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'users' AND indexname = 'users_clerk_id_unique'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_clerk_id_unique'
  ) THEN
    DROP INDEX users_clerk_id_unique;
    ALTER TABLE users ADD CONSTRAINT users_clerk_id_unique UNIQUE (clerk_id);
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'users' AND indexname = 'users_clerk_id_unique'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_clerk_id_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_clerk_id_unique UNIQUE (clerk_id);
  END IF;
END $$;
