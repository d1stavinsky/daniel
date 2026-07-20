ALTER TABLE claim
  ADD COLUMN IF NOT EXISTS "customerName" text;

UPDATE claim
SET "customerName" = "clientName"
WHERE "customerName" IS NULL OR btrim("customerName") = '';

ALTER TABLE claim
  ALTER COLUMN "customerName" SET NOT NULL;
