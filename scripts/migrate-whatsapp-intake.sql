-- WhatsApp Intake: partner sender phone + claim client phone / source
ALTER TABLE partner
  ADD COLUMN IF NOT EXISTS "whatsappPhone" text;

CREATE UNIQUE INDEX IF NOT EXISTS partner_whatsapp_phone_unique
  ON partner ("whatsappPhone")
  WHERE "whatsappPhone" IS NOT NULL;

ALTER TABLE claim
  ADD COLUMN IF NOT EXISTS "clientPhone" text;

ALTER TABLE claim
  ADD COLUMN IF NOT EXISTS "intakeSource" text NOT NULL DEFAULT 'admin';
