/**
 * Add the dedicated insurance_policy document slot to existing claims.
 * Usage: npx tsx --env-file=.env.local scripts/migrate-insurance-policy.ts
 */

import { readFileSync } from "fs"
import { join } from "path"
import { pool } from "@/lib/db"

async function main() {
  const sql = readFileSync(join(process.cwd(), "scripts/migrate-insurance-policy.sql"), "utf8")
  const result = await pool.query(sql)
  console.log(`[insurance-policy-migration] inserted ${result.rowCount ?? 0} document slot(s)`)
}

main()
  .catch((err) => {
    console.error("[insurance-policy-migration] failed", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
