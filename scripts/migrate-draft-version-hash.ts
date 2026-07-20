"use server"

/**
 * Apply draftVersionHash column on claim_document.
 * Usage: npx tsx --env-file=.env.local scripts/migrate-draft-version-hash.ts
 */

import { readFileSync } from "fs"
import { join } from "path"
import { pool } from "@/lib/db"

async function main() {
  const sql = readFileSync(join(process.cwd(), "scripts/migrate-draft-version-hash.sql"), "utf8")
  await pool.query(sql)
  console.log("[draft-version-hash-migration] applied successfully")
}

main()
  .catch((err) => {
    console.error("[draft-version-hash-migration] failed", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
