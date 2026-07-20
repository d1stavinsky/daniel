-- Claim accountability: multi-contributor names on claim rows.
-- createdAt / createdBy already exist on claim.

ALTER TABLE claim
  ADD COLUMN IF NOT EXISTS contributors text NOT NULL DEFAULT '[]';
