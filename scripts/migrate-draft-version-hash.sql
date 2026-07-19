-- Demand letter draft version hash (Priority 2 fail-safe).
ALTER TABLE claim_document
  ADD COLUMN IF NOT EXISTS "draftVersionHash" text;
