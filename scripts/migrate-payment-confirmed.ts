"use server"

/**
 * Apply Stage 6 payment gate migration (column + reopen auto-closed claims).
 * Usage: npx tsx --env-file=.env.local scripts/migrate-payment-confirmed.ts
 */

import { readFileSync } from "fs"
import { join } from "path"
import { pool } from "@/lib/db"
import { syncClaimProgressFromDocuments } from "@/lib/sync-claim-progress"

async function main() {
  const sql = readFileSync(join(process.cwd(), "scripts/migrate-payment-confirmed.sql"), "utf8")
  await pool.query(sql)
  console.log("[payment-confirmed-migration] SQL applied")

  const reopened = await pool.query<{ id: string }>(
    `SELECT id FROM claim WHERE status = 'open' AND "paymentConfirmedAt" IS NULL`,
  )
  let synced = 0
  for (const row of reopened.rows) {
    await syncClaimProgressFromDocuments(row.id)
    synced++
  }
  console.log(`[payment-confirmed-migration] re-synced ${synced} open claim(s)`)
}

main()
  .catch((err) => {
    console.error("[payment-confirmed-migration] failed", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
