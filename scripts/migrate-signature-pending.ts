"use server"

/**
 * Apply signature-pending columns on claim_document.
 * Usage: npx tsx --env-file=.env.local scripts/migrate-signature-pending.ts
 */

import { readFileSync } from "fs"
import { join } from "path"
import { pool } from "@/lib/db"

async function main() {
  const sql = readFileSync(join(process.cwd(), "scripts/migrate-signature-pending.sql"), "utf8")
  await pool.query(sql)
  console.log("[signature-pending-migration] applied successfully")
}

main()
  .catch((err) => {
    console.error("[signature-pending-migration] failed", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
