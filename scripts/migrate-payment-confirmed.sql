-- Stage 6 resolution gate: manual payment confirmation before claim close.
ALTER TABLE claim
  ADD COLUMN IF NOT EXISTS "paymentConfirmedAt" timestamp;

-- Re-open claims that were auto-closed on document completion only.
UPDATE claim
SET status = 'open', "updatedAt" = NOW()
WHERE status = 'closed'
  AND "paymentConfirmedAt" IS NULL;
