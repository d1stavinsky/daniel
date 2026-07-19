-- Hard Stage 6 guard: no closed claim without manual payment confirmation.
UPDATE claim
SET status = 'open', "updatedAt" = NOW()
WHERE status = 'closed'
  AND "paymentConfirmedAt" IS NULL;

ALTER TABLE claim
  DROP CONSTRAINT IF EXISTS claim_closed_requires_payment_confirmed;

ALTER TABLE claim
  ADD CONSTRAINT claim_closed_requires_payment_confirmed
  CHECK (status <> 'closed' OR "paymentConfirmedAt" IS NOT NULL);
