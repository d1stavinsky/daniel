import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { claim, claimDocument, claimStage } from "@/lib/db/schema"
import {
  deriveClaimProgressStatus,
  progressStatusToStage,
  UPLOADED_DOC_STATUSES,
  DOC_KINDS,
  REQUIRED_DOC_COUNT,
  type ClaimProgressStatus,
} from "@/lib/claim-progress"
import { recordClaimEvent } from "@/lib/claim-events"
import { TOTAL_STAGES } from "@/lib/workflow-data"
import { countValidatedDocs } from "@/lib/document-workflow-gates"

/** Count distinct mandatory kinds that have at least one uploaded/approved file. */
export async function countUploadedDocs(claimId: string): Promise<number> {
  const [row] = await db
    .select({
      n: sql<number>`count(distinct ${claimDocument.kind})`.mapWith(Number),
    })
    .from(claimDocument)
    .where(
      and(
        eq(claimDocument.claimId, claimId),
        inArray(claimDocument.kind, DOC_KINDS),
        inArray(claimDocument.status, UPLOADED_DOC_STATUSES),
        sql`${claimDocument.blobPathname} is not null`,
      ),
    )
  return Number(row?.n) || 0
}

/**
 * Keep the legacy 9-row claim_stage ledger aligned with document-driven progress
 * so leftover stage consumers and stuck scans never disagree.
 */
async function mirrorClaimStages(
  claimId: string,
  progressStatus: ClaimProgressStatus,
  now: Date,
): Promise<void> {
  const rows = await db.select({ id: claimStage.id, stage: claimStage.stage }).from(claimStage).where(eq(claimStage.claimId, claimId))
  if (rows.length === 0) return

  for (const row of rows) {
    let status: "pending" | "in-progress" | "done" = "pending"
    if (progressStatus === "completed") {
      status = "done"
    } else if (progressStatus === "pending_resolution") {
      if (row.stage <= 7) status = "done"
      else if (row.stage === 8) status = "in-progress"
      else status = "pending"
    } else if (progressStatus === "pending") {
      status = row.stage === 1 ? "in-progress" : "pending"
    } else {
      // in_progress
      if (row.stage === 1) status = "done"
      else if (row.stage === 2) status = "in-progress"
      else status = "pending"
    }
    await db
      .update(claimStage)
      .set({ status, updatedAt: now })
      .where(and(eq(claimStage.id, row.id), eq(claimStage.claimId, claimId)))
  }

  void TOTAL_STAGES
}

/**
 * Recalculate claim progress from document validation and persist denormalized fields.
 * Stage 6: claims stay open at `pending_resolution` until payment is manually confirmed.
 * A claim is never allowed to remain closed without the explicit payment-confirmation flag.
 */
export async function syncClaimProgressFromDocuments(claimId: string): Promise<{
  progressStatus: ClaimProgressStatus
  uploadedDocCount: number
}> {
  const validatedDocCount = await countValidatedDocs(claimId)

  const [existing] = await db
    .select({
      currentStage: claim.currentStage,
      status: claim.status,
      partnerId: claim.partnerId,
      paymentConfirmedAt: claim.paymentConfirmedAt,
    })
    .from(claim)
    .where(eq(claim.id, claimId))
    .limit(1)

  if (!existing) {
    const progressStatus = deriveClaimProgressStatus(validatedDocCount, false)
    return { progressStatus, uploadedDocCount: validatedDocCount }
  }

  const paymentConfirmed = Boolean(existing.paymentConfirmedAt)
  const progressStatus = deriveClaimProgressStatus(validatedDocCount, paymentConfirmed)
  const nextStage = progressStatusToStage(progressStatus)
  // Never auto-close: only explicit payment confirmation reaches completed → closed.
  const nextClaimStatus = progressStatus === "completed" ? "closed" : "open"

  const changed = existing.currentStage !== nextStage || existing.status !== nextClaimStatus
  const now = new Date()

  await db
    .update(claim)
    .set({
      currentStage: nextStage,
      status: nextClaimStatus,
      ...(changed ? { stageEnteredAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(claim.id, claimId))

  try {
    await mirrorClaimStages(claimId, progressStatus, now)
  } catch (err) {
    console.log("[sync] mirrorClaimStages failed:", err instanceof Error ? err.message : String(err))
  }

  if (changed) {
    await recordClaimEvent({
      claimId,
      partnerId: existing.partnerId,
      type: "progress_synced",
      meta: {
        progressStatus,
        uploadedDocCount: validatedDocCount,
        validatedDocCount,
        requiredDocCount: REQUIRED_DOC_COUNT,
        currentStage: nextStage,
        paymentConfirmed,
      },
    })
  }

  if (progressStatus === "completed" && existing.status !== "closed") {
    const { dispatchWebhook } = await import("@/lib/webhooks/dispatch")
    dispatchWebhook("claim.completed", {
      claimId,
      partnerId: existing.partnerId,
      uploadedDocCount: validatedDocCount,
      validatedDocCount,
      requiredDocCount: REQUIRED_DOC_COUNT,
    })
  }

  return { progressStatus, uploadedDocCount: validatedDocCount }
}
