/**
 * Add and backfill claim.customerName.
 * Usage: node --import tsx --env-file=.env.local scripts/migrate-customer-name.ts
 */

import { pool } from "@/lib/db"

const STATEMENTS = [
  `ALTER TABLE claim ADD COLUMN IF NOT EXISTS "customerName" text`,
  `UPDATE claim SET "customerName" = "clientName" WHERE "customerName" IS NULL OR btrim("customerName") = ''`,
  `ALTER TABLE claim ALTER COLUMN "customerName" SET NOT NULL`,
]

async function main() {
  for (const statement of STATEMENTS) {
    await pool.query(statement)
    console.log("[customer-name-migration] ok:", statement.slice(0, 70) + "…")
  }
  const result = await pool.query(
    `SELECT count(*)::int AS missing FROM claim WHERE "customerName" IS NULL OR btrim("customerName") = ''`,
  )
  if (result.rows[0]?.missing !== 0) throw new Error("customerName backfill incomplete")
  console.log("[customer-name-migration] verified")
}

main()
  .catch((error) => {
    console.error("[customer-name-migration] failed", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
