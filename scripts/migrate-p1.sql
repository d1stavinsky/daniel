-- P1: async document intake jobs (direct-to-Blob + background finalize).
CREATE TABLE IF NOT EXISTS document_job (
  id text PRIMARY KEY,
  "claimId" text NOT NULL,
  "partnerId" text NOT NULL,
  kind text NOT NULL,
  "documentId" text,
  status text NOT NULL DEFAULT 'pending',
  percent integer NOT NULL DEFAULT 0,
  "fileName" text NOT NULL DEFAULT '',
  "fileSize" integer,
  "contentType" text,
  "contentHash" text,
  "blobPathname" text,
  attempts integer NOT NULL DEFAULT 0,
  "maxAttempts" integer NOT NULL DEFAULT 3,
  "lastError" text,
  "clientKey" text,
  "createdBy" text NOT NULL,
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_job_claim_id_idx ON document_job ("claimId");
CREATE INDEX IF NOT EXISTS document_job_status_idx ON document_job (status);
CREATE UNIQUE INDEX IF NOT EXISTS document_job_client_key_uidx
  ON document_job ("clientKey")
  WHERE "clientKey" IS NOT NULL;
