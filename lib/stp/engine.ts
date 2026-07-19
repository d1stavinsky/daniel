import { and, desc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { claim, claimDocument, partner } from "@/lib/db/schema"
import { recordClaimEvent } from "@/lib/claim-events"
import { parseExtractedData, isIdpPilotKind, type IdpPilotKind } from "@/lib/idp/types"
import { DOC_KINDS, docKindLabels, type DocKind } from "@/lib/documents"
import { syncClaimProgressFromDocuments } from "@/lib/sync-claim-progress"
import { validateExtractionAgainstClaim } from "@/lib/stp/validate"
import {
  STP_AUTO_VERIFY_CONFIDENCE,
  type StpDecision,
  type StpStatus,
} from "@/lib/stp/types"
import { notifyDataMismatch, notifyStpMissingDoc } from "@/lib/stp/chase"

const SYSTEM_ACTOR = "system:stp"

/**
 * Apply STP after IDP extraction lands.
 * Auto-verify only when confidence > 95% and validation passes.
 * Otherwise route to the exception queue; chase partner on mismatches.
 */
export async function applyStpAfterExtraction(documentId: string): Promise<StpDecision> {
  const [doc] = await db.select().from(claimDocument).where(eq(claimDocument.id, documentId)).limit(1)
  if (!doc || !isIdpPilotKind(doc.kind)) {
    return {
      status: "none",
      code: "low_confidence",
      reason: "not a pilot document",
      issues: [],
      autoApproved: false,
    }
  }

  const kind = doc.kind as IdpPilotKind
  const [c] = await db
    .select({
      plate: claim.plate,
      requestedAmount: claim.requestedAmount,
      clientName: claim.clientName,
    })
    .from(claim)
    .where(eq(claim.id, doc.claimId))
    .limit(1)

  if (!c) {
    return {
      status: "exception",
      code: "extraction_failed",
      reason: "claim not found",
      issues: [],
      autoApproved: false,
    }
  }

  if (doc.extractionStatus === "failed") {
    const decision: StpDecision = {
      status: "exception",
      code: "extraction_failed",
      reason: doc.extractionError || "חילוץ נכשל",
      issues: [],
      autoApproved: false,
    }
    await persistStpDecision(doc.id, decision)
    await recordClaimEvent({
      claimId: doc.claimId,
      partnerId: doc.partnerId,
      type: "stp_exception",
      actorUserId: SYSTEM_ACTOR,
      actorRole: "system",
      documentId: doc.id,
      documentKind: kind,
      meta: decision,
    })
    return decision
  }

  const payload = parseExtractedData(doc.extractedData)
  const confidence =
    payload?.overallConfidence ??
    (doc.extractionConfidence != null ? doc.extractionConfidence / 100 : 0)

  if (!payload) {
    const decision: StpDecision = {
      status: "exception",
      code: "extraction_failed",
      reason: "אין נתוני חילוץ",
      issues: [],
      autoApproved: false,
    }
    await persistStpDecision(doc.id, decision)
    return decision
  }

  const issues = validateExtractionAgainstClaim({
    kind,
    payload,
    claimPlate: c.plate,
    requestedAmount: Number(c.requestedAmount) || 0,
  })

  if (issues.length > 0) {
    const decision: StpDecision = {
      status: "exception",
      code: "validation_failed",
      reason: issues.map((i) => i.message).join("; "),
      issues,
      autoApproved: false,
    }
    await db
      .update(claimDocument)
      .set({
        extractionStatus: "needs_review",
        stpStatus: "exception",
        stpReason: decision.reason.slice(0, 800),
        stpDecidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(claimDocument.id, doc.id))

    await recordClaimEvent({
      claimId: doc.claimId,
      partnerId: doc.partnerId,
      type: "stp_exception",
      actorUserId: SYSTEM_ACTOR,
      actorRole: "system",
      documentId: doc.id,
      documentKind: kind,
      meta: decision,
    })

    await notifyDataMismatch({
      claimId: doc.claimId,
      partnerId: doc.partnerId,
      documentId: doc.id,
      kind,
      clientName: c.clientName,
      plate: c.plate,
      issues: decision.issues.map((i) => i.message),
      extractionKey: payload.extractedAt,
    })

    await db
      .update(claimDocument)
      .set({ stpStatus: "chased", updatedAt: new Date() })
      .where(eq(claimDocument.id, doc.id))

    return { ...decision, status: "chased" }
  }

  if (confidence <= STP_AUTO_VERIFY_CONFIDENCE) {
    const decision: StpDecision = {
      status: "exception",
      code: "low_confidence",
      reason: `ביטחון חילוץ ${(confidence * 100).toFixed(0)}% ≤ ${STP_AUTO_VERIFY_CONFIDENCE * 100}% — דורש אימות ידני`,
      issues: [],
      autoApproved: false,
    }
    await db
      .update(claimDocument)
      .set({
        extractionStatus: confidence >= 0.75 ? "ready" : "needs_review",
        stpStatus: "exception",
        stpReason: decision.reason.slice(0, 800),
        stpDecidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(claimDocument.id, doc.id))

    await recordClaimEvent({
      claimId: doc.claimId,
      partnerId: doc.partnerId,
      type: "stp_exception",
      actorUserId: SYSTEM_ACTOR,
      actorRole: "system",
      documentId: doc.id,
      documentKind: kind,
      meta: { ...decision, confidence },
    })
    return decision
  }

  // Signature-required kinds cannot auto-verify until wet signature is verified.
  const { requiresAttorneySignature, isAttorneySignatureVerified } = await import("@/lib/demand-letter")
  if (requiresAttorneySignature(kind) && !isAttorneySignatureVerified(doc.signatureStatus)) {
    const decision: StpDecision = {
      status: "exception",
      code: "validation_failed",
      reason: "ממתין לאימות חתימת עו״ד — לא ניתן לאשר אוטומטית לפני סריקה חתומה מאומתת",
      issues: [],
      autoApproved: false,
    }
    await db
      .update(claimDocument)
      .set({
        extractionStatus: "needs_review",
        stpStatus: "exception",
        stpReason: decision.reason.slice(0, 800),
        stpDecidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(claimDocument.id, doc.id))
    await recordClaimEvent({
      claimId: doc.claimId,
      partnerId: doc.partnerId,
      type: "stp_exception",
      actorUserId: SYSTEM_ACTOR,
      actorRole: "system",
      documentId: doc.id,
      documentKind: kind,
      meta: decision,
    })
    return decision
  }

  // Straight-through: confidence > 95% and validation clean → Verified + approved.
  const now = new Date()
  const decision: StpDecision = {
    status: "auto_verified",
    code: "auto_verified",
    reason: `אומת אוטומטית — ביטחון ${(confidence * 100).toFixed(0)}% > ${STP_AUTO_VERIFY_CONFIDENCE * 100}%`,
    issues: [],
    autoApproved: true,
  }

  await db
    .update(claimDocument)
    .set({
      status: "approved",
      note: "",
      extractionStatus: "reviewed",
      extractionConfidence: Math.round(confidence * 100),
      extractionReviewedAt: now,
      extractionReviewedBy: SYSTEM_ACTOR,
      stpStatus: "auto_verified",
      stpReason: decision.reason.slice(0, 800),
      stpDecidedAt: now,
      updatedAt: now,
    })
    .where(eq(claimDocument.id, doc.id))

  await recordClaimEvent({
    claimId: doc.claimId,
    partnerId: doc.partnerId,
    type: "stp_auto_verified",
    actorUserId: SYSTEM_ACTOR,
    actorRole: "system",
    documentId: doc.id,
    documentKind: kind,
    meta: { confidence, reason: decision.reason },
  })

  try {
    await syncClaimProgressFromDocuments(doc.claimId)
  } catch (err) {
    console.log("[stp] sync after auto-verify failed", err)
  }

  const { dispatchWebhook } = await import("@/lib/webhooks/dispatch")
  dispatchWebhook("claim.stp_verified", {
    claimId: doc.claimId,
    partnerId: doc.partnerId,
    documentId: doc.id,
    documentKind: kind,
    confidence,
  })
  dispatchWebhook("claim.document_approved", {
    claimId: doc.claimId,
    partnerId: doc.partnerId,
    documentId: doc.id,
    documentKind: kind,
    via: "stp_auto",
    confidence,
  })

  console.log("[stp] auto_verified", { documentId: doc.id, kind, confidence })
  return decision
}

async function persistStpDecision(documentId: string, decision: StpDecision): Promise<void> {
  await db
    .update(claimDocument)
    .set({
      stpStatus: decision.status === "none" ? "none" : decision.status,
      stpReason: decision.reason.slice(0, 800),
      stpDecidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(claimDocument.id, documentId))
}

export type ExceptionQueueItem = {
  documentId: string
  claimId: string
  partnerId: string
  partnerName: string
  clientName: string
  plate: string
  kind: DocKind
  kindLabel: string
  fileName: string | null
  extractionStatus: string
  extractionConfidence: number | null
  stpStatus: StpStatus
  stpReason: string | null
  stpDecidedAt: string | null
  updatedAt: string
}

/** Admin exception queue — everything STP did not auto-verify. */
export async function listStpExceptions(limit = 100): Promise<ExceptionQueueItem[]> {
  const rows = await db
    .select({
      documentId: claimDocument.id,
      claimId: claimDocument.claimId,
      partnerId: claimDocument.partnerId,
      partnerName: partner.businessName,
      clientName: claim.clientName,
      plate: claim.plate,
      kind: claimDocument.kind,
      fileName: claimDocument.fileName,
      extractionStatus: claimDocument.extractionStatus,
      extractionConfidence: claimDocument.extractionConfidence,
      stpStatus: claimDocument.stpStatus,
      stpReason: claimDocument.stpReason,
      stpDecidedAt: claimDocument.stpDecidedAt,
      updatedAt: claimDocument.updatedAt,
    })
    .from(claimDocument)
    .innerJoin(claim, eq(claim.id, claimDocument.claimId))
    .leftJoin(partner, eq(partner.id, claimDocument.partnerId))
    .where(
      and(
        isNotNull(claimDocument.blobPathname),
        or(
          eq(claimDocument.stpStatus, "exception"),
          eq(claimDocument.stpStatus, "chased"),
          and(
            inArray(claimDocument.extractionStatus, ["needs_review", "failed", "ready"]),
            ne(claimDocument.stpStatus, "auto_verified"),
          ),
        ),
        ne(claim.status, "closed"),
      ),
    )
    .orderBy(desc(claimDocument.updatedAt))
    .limit(limit)

  return rows.map((r) => ({
    documentId: r.documentId,
    claimId: r.claimId,
    partnerId: r.partnerId,
    partnerName: r.partnerName ?? "—",
    clientName: r.clientName,
    plate: r.plate,
    kind: r.kind as DocKind,
    kindLabel: docKindLabels[r.kind as DocKind] ?? r.kind,
    fileName: r.fileName,
    extractionStatus: r.extractionStatus,
    extractionConfidence: r.extractionConfidence,
    stpStatus: (r.stpStatus as StpStatus) || "exception",
    stpReason: r.stpReason,
    stpDecidedAt: r.stpDecidedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }))
}

export type ChaseScanResult = {
  scannedClaims: number
  chased: number
  emailed: number
}

/**
 * Auto-chase partners for missing required documents on open claims.
 * Idempotent via notification dedupe keys.
 */
export async function runStpMissingDocChase(): Promise<ChaseScanResult> {
  const openClaims = await db
    .select({
      id: claim.id,
      partnerId: claim.partnerId,
      clientName: claim.clientName,
      plate: claim.plate,
    })
    .from(claim)
    .where(ne(claim.status, "closed"))

  let chased = 0
  let emailed = 0

  for (const c of openClaims) {
    const docs = await db
      .select({
        id: claimDocument.id,
        kind: claimDocument.kind,
        status: claimDocument.status,
        blobPathname: claimDocument.blobPathname,
        note: claimDocument.note,
      })
      .from(claimDocument)
      .where(and(eq(claimDocument.claimId, c.id), inArray(claimDocument.kind, DOC_KINDS)))

    const claimHasAnyUpload = docs.some((d) => Boolean(d.blobPathname))
    if (!claimHasAnyUpload) continue

    const byKind = new Map<string, typeof docs>()
    for (const d of docs) {
      const list = byKind.get(d.kind) ?? []
      list.push(d)
      byKind.set(d.kind, list)
    }

    for (const kind of DOC_KINDS) {
      const rows = byKind.get(kind) ?? []
      const hasFile = rows.some((r) => Boolean(r.blobPathname))
      if (hasFile) continue

      const markedMissing = rows.some((r) => r.status === "missing")
      if (!markedMissing && rows.length > 0) {
        await db
          .update(claimDocument)
          .set({
            status: "missing",
            note: rows[0]?.note?.trim() || "חסר — דרישה אוטומטית (STP)",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(claimDocument.claimId, c.id),
              eq(claimDocument.kind, kind),
              sql`${claimDocument.blobPathname} is null`,
            ),
          )
      }

      const result = await notifyStpMissingDoc({
        claimId: c.id,
        partnerId: c.partnerId,
        kind,
        clientName: c.clientName,
        plate: c.plate,
        note: "חסר במערכת — נדרשת העלאה",
      })
      if (result.created) {
        chased += 1
        await recordClaimEvent({
          claimId: c.id,
          partnerId: c.partnerId,
          type: "stp_chase",
          actorUserId: SYSTEM_ACTOR,
          actorRole: "system",
          documentKind: kind,
          meta: { reason: "missing_doc" },
        })
      }
      if (result.emailed) emailed += 1
    }
  }

  return { scannedClaims: openClaims.length, chased, emailed }
}

/** Admin dismisses an exception after manual handling (keeps extraction as-is). */
export async function dismissStpException(documentId: string, adminUserId: string): Promise<void> {
  await db
    .update(claimDocument)
    .set({
      stpStatus: "none",
      stpReason: `נסגר ידנית ע״י ${adminUserId}`,
      stpDecidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(claimDocument.id, documentId))
}
