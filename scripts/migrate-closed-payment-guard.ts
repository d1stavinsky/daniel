"use server"

/**
 * Apply DB-level Stage 6 close guard.
 * Usage: npx tsx --env-file=.env.local scripts/migrate-closed-payment-guard.ts
 */

import { readFileSync } from "fs"
import { join } from "path"
import { pool } from "@/lib/db"

async function main() {
  const sql = readFileSync(join(process.cwd(), "scripts/migrate-closed-payment-guard.sql"), "utf8")
  await pool.query(sql)
  console.log("[closed-payment-guard] applied successfully")
}

main()
  .catch((err) => {
    console.error("[closed-payment-guard] failed", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
