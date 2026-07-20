-- P2: IDP extraction columns on claim_document (pilot kinds).
ALTER TABLE claim_document ADD COLUMN IF NOT EXISTS extracted_data text;
ALTER TABLE claim_document ADD COLUMN IF NOT EXISTS "extractionStatus" text NOT NULL DEFAULT 'none';
ALTER TABLE claim_document ADD COLUMN IF NOT EXISTS "extractionConfidence" integer;
ALTER TABLE claim_document ADD COLUMN IF NOT EXISTS "extractionModel" text;
ALTER TABLE claim_document ADD COLUMN IF NOT EXISTS "extractionError" text;
ALTER TABLE claim_document ADD COLUMN IF NOT EXISTS "extractionReviewedAt" timestamp;
ALTER TABLE claim_document ADD COLUMN IF NOT EXISTS "extractionReviewedBy" text;

CREATE INDEX IF NOT EXISTS claim_document_extraction_status_idx
  ON claim_document ("extractionStatus");
