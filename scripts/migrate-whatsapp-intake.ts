/**
 * Apply WhatsApp Intake columns (partner.whatsappPhone, claim.clientPhone, claim.intakeSource).
 * Statements run one-by-one (Neon poolers can mishandle multi-statement batches).
 * Usage: npx tsx --env-file=.env.local scripts/migrate-whatsapp-intake.ts
 */

import { pool } from "@/lib/db"

const STATEMENTS = [
  `ALTER TABLE partner ADD COLUMN IF NOT EXISTS "whatsappPhone" text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS partner_whatsapp_phone_unique ON partner ("whatsappPhone") WHERE "whatsappPhone" IS NOT NULL`,
  `ALTER TABLE claim ADD COLUMN IF NOT EXISTS "clientPhone" text`,
  `ALTER TABLE claim ADD COLUMN IF NOT EXISTS "intakeSource" text NOT NULL DEFAULT 'admin'`,
]

async function main() {
  for (const sql of STATEMENTS) {
    await pool.query(sql)
    console.log("[whatsapp-intake-migration] ok:", sql.slice(0, 60) + "…")
  }

  // Confirm the column listPartners needs.
  await pool.query(`SELECT "whatsappPhone" FROM "partner" LIMIT 1`)
  console.log("[whatsapp-intake-migration] verified: partner.whatsappPhone selectable")
}

main()
  .catch((err) => {
    console.error("[whatsapp-intake-migration] failed", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
