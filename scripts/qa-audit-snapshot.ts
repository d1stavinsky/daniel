/**
 * QA audit snapshot — read-only claim + inbox derivation report.
 * Usage: npx tsx --env-file=.env.local scripts/qa-audit-snapshot.ts
 */

import { eq } from "drizzle-orm"
import { pool } from "@/lib/db"
import { db } from "@/lib/db"
import { claim, claimDocument } from "@/lib/db/schema"
import { deriveClaimNextAction } from "@/lib/ops/next-action"
import { deriveClaimProgressStatus } from "@/lib/claim-progress"
import { countUploadedDocs } from "@/lib/sync-claim-progress"
import { countValidatedDocs } from "@/lib/document-workflow-gates"

async function main() {
  const claims = await db
    .select({
      id: claim.id,
      status: claim.status,
      paymentConfirmedAt: claim.paymentConfirmedAt,
      receivedAmount: claim.receivedAmount,
      requestedAmount: claim.requestedAmount,
      currentStage: claim.currentStage,
      stageEnteredAt: claim.stageEnteredAt,
    })
    .from(claim)

  console.log("=== CLAIM SNAPSHOT ===")
  for (const c of claims) {
    const uploaded = await countUploadedDocs(c.id)
    const validated = await countValidatedDocs(c.id)
    const progress = deriveClaimProgressStatus(validated, Boolean(c.paymentConfirmedAt))
    console.log(
      JSON.stringify({
        id: c.id,
        status: c.status,
        progress,
        uploaded,
        validated,
        required: 14,
        paymentConfirmed: Boolean(c.paymentConfirmedAt),
        currentStage: c.currentStage,
        received: c.receivedAmount,
      }),
    )
  }

  console.log("\n=== INBOX DERIVATION (open claims) ===")
  for (const c of claims.filter((x) => x.status !== "closed")) {
    const docs = await db
      .select({
        id: claimDocument.id,
        kind: claimDocument.kind,
        status: claimDocument.status,
        blobPathname: claimDocument.blobPathname,
        extractionStatus: claimDocument.extractionStatus,
        extractionConfidence: claimDocument.extractionConfidence,
        stpStatus: claimDocument.stpStatus,
        stpReason: claimDocument.stpReason,
        updatedAt: claimDocument.updatedAt,
      })
      .from(claimDocument)
      .where(eq(claimDocument.claimId, c.id))

    const action = deriveClaimNextAction({
      claimId: c.id,
      clientName: "—",
      partnerId: "—",
      partnerName: "—",
      plate: "—",
      stageEnteredAt: c.stageEnteredAt,
      paymentConfirmed: Boolean(c.paymentConfirmedAt),
      requestedAmount: Number(c.requestedAmount),
      receivedAmount: Number(c.receivedAmount),
      docs: docs.map((d) => ({
        documentId: d.id,
        kind: d.kind,
        status: d.status,
        hasFile: Boolean(d.blobPathname),
        extractionStatus: d.extractionStatus ?? "none",
        extractionConfidence: d.extractionConfidence,
        stpStatus: d.stpStatus ?? "none",
        stpReason: d.stpReason,
        updatedAt: d.updatedAt,
      })),
    })
    console.log(
      `${c.id}: nextAction=${action.nextAction} stage=${action.workflowStage} urgency=${action.urgencyScore} docId=${action.documentId ?? "—"}`,
    )
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
