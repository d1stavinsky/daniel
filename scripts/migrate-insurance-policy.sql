-- Add the dedicated Stage-2 insurance-policy slot to existing claims.
INSERT INTO claim_document (
  id,
  "claimId",
  "partnerId",
  kind,
  status,
  note,
  "updatedAt",
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  c.id,
  c."partnerId",
  'insurance_policy',
  'pending',
  '',
  NOW(),
  NOW()
FROM claim c
WHERE NOT EXISTS (
  SELECT 1
  FROM claim_document d
  WHERE d."claimId" = c.id
    AND d.kind = 'insurance_policy'
);
