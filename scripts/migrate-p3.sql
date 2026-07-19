-- P3: STP decision columns on claim_document.
ALTER TABLE claim_document ADD COLUMN IF NOT EXISTS "stpStatus" text NOT NULL DEFAULT 'none';
ALTER TABLE claim_document ADD COLUMN IF NOT EXISTS "stpReason" text;
ALTER TABLE claim_document ADD COLUMN IF NOT EXISTS "stpDecidedAt" timestamp;

CREATE INDEX IF NOT EXISTS claim_document_stp_status_idx
  ON claim_document ("stpStatus");
