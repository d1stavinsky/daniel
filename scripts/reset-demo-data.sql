-- AXIS go-live reset (PostgreSQL)
-- Wipes demo/business data; preserves admin users.
-- Claim IDs are text (CLM-####), not sequences — after wipe the app
-- allocates CLM-1001 (CLAIM_ID_BASE=1000 in app/actions/claims.ts).
--
-- Prefer the TypeScript script (transactional + integrity checks):
--   npm run reset:demo
--
-- If you run this SQL manually, wrap in a transaction and verify admins remain.

BEGIN;

DELETE FROM financial_transaction;
DELETE FROM claim_document;
DELETE FROM claim_stage;
DELETE FROM notification;
DELETE FROM claim;

-- Remove partner login users (and their auth rows)
DELETE FROM session
WHERE "userId" IN (SELECT id FROM "user" WHERE role IS DISTINCT FROM 'admin');

DELETE FROM account
WHERE "userId" IN (SELECT id FROM "user" WHERE role IS DISTINCT FROM 'admin');

DELETE FROM "user"
WHERE role IS DISTINCT FROM 'admin';

DELETE FROM partner;

-- Sanity checks (should return zeros / only admins)
-- SELECT count(*) FROM partner;
-- SELECT count(*) FROM claim;
-- SELECT email, role FROM "user";

COMMIT;
