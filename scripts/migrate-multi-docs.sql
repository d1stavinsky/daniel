-- Allow multiple document files per (claim, kind), e.g. several accident photos.
ALTER TABLE claim_document DROP CONSTRAINT IF EXISTS "claim_document_claim_kind_unique";
