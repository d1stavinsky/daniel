"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireStaff } from "@/lib/session"
import { requireDocumentAccess } from "@/lib/tenant"
import { recordClaimEvent } from "@/lib/claim-events"
import {
  dismissStpException,
  listStpExceptions,
  runStpMissingDocChase,
  type ChaseScanResult,
  type ExceptionQueueItem,
} from "@/lib/stp/engine"
import { db } from "@/lib/db"
import { claimDocument } from "@/lib/db/schema"
import { DEMAND_CONTENT_MISMATCH } from "@/lib/demand-letter-hash"
import { isInternalAuditReason } from "@/lib/stp/cross-field"
import { assertAttorneySignatureVerifiedForApproval } from "@/lib/demand-letter"
import { syncClaimProgressFromDocuments } from "@/lib/sync-claim-progress"

export async function getStpExceptionQueue(): Promise<ExceptionQueueItem[]> {
  await requireStaff()
  return listStpExceptions()
}

export async function runStpChaseScan(): Promise<ChaseScanResult> {
  await requireStaff()
  return runStpMissingDocChase()
}

/** Staff: mark exception handled (remove from queue without changing doc status). */
export async function clearStpException(documentId: string): Promise<void> {
  const actor = await requireStaff()
  const { doc } = await requireDocumentAccess(documentId)
  if (doc.stpReason === DEMAND_CONTENT_MISMATCH) {
    throw new Error("לא ניתן לדחות אי-התאמת גרסה — יש להעלות מחדש את הסריקה החתומה הנכונה.")
  }
  if (isInternalAuditReason(doc.stpReason)) {
    throw new Error("לא ניתן לדחות ביקורת פנימית — יש לתקן את סכומי הדרישה/שמאות תחילה.")
  }
  await dismissStpException(documentId, actor.id)
  await recordClaimEvent({
    claimId: doc.claimId,
    partnerId: doc.partnerId,
    type: "stp_exception",
    actorUserId: actor.id,
    actorRole: actor.role,
    documentId,
    documentKind: doc.kind,
    meta: { action: "dismissed" },
  })
  revalidatePath("/admin")
}

/** Staff: approve doc from exception queue (manual STP override). */
export async function approveExceptionDocument(documentId: string): Promise<void> {
  const actor = await requireStaff()
  const { doc } = await requireDocumentAccess(documentId)
  if (doc.stpReason === DEMAND_CONTENT_MISMATCH) {
    throw new Error("לא ניתן לאשר מסמך עם אי-התאמת גרסה — יש להעלות מחדש את הסריקה החתומה הנכונה.")
  }
  if (isInternalAuditReason(doc.stpReason)) {
    throw new Error("לא ניתן לאשר מסמך בביקורת פנימית — יש לתקן את סכומי הדרישה/שמאות תחילה.")
  }
  assertAttorneySignatureVerifiedForApproval({
    kind: doc.kind,
    signatureStatus: doc.signatureStatus,
  })
  const now = new Date()
  await db
    .update(claimDocument)
    .set({
      status: "approved",
      note: "",
      extractionStatus: doc.extractionStatus === "failed" ? doc.extractionStatus : "reviewed",
      extractionReviewedAt: now,
      extractionReviewedBy: actor.id,
      stpStatus: "none",
      stpReason: "אושר ידנית מתור החריגים",
      stpDecidedAt: now,
      updatedAt: now,
    })
    .where(eq(claimDocument.id, documentId))

  await recordClaimEvent({
    claimId: doc.claimId,
    partnerId: doc.partnerId,
    type: "doc_approved",
    actorUserId: actor.id,
    actorRole: actor.role,
    documentId,
    documentKind: doc.kind,
    meta: { via: "exception_queue" },
  })

  await syncClaimProgressFromDocuments(doc.claimId)
  const { dispatchWebhook } = await import("@/lib/webhooks/dispatch")
  dispatchWebhook("claim.document_approved", {
    claimId: doc.claimId,
    partnerId: doc.partnerId,
    documentId,
    documentKind: doc.kind,
    via: "exception_queue",
  })
  revalidatePath("/admin")
  revalidatePath("/dashboard")
}
