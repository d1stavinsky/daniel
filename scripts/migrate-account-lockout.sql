-- Account lockout / brute-force protection on Better Auth "user" table.
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts" integer NOT NULL DEFAULT 0;

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "lockedAt" timestamp;

CREATE INDEX IF NOT EXISTS user_locked_at_idx ON "user" ("lockedAt")
  WHERE "lockedAt" IS NOT NULL;
