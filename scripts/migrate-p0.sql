-- P0: claim_event audit trail + ensure multi-doc uniqueness is dropped.
CREATE TABLE IF NOT EXISTS claim_event (
  id text PRIMARY KEY,
  "claimId" text NOT NULL,
  "partnerId" text NOT NULL,
  type text NOT NULL,
  "actorUserId" text,
  "actorRole" text,
  "documentId" text,
  "documentKind" text,
  meta text NOT NULL DEFAULT '{}',
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claim_event_claim_id_idx ON claim_event ("claimId");
CREATE INDEX IF NOT EXISTS claim_event_created_at_idx ON claim_event ("createdAt");

-- Allow multiple document files per (claim, kind).
ALTER TABLE claim_document DROP CONSTRAINT IF EXISTS "claim_document_claim_kind_unique";
