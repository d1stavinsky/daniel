/**
 * Backfill the Stage 3 attorney-fee invoice row on every existing claim and
 * recalculate denormalized progress. Idempotent: ensureDocRows only inserts
 * missing canonical kinds.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/migrate-attorney-fee-invoice.ts
 */

import { db, pool } from "@/lib/db"
import { claim } from "@/lib/db/schema"
import { ensureDocRows } from "@/lib/claim-documents"
import { syncClaimProgressFromDocuments } from "@/lib/sync-claim-progress"

async function main() {
  const claims = await db
    .select({ id: claim.id, partnerId: claim.partnerId, status: claim.status })
    .from(claim)

  let reopened = 0
  for (const row of claims) {
    await ensureDocRows(row.id, row.partnerId)
    const result = await syncClaimProgressFromDocuments(row.id)
    if (row.status === "closed" && result.progressStatus !== "completed") reopened += 1
  }

  console.log(
    `[attorney-fee-migration] processed=${claims.length} reopened=${reopened} requiredDocs=14`,
  )
}

main()
  .catch((err) => {
    console.error("[attorney-fee-migration] failed", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
