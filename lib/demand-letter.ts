import { put } from "@vercel/blob"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { claim, claimDocument, partner } from "@/lib/db/schema"
import { type DocKind } from "@/lib/documents"
import {
  assertPreviousWorkflowStagesValidated,
  isValidatedDocumentRow,
} from "@/lib/document-workflow-gates"
import { buildVersionedDemandDraftBody } from "@/lib/demand-letter-hash"
import {
  DEMAND_LETTER_KIND,
  SIGNATURE_PENDING,
  SIGNATURE_VERIFIED,
} from "@/lib/demand-letter-shared"

export {
  ATTORNEY_SIGNATURE_REQUIRED_KINDS,
  assertAttorneySignatureVerifiedForApproval,
  DEMAND_LETTER_KIND,
  isAttorneySignatureVerified,
  requiresAttorneySignature,
  SIGNATURE_PENDING,
  SIGNATURE_VERIFIED,
} from "@/lib/demand-letter-shared"

type DemandLetterRow = {
  kind: string
  status: string
  blobPathname: string | null
  stpStatus: string | null
  signatureStatus: string | null
}

export function isDemandSignaturePending(row: DemandLetterRow): boolean {
  return row.kind === DEMAND_LETTER_KIND && row.signatureStatus === SIGNATURE_PENDING
}

export function isDemandLetterValidated(row: DemandLetterRow): boolean {
  return isValidatedDocumentRow(row)
}

async function loadDemandLetterRow(claimId: string) {
  const [row] = await db
    .select({
      id: claimDocument.id,
      partnerId: claimDocument.partnerId,
      kind: claimDocument.kind,
      status: claimDocument.status,
      blobPathname: claimDocument.blobPathname,
      stpStatus: claimDocument.stpStatus,
      signatureStatus: claimDocument.signatureStatus,
      draftBlobPathname: claimDocument.draftBlobPathname,
      draftGeneratedAt: claimDocument.draftGeneratedAt,
      draftVersionHash: claimDocument.draftVersionHash,
    })
    .from(claimDocument)
    .where(and(eq(claimDocument.claimId, claimId), eq(claimDocument.kind, DEMAND_LETTER_KIND)))
    .limit(1)
  return row ?? null
}

/** Stage 2+3 must be validated before generating a demand-letter draft. */
export async function assertDemandDraftEligible(claimId: string): Promise<void> {
  await assertPreviousWorkflowStagesValidated(claimId, DEMAND_LETTER_KIND)

  const row = await loadDemandLetterRow(claimId)
  if (row && isValidatedDocumentRow(row)) {
    throw new Error("מכתב הדרישה כבר אומת — אין צורך בטיוטה חדשה.")
  }
}

/**
 * Demand stage cannot advance while attorney signature is outstanding.
 * Blocks while pending_signature OR while a draft exists without verified signature.
 * Uploading the signed demand letter itself is always allowed.
 */
export async function assertDemandStageClear(
  claimId: string,
  targetKind?: DocKind,
): Promise<void> {
  if (targetKind === DEMAND_LETTER_KIND) return

  const row = await loadDemandLetterRow(claimId)
  if (!row) return

  const awaitingSignature =
    row.signatureStatus === SIGNATURE_PENDING ||
    (Boolean(row.draftVersionHash) && row.signatureStatus !== SIGNATURE_VERIFIED)

  if (awaitingSignature) {
    throw new Error(
      "מכתב הדרישה ממתין לחתימת עו״ד והעלאת סריקה חתומה. לא ניתן להתקדם בשלב הדרישה.",
    )
  }
}

export async function isDemandStageBlocked(claimId: string): Promise<boolean> {
  try {
    await assertDemandStageClear(claimId)
    return false
  } catch {
    return true
  }
}

export type DemandLetterWorkflowState = {
  canGenerate: boolean
  generateBlockedReason: string | null
  pendingSignature: boolean
  draftGeneratedAt: string | null
  draftVersionHash: string | null
  validated: boolean
}

export async function getDemandLetterWorkflowState(
  claimId: string,
): Promise<DemandLetterWorkflowState> {
  const row = await loadDemandLetterRow(claimId)
  const validated = row ? isDemandLetterValidated(row) : false
  const pendingSignature = row ? isDemandSignaturePending(row) : false

  let canGenerate = false
  let generateBlockedReason: string | null = null
  try {
    await assertDemandDraftEligible(claimId)
    canGenerate = !pendingSignature
    if (pendingSignature) {
      generateBlockedReason = "טיוטה כבר הופקה — ממתין לחתימה והעלאה."
    }
  } catch (err) {
    generateBlockedReason = err instanceof Error ? err.message : "לא ניתן להפיק טיוטה."
  }

  return {
    canGenerate,
    generateBlockedReason,
    pendingSignature,
    draftGeneratedAt: row?.draftGeneratedAt?.toISOString() ?? null,
    draftVersionHash: row?.draftVersionHash ?? null,
    validated,
  }
}

function buildDemandLetterDraftText(input: {
  claimId: string
  clientName: string
  plate: string
  carModel: string
  requestedAmount: number
  partnerName: string
}): string {
  const today = new Date().toLocaleDateString("he-IL")
  return [
    "מכתב דרישה — טיוטה לחתימת עו״ד",
    "================================",
    "",
    `תאריך: ${today}`,
    `מספר תיק: ${input.claimId}`,
    "",
    "לכבוד חברת הביטוח / צד ג׳",
    "",
    `הנדון: דרישת פיצוי בגין נזקי רכב — רכב מס. ${input.plate}`,
    "",
    `שם הלקוח: ${input.clientName}`,
    `דגם הרכב: ${input.carModel}`,
    `שותף מטפל: ${input.partnerName}`,
    "",
    `סכום הדרישה: ₪${input.requestedAmount.toLocaleString("he-IL")}`,
    "",
    "בזאת אנו דורשים את תשלום הפיצוי המגיע ללקוח בגין נזקי התאונה,",
    "בהתאם למסמכים שצורפו לתיק ולדוח השמאות.",
    "",
    "טיוטה זו נוצרה במערכת AXIS ומיועדת להדפסה, חתימה וסריקה.",
    "יש להעלות את המסמך החתום דרך תיבת המשימות — ממתין לחתימה.",
    "",
    "בכבוד רב,",
    "משרד עו״ד / AXIS Partner",
    "",
    "---",
    `DocKind: ${DEMAND_LETTER_KIND}`,
    `Generated: ${new Date().toISOString()}`,
  ].join("\n")
}

export async function generateDemandLetterDraftForClaim(
  claimId: string,
): Promise<{ documentId: string; draftPathname: string; draftVersionHash: string }> {
  await assertDemandDraftEligible(claimId)

  const [claimRow] = await db
    .select({
      id: claim.id,
      clientName: claim.clientName,
      plate: claim.plate,
      carModel: claim.carModel,
      requestedAmount: claim.requestedAmount,
      partnerId: claim.partnerId,
      partnerName: partner.businessName,
    })
    .from(claim)
    .leftJoin(partner, eq(partner.id, claim.partnerId))
    .where(eq(claim.id, claimId))
    .limit(1)
  if (!claimRow) throw new Error("התיק לא נמצא.")

  const docRow = await loadDemandLetterRow(claimId)
  if (!docRow) throw new Error("שורת מכתב דרישה לא נמצאה.")

  const bodyWithoutMarker = buildDemandLetterDraftText({
    claimId: claimRow.id,
    clientName: claimRow.clientName,
    plate: claimRow.plate,
    carModel: claimRow.carModel,
    requestedAmount: Number(claimRow.requestedAmount),
    partnerName: claimRow.partnerName ?? claimRow.partnerId,
  })

  const { body, versionHash } = buildVersionedDemandDraftBody({
    claimId: claimRow.id,
    clientName: claimRow.clientName,
    plate: claimRow.plate,
    carModel: claimRow.carModel,
    requestedAmount: Number(claimRow.requestedAmount),
    partnerName: claimRow.partnerName ?? claimRow.partnerId,
    bodyWithoutMarker,
  })

  const pathname = `documents/${docRow.partnerId}/${claimId}/demand_letter-draft-${Date.now()}.txt`
  const blob = await put(pathname, body, {
    access: "private",
    contentType: "text/plain; charset=utf-8",
  })

  const now = new Date()
  // Quarantine any prior signed/unsigned scan — draft starts a fresh signature cycle.
  if (docRow.blobPathname) {
    try {
      const { del } = await import("@vercel/blob")
      await del(docRow.blobPathname)
    } catch {
      /* best-effort */
    }
  }

  await db
    .update(claimDocument)
    .set({
      draftBlobPathname: blob.pathname,
      draftGeneratedAt: now,
      draftVersionHash: versionHash,
      signatureStatus: SIGNATURE_PENDING,
      status: "pending",
      blobPathname: null,
      fileName: null,
      fileSize: null,
      contentType: null,
      uploadedBy: null,
      note: "ממתין לחתימת עו״ד והעלאת סריקה",
      extractedData: null,
      extractionStatus: "none",
      extractionConfidence: null,
      extractionModel: null,
      extractionError: null,
      extractionReviewedAt: null,
      extractionReviewedBy: null,
      stpStatus: "none",
      stpReason: null,
      stpDecidedAt: null,
      updatedAt: now,
    })
    .where(eq(claimDocument.id, docRow.id))

  return { documentId: docRow.id, draftPathname: blob.pathname, draftVersionHash: versionHash }
}

/** Mark demand letter signature as verified after hash-pass signed upload. */
export async function markDemandSignatureVerified(documentId: string): Promise<void> {
  await db
    .update(claimDocument)
    .set({
      signatureStatus: SIGNATURE_VERIFIED,
      updatedAt: new Date(),
    })
    .where(and(eq(claimDocument.id, documentId), eq(claimDocument.kind, DEMAND_LETTER_KIND)))
}

/** Restore pending_signature when a demand draft still exists after file reset/remove. */
export async function restoreDemandSignaturePendingIfDraft(documentId: string): Promise<void> {
  const [row] = await db
    .select({
      id: claimDocument.id,
      draftVersionHash: claimDocument.draftVersionHash,
    })
    .from(claimDocument)
    .where(and(eq(claimDocument.id, documentId), eq(claimDocument.kind, DEMAND_LETTER_KIND)))
    .limit(1)
  if (!row?.draftVersionHash) return
  await db
    .update(claimDocument)
    .set({
      signatureStatus: SIGNATURE_PENDING,
      note: "ממתין לחתימת עו״ד והעלאת סריקה",
      updatedAt: new Date(),
    })
    .where(eq(claimDocument.id, row.id))
}
