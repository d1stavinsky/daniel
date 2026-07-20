-- Signature pending workflow (Priority 1 fail-safe).
ALTER TABLE claim_document
  ADD COLUMN IF NOT EXISTS "draftBlobPathname" text,
  ADD COLUMN IF NOT EXISTS "draftGeneratedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "signatureStatus" text;
