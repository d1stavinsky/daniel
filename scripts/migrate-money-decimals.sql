-- Allow decimal ILS amounts (agora / 2 decimal places) on claims + audit trail.
-- Safe to re-run: integer → numeric(14,2) preserves existing whole-shekel values.

ALTER TABLE claim
  ALTER COLUMN "requestedAmount" TYPE numeric(14, 2) USING "requestedAmount"::numeric(14, 2),
  ALTER COLUMN "receivedAmount" TYPE numeric(14, 2) USING "receivedAmount"::numeric(14, 2);

ALTER TABLE financial_transaction
  ALTER COLUMN amount TYPE numeric(14, 2) USING amount::numeric(14, 2),
  ALTER COLUMN "previousAmount" TYPE numeric(14, 2) USING "previousAmount"::numeric(14, 2);
