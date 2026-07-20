"use server"

import { randomUUID } from "crypto"
import { del, get, put } from "@vercel/blob"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  claimDocument,
  inboundEmail,
  inboundEmailAttachment,
} from "@/lib/db/schema"
import { requireAdmin } from "@/lib/session"
import {
  ACCEPTED_DOC_TYPES,
  DOC_KINDS,
  MAX_DOC_BYTES,
  docAllowsMultiple,
  type DocKind,
} from "@/lib/documents"
import { ensureDocRows } from "@/lib/claim-documents"
import { assertPreviousWorkflowStagesValidated } from "@/lib/document-workflow-gates"
import {
  assertDemandStageClear,
  DEMAND_LETTER_KIND,
  SIGNATURE_VERIFIED,
} from "@/lib/demand-letter"
import { gateDemandLetterSignedUpload } from "@/lib/demand-letter-upload"
import { syncClaimProgressFromDocuments } from "@/lib/sync-claim-progress"
import { recordClaimEvent } from "@/lib/claim-events"

export type SaveInboundAttachmentResult =
  | { ok: true; documentId: string }
  | { ok: false; error: string; requiresConfirmation?: boolean }

export async function saveInboundAttachmentToClaim(input: {
  attachmentId: string
  kind: DocKind
  replaceExisting?: boolean
}): Promise<SaveInboundAttachmentResult> {
  const admin = await requireAdmin()
  if (!input.attachmentId || !DOC_KINDS.includes(input.kind)) {
    return { ok: false, error: "הבקשה אינה תקינה." }
  }

  const [source] = await db
    .select({
      attachment: inboundEmailAttachment,
      email: inboundEmail,
    })
    .from(inboundEmailAttachment)
    .innerJoin(inboundEmail, eq(inboundEmail.id, inboundEmailAttachment.inboundEmailId))
    .where(eq(inboundEmailAttachment.id, input.attachmentId))
    .limit(1)

  if (!source?.email.claimId || !source.email.partnerId) {
    return { ok: false, error: "הצרופה אינה מקושרת לתיק." }
  }
  if (source.attachment.status === "saved" && source.attachment.savedDocumentId) {
    return { ok: true, documentId: source.attachment.savedDocumentId }
  }
  if (source.attachment.status !== "pending" || !source.attachment.blobPathname) {
    return { ok: false, error: "הצרופה אינה זמינה לשמירה." }
  }
  if (
    !ACCEPTED_DOC_TYPES.includes(source.attachment.contentType) ||
    (source.attachment.fileSize ?? 0) > MAX_DOC_BYTES
  ) {
    return { ok: false, error: "סוג הקובץ או גודלו אינם נתמכים." }
  }

  const claimId = source.email.claimId
  const partnerId = source.email.partnerId
  const kind = input.kind

  await ensureDocRows(claimId, partnerId)
  try {
    await assertDemandStageClear(claimId, kind)
    await assertPreviousWorkflowStagesValidated(claimId, kind)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "לא ניתן לשמור מסמך בשלב זה.",
    }
  }

  const existing = await db
    .select()
    .from(claimDocument)
    .where(
      and(
        eq(claimDocument.claimId, claimId),
        eq(claimDocument.partnerId, partnerId),
        eq(claimDocument.kind, kind),
      ),
    )
  const allowsMultiple = docAllowsMultiple(kind)
  const emptySlot = existing.find((row) => !row.blobPathname)
  const occupiedTarget = !allowsMultiple && !emptySlot ? existing[0] : null
  if (occupiedTarget?.blobPathname && !input.replaceExisting) {
    return {
      ok: false,
      error: "כבר קיים מסמך מסוג זה. יש לאשר החלפה כדי להמשיך.",
      requiresConfirmation: true,
    }
  }

  let newBlobPathname: string | null = null
  try {
    const stagedBlob = await get(source.attachment.blobPathname, { access: "private" })
    if (!stagedBlob || stagedBlob.statusCode === 304) {
      return { ok: false, error: "טעינת הצרופה נכשלה." }
    }
    const content = Buffer.from(await new Response(stagedBlob.stream).arrayBuffer())
    if (content.byteLength > MAX_DOC_BYTES) {
      return { ok: false, error: "הקובץ גדול מ־10MB." }
    }

    const safeName = source.attachment.fileName
      .replace(/[^\w.\-\u0590-\u05FF]/g, "_")
      .slice(0, 180)
    const pathname = `documents/${partnerId}/${claimId}/${kind}-${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`
    const copied = await put(pathname, content, {
      access: "private",
      contentType: source.attachment.contentType,
    })
    newBlobPathname = copied.pathname

    const targetDocumentId = allowsMultiple
      ? emptySlot?.id ?? randomUUID()
      : emptySlot?.id ?? occupiedTarget?.id ?? existing[0]?.id ?? randomUUID()

    if (kind === DEMAND_LETTER_KIND) {
      await gateDemandLetterSignedUpload({
        claimId,
        documentId: targetDocumentId,
        partnerId,
        blobPathname: copied.pathname,
        contentType: source.attachment.contentType,
        fileName: source.attachment.fileName,
        actorUserId: admin.id,
      })
    }

    const now = new Date()
    const payload = {
      status: "uploaded" as const,
      blobPathname: copied.pathname,
      fileName: source.attachment.fileName,
      fileSize: content.byteLength,
      contentType: source.attachment.contentType,
      uploadedBy: admin.id,
      note: "",
      updatedAt: now,
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
      ...(kind === DEMAND_LETTER_KIND ? { signatureStatus: SIGNATURE_VERIFIED } : {}),
    }

    const targetExists = existing.some((row) => row.id === targetDocumentId)
    if (targetExists) {
      await db
        .update(claimDocument)
        .set(payload)
        .where(
          and(
            eq(claimDocument.id, targetDocumentId),
            eq(claimDocument.partnerId, partnerId),
          ),
        )
    } else {
      await db.insert(claimDocument).values({
        id: targetDocumentId,
        claimId,
        partnerId,
        kind,
        ...payload,
        createdAt: now,
      })
    }

    if (occupiedTarget?.blobPathname && occupiedTarget.blobPathname !== copied.pathname) {
      try {
        await del(occupiedTarget.blobPathname)
      } catch {
        /* best effort */
      }
    }

    await db
      .update(inboundEmailAttachment)
      .set({
        status: "saved",
        savedDocumentId: targetDocumentId,
        savedKind: kind,
        savedBy: admin.id,
        savedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(inboundEmailAttachment.id, source.attachment.id),
          eq(inboundEmailAttachment.status, "pending"),
        ),
      )

    await syncClaimProgressFromDocuments(claimId)
    await recordClaimEvent({
      claimId,
      partnerId,
      type: "inbound_attachment_saved",
      actorUserId: admin.id,
      actorRole: admin.role,
      documentId: targetDocumentId,
      documentKind: kind,
      meta: {
        inboundEmailId: source.email.id,
        inboundAttachmentId: source.attachment.id,
        fileName: source.attachment.fileName,
      },
    })
    try {
      const { enqueueDocumentExtraction } = await import("@/lib/idp/pipeline")
      enqueueDocumentExtraction(targetDocumentId, kind)
    } catch {
      /* IDP is best effort */
    }
    revalidatePath("/admin")
    revalidatePath("/dashboard")
    return { ok: true, documentId: targetDocumentId }
  } catch (error) {
    if (newBlobPathname) {
      try {
        await del(newBlobPathname)
      } catch {
        /* best effort */
      }
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "שמירת הצרופה בתיק נכשלה.",
    }
  }
}
