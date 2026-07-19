"use server"

import { and, eq, inArray } from "drizzle-orm"
import { del } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { claim, claimDocument } from "@/lib/db/schema"
import { requireAdmin, requirePartner, requireStaff, requireUser } from "@/lib/session"
import { requireClaimAccess, requireDocumentAccess } from "@/lib/tenant"
import { syncClaimProgressFromDocuments } from "@/lib/sync-claim-progress"
import { ensureDocRows, listClaimDocuments } from "@/lib/claim-documents"
import { recordClaimEvent } from "@/lib/claim-events"
import { signDocToken } from "@/lib/doc-signing"
import { notifyMissingDoc } from "@/lib/notifications"
import { DOC_KINDS, type ClaimDoc, type DocKind } from "@/lib/documents"
import { DEMAND_CONTENT_MISMATCH } from "@/lib/demand-letter-hash"
import { isInternalAuditReason } from "@/lib/stp/cross-field"
import {
  assertAttorneySignatureVerifiedForApproval,
  DEMAND_LETTER_KIND,
  restoreDemandSignaturePendingIfDraft,
  SIGNATURE_PENDING,
} from "@/lib/demand-letter"
import {
  IDP_FIELD_DEFS,
  isIdpPilotKind,
  parseExtractedData,
  type IdpPilotKind,
} from "@/lib/idp/types"

/** Documents for a claim, ordered by the canonical required-doc sequence. */
export async function getClaimDocuments(claimId: string): Promise<ClaimDoc[]> {
  console.log("[docs] getClaimDocuments.start", claimId)
  try {
    const access = await requireClaimAccess(claimId)
    if (access.user.role === "admin" || access.user.role === "support") {
      await ensureDocRows(access.claimId, access.partnerId)
    }
    const mapped = await listClaimDocuments(access.claimId, access.partnerId, {
      includeExtraction: access.user.role === "admin",
    })
    console.log("[docs] getClaimDocuments.ok", { claimId, count: mapped.length })
    return mapped
  } catch (err) {
    console.error("[docs] getClaimDocuments.fail", claimId, err instanceof Error ? err.message : String(err))
    throw err
  }
}

export type MissingTask = {
  docId: string
  claimId: string
  clientName: string
  kind: DocKind
  note: string
}

/** Every missing-document task for the signed-in partner — their action list. */
export async function getMyMissingTasks(): Promise<MissingTask[]> {
  const user = await requirePartner()
  const rows = await db
    .select({
      docId: claimDocument.id,
      claimId: claimDocument.claimId,
      kind: claimDocument.kind,
      note: claimDocument.note,
      clientName: claim.clientName,
    })
    .from(claimDocument)
    .innerJoin(claim, eq(claim.id, claimDocument.claimId))
    .where(
      and(
        eq(claimDocument.partnerId, user.partnerId),
        eq(claim.partnerId, user.partnerId),
        eq(claimDocument.status, "missing"),
        inArray(claimDocument.kind, DOC_KINDS),
      ),
    )
  const seen = new Set<string>()
  const out: MissingTask[] = []
  for (const r of rows) {
    const key = `${r.claimId}:${r.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      docId: r.docId,
      claimId: r.claimId,
      clientName: r.clientName,
      kind: r.kind as DocKind,
      note: r.note,
    })
  }
  return out
}

/** Flag a document kind as missing -> becomes an actionable garage task. */
export async function markDocMissing(claimId: string, kind: DocKind, note = ""): Promise<ClaimDoc[]> {
  const admin = await requireAdmin()
  const now = new Date()
  const rows = await db
    .update(claimDocument)
    .set({ status: "missing", note, updatedAt: now })
    .where(and(eq(claimDocument.claimId, claimId), eq(claimDocument.kind, kind)))
    .returning({ partnerId: claimDocument.partnerId })
  if (rows[0]) {
    await notifyMissingDoc(claimId, rows[0].partnerId, kind, note)
    await recordClaimEvent({
      claimId,
      partnerId: rows[0].partnerId,
      type: "doc_missing",
      actorUserId: admin.id,
      actorRole: "admin",
      documentKind: kind,
      meta: { note },
    })
  }
  await syncClaimProgressFromDocuments(claimId)
  revalidatePath("/admin")
  revalidatePath("/dashboard")
  return getClaimDocuments(claimId)
}

/** Approve all files for a document kind (admin review passed). */
export async function approveDoc(claimId: string, kind: DocKind): Promise<ClaimDoc[]> {
  const actor = await requireStaff()
  const { hasPermission } = await import("@/lib/rbac")
  if (!hasPermission(actor, "documents:approve")) throw new Error("Forbidden")

  const guarded = await db
    .select({
      id: claimDocument.id,
      kind: claimDocument.kind,
      stpReason: claimDocument.stpReason,
      signatureStatus: claimDocument.signatureStatus,
    })
    .from(claimDocument)
    .where(and(eq(claimDocument.claimId, claimId), eq(claimDocument.kind, kind)))
  for (const row of guarded) {
    assertAttorneySignatureVerifiedForApproval({
      kind: row.kind,
      signatureStatus: row.signatureStatus,
    })
    if (row.stpReason === DEMAND_CONTENT_MISMATCH) {
      throw new Error("לא ניתן לאשר מסמך עם אי-התאמת גרסה — יש להעלות מחדש את הסריקה החתומה הנכונה.")
    }
    if (isInternalAuditReason(row.stpReason)) {
      throw new Error(
        "ביקורת פנימית פתוחה: סכום הדרישה חורג מדוח השמאי. יש לתקן את הנתונים לפני אישור.",
      )
    }
  }

  const now = new Date()
  const rows = await db
    .update(claimDocument)
    .set({ status: "approved", note: "", updatedAt: now })
    .where(and(eq(claimDocument.claimId, claimId), eq(claimDocument.kind, kind)))
    .returning({ partnerId: claimDocument.partnerId })
  if (rows[0]) {
    await recordClaimEvent({
      claimId,
      partnerId: rows[0].partnerId,
      type: "doc_approved",
      actorUserId: actor.id,
      actorRole: actor.role,
      documentKind: kind,
    })
    const { dispatchWebhook } = await import("@/lib/webhooks/dispatch")
    dispatchWebhook("claim.document_approved", {
      claimId,
      partnerId: rows[0].partnerId,
      documentKind: kind,
      via: "manual",
    })
  }
  await syncClaimProgressFromDocuments(claimId)
  revalidatePath("/admin")
  revalidatePath("/dashboard")
  return getClaimDocuments(claimId)
}

/**
 * Reset a document kind: delete all stored files, keep a single pending placeholder row.
 */
export async function resetDoc(claimId: string, kind: DocKind): Promise<ClaimDoc[]> {
  const admin = await requireAdmin()
  const rows = await db
    .select()
    .from(claimDocument)
    .where(and(eq(claimDocument.claimId, claimId), eq(claimDocument.kind, kind)))

  for (const row of rows) {
    if (row.blobPathname) {
      try {
        await del(row.blobPathname)
      } catch (err) {
        console.log("[docs] blob delete failed:", err instanceof Error ? err.message : String(err))
      }
    }
  }

  const now = new Date()
  const keep = rows[0]
  if (keep) {
    const restorePending =
      kind === DEMAND_LETTER_KIND && Boolean(keep.draftVersionHash)
    await db
      .update(claimDocument)
      .set({
        status: "pending",
        blobPathname: null,
        fileName: null,
        fileSize: null,
        contentType: null,
        note: restorePending ? "ממתין לחתימת עו״ד והעלאת סריקה" : "",
        uploadedBy: null,
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
        ...(restorePending ? { signatureStatus: SIGNATURE_PENDING } : {}),
        updatedAt: now,
      })
      .where(eq(claimDocument.id, keep.id))

    const extras = rows.slice(1)
    if (extras.length > 0) {
      await db.delete(claimDocument).where(
        inArray(
          claimDocument.id,
          extras.map((r) => r.id),
        ),
      )
    }

    await recordClaimEvent({
      claimId,
      partnerId: keep.partnerId,
      type: "doc_reset",
      actorUserId: admin.id,
      actorRole: "admin",
      documentKind: kind,
      meta: { removedFiles: rows.filter((r) => r.blobPathname).length },
    })
  }

  await syncClaimProgressFromDocuments(claimId)
  revalidatePath("/admin")
  revalidatePath("/dashboard")
  return getClaimDocuments(claimId)
}

/**
 * Remove a single uploaded file. If it was the last file for that kind,
 * leave a pending placeholder so the category still appears in the checklist.
 */
export async function removeDocumentFile(docId: string): Promise<ClaimDoc[]> {
  console.log("[docs] removeDocumentFile.start", docId)
  try {
    const admin = await requireAdmin()
    const { doc } = await requireDocumentAccess(docId)
    const claimId = doc.claimId
    const kind = doc.kind as DocKind

    if (doc.blobPathname) {
      try {
        await del(doc.blobPathname)
      } catch (err) {
        console.log("[docs] removeDocumentFile.blobFail", err instanceof Error ? err.message : String(err))
      }
    }

    const siblings = await db
      .select({ id: claimDocument.id, blobPathname: claimDocument.blobPathname })
      .from(claimDocument)
      .where(and(eq(claimDocument.claimId, claimId), eq(claimDocument.kind, kind)))

    const othersWithFile = siblings.filter((r) => r.id !== docId && r.blobPathname)
    const now = new Date()

    if (othersWithFile.length === 0) {
      const restorePending =
        kind === DEMAND_LETTER_KIND && Boolean(doc.draftVersionHash)
      await db
        .update(claimDocument)
        .set({
          status: "pending",
          blobPathname: null,
          fileName: null,
          fileSize: null,
          contentType: null,
          note: restorePending ? "ממתין לחתימת עו״ד והעלאת סריקה" : "",
          uploadedBy: null,
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
          ...(restorePending ? { signatureStatus: SIGNATURE_PENDING } : {}),
          updatedAt: now,
        })
        .where(eq(claimDocument.id, docId))
    } else {
      await db.delete(claimDocument).where(eq(claimDocument.id, docId))
    }

    if (kind === DEMAND_LETTER_KIND && othersWithFile.length === 0) {
      await restoreDemandSignaturePendingIfDraft(docId)
    }

    await recordClaimEvent({
      claimId,
      partnerId: doc.partnerId,
      type: "doc_removed",
      actorUserId: admin.id,
      actorRole: "admin",
      documentId: docId,
      documentKind: kind,
    })

    try {
      await syncClaimProgressFromDocuments(claimId)
    } catch (syncErr) {
      console.log("[docs] removeDocumentFile.syncFail", syncErr)
    }
    revalidatePath("/admin")
    revalidatePath("/dashboard")
    console.log("[docs] removeDocumentFile.ok", docId)
    return getClaimDocuments(claimId)
  } catch (err) {
    console.error("[docs] removeDocumentFile.fail", docId, err instanceof Error ? err.message : String(err))
    throw err
  }
}

/**
 * Issue a time-limited signed URL for a stored document.
 * Prefer POST /api/documents/sign-batch for galleries (P0).
 */
export async function getSignedDocUrl(docId: string): Promise<string> {
  const { doc, user } = await requireDocumentAccess(docId)
  if (!doc.blobPathname) throw new Error("Document not available")
  await recordClaimEvent({
    claimId: doc.claimId,
    partnerId: doc.partnerId,
    type: "doc_viewed",
    actorUserId: user.id,
    actorRole: user.role,
    documentId: docId,
    documentKind: doc.kind,
  })
  const token = signDocToken(docId)
  return `/api/documents/file?t=${encodeURIComponent(token)}`
}

/** Bulk-load missing-doc counts for a set of claims (partner dashboard badges). */
export async function getMissingCountByClaim(claimIds: string[]): Promise<Record<string, number>> {
  if (claimIds.length === 0) return {}
  const user = await requireUser()

  let scopedIds = claimIds
  let partnerScope: string | null = null
  if (user.role === "partner") {
    if (!user.partnerId) return {}
    partnerScope = user.partnerId
    const owned = await db
      .select({ id: claim.id })
      .from(claim)
      .where(and(eq(claim.partnerId, user.partnerId), inArray(claim.id, claimIds)))
    scopedIds = owned.map((r) => r.id)
    if (scopedIds.length === 0) return {}
  }

  const filters = [inArray(claimDocument.claimId, scopedIds), eq(claimDocument.status, "missing")] as const
  const rows = await db
    .select({ claimId: claimDocument.claimId, kind: claimDocument.kind })
    .from(claimDocument)
    .where(
      partnerScope
        ? and(...filters, eq(claimDocument.partnerId, partnerScope))
        : and(...filters),
    )
  const seen = new Set<string>()
  const out: Record<string, number> = {}
  for (const r of rows) {
    const key = `${r.claimId}:${r.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    out[r.claimId] = (out[r.claimId] ?? 0) + 1
  }
  return out
}

export type ExtractionFieldEdit = { key: string; value: string | number | null }

/**
 * Admin HITL: confirm extracted fields (optionally after edits) → status reviewed.
 */
export async function confirmDocumentExtraction(
  documentId: string,
  fieldEdits?: ExtractionFieldEdit[],
): Promise<ClaimDoc[]> {
  const admin = await requireAdmin()
  const { doc } = await requireDocumentAccess(documentId)
  if (!doc.blobPathname) throw new Error("Document has no file")
  if (!isIdpPilotKind(doc.kind)) throw new Error("Not an IDP pilot document")

  // ZT-0: HITL must not clear version-mismatch or signature requirements.
  if (doc.stpReason === DEMAND_CONTENT_MISMATCH) {
    throw new Error(
      "לא ניתן לאשר חילוץ למסמך עם אי-התאמת גרסה — יש להעלות מחדש את הסריקה החתומה הנכונה.",
    )
  }
  assertAttorneySignatureVerifiedForApproval({
    kind: doc.kind,
    signatureStatus: doc.signatureStatus,
  })

  const kind = doc.kind as IdpPilotKind

  const existing = parseExtractedData(doc.extractedData)
  const defs = IDP_FIELD_DEFS[kind]
  const editMap = new Map((fieldEdits ?? []).map((f) => [f.key, f.value]))

  const fields = defs.map((d) => {
    const prev = existing?.fields.find((f) => f.key === d.key)
    const value = editMap.has(d.key) ? editMap.get(d.key)! : (prev?.value ?? null)
    return {
      key: d.key,
      label: d.label,
      value,
      confidence: 1,
    }
  })

  const payload = {
    kind,
    fields,
    overallConfidence: 1,
    notes: existing?.notes,
    extractedAt: existing?.extractedAt ?? new Date().toISOString(),
    reviewedAt: new Date().toISOString(),
  }

  const now = new Date()
  await db
    .update(claimDocument)
    .set({
      extractedData: JSON.stringify(payload),
      extractionStatus: "reviewed",
      extractionConfidence: 100,
      extractionReviewedAt: now,
      extractionReviewedBy: admin.id,
      extractionError: null,
      stpStatus: "none",
      stpReason: "אומת ידנית ע״י מנהל",
      stpDecidedAt: now,
      updatedAt: now,
    })
    .where(eq(claimDocument.id, documentId))

  await recordClaimEvent({
    claimId: doc.claimId,
    partnerId: doc.partnerId,
    type: "idp_reviewed",
    actorUserId: admin.id,
    actorRole: "admin",
    documentId,
    documentKind: doc.kind,
    meta: { fields: fields.map((f) => ({ key: f.key, value: f.value })) },
  })

  // P3 fail-safe: HITL edits can change amounts — re-run the cross-field audit.
  if (doc.kind === "demand_letter" || doc.kind === "appraiser_report") {
    try {
      const { runDemandAppraisalAudit } = await import("@/lib/stp/cross-field")
      await runDemandAppraisalAudit(doc.claimId)
    } catch (auditErr) {
      console.error("[docs] cross-field audit failed", documentId, auditErr)
    }
  }

  revalidatePath("/admin")
  return getClaimDocuments(doc.claimId)
}

/** Admin: re-queue IDP extraction for a pilot document. */
export async function rerunDocumentExtraction(documentId: string): Promise<ClaimDoc[]> {
  await requireAdmin()
  const { doc } = await requireDocumentAccess(documentId)
  if (!isIdpPilotKind(doc.kind)) throw new Error("Not an IDP pilot document")
  if (!doc.blobPathname) throw new Error("Document has no file")

  const { runDocumentExtraction } = await import("@/lib/idp/pipeline")
  await runDocumentExtraction(documentId)
  revalidatePath("/admin")
  return getClaimDocuments(doc.claimId)
}
