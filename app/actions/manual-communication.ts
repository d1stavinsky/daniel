"use server"

import { get } from "@vercel/blob"
import { and, desc, eq, gt, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { claim, claimDocument, claimEvent } from "@/lib/db/schema"
import { requireAdmin } from "@/lib/session"
import { emailSchema } from "@/lib/schemas"
import { actionErr, actionOk, type ActionResult } from "@/lib/action-result"
import { ACCEPTED_DOC_TYPES, MAX_DOC_BYTES } from "@/lib/documents"
import { recordClaimEvent } from "@/lib/claim-events"
import { sendManualEmail, type ManualEmailAttachment } from "@/lib/email"

const MAX_ATTACHMENTS = 10
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024
const MAX_SUBJECT_LENGTH = 180
const MAX_BODY_LENGTH = 20_000
const SEND_COOLDOWN_MS = 15_000

export type SendManualClaimEmailInput = {
  claimId: string
  recipient: string
  subject: string
  body: string
  documentIds: string[]
}

function safeFilename(value: string | null, fallback: string): string {
  const cleaned = (value || fallback)
    .replace(/[\r\n\0]/g, "")
    .replace(/[\\/]/g, "_")
    .trim()
  return cleaned.slice(0, 180) || fallback
}

export async function sendManualClaimEmail(
  input: SendManualClaimEmailInput,
): Promise<ActionResult<{ messageId: string }>> {
  const admin = await requireAdmin()

  const claimId = input.claimId?.trim()
  const subject = input.subject?.trim()
  const body = input.body?.trim()
  const recipientResult = emailSchema.safeParse(input.recipient)
  const documentIds = Array.from(new Set(input.documentIds ?? []))

  if (!claimId) return actionErr("מזהה התיק חסר.")
  if (!recipientResult.success) return actionErr("כתובת הדוא״ל אינה תקינה.")
  if (!subject || subject.length > MAX_SUBJECT_LENGTH || /[\r\n]/.test(subject)) {
    return actionErr("יש להזין נושא תקין באורך של עד 180 תווים.")
  }
  if (!body || body.length > MAX_BODY_LENGTH) {
    return actionErr("יש להזין תוכן הודעה באורך של עד 20,000 תווים.")
  }
  if (documentIds.length > MAX_ATTACHMENTS) {
    return actionErr(`ניתן לצרף עד ${MAX_ATTACHMENTS} קבצים להודעה אחת.`)
  }

  const [claimRow] = await db
    .select({ id: claim.id, partnerId: claim.partnerId })
    .from(claim)
    .where(eq(claim.id, claimId))
    .limit(1)
  if (!claimRow) return actionErr("התיק לא נמצא.")

  const [recentSend] = await db
    .select({ id: claimEvent.id })
    .from(claimEvent)
    .where(
      and(
        eq(claimEvent.claimId, claimId),
        eq(claimEvent.type, "manual_email_sent"),
        eq(claimEvent.actorUserId, admin.id),
        gt(claimEvent.createdAt, new Date(Date.now() - SEND_COOLDOWN_MS)),
      ),
    )
    .orderBy(desc(claimEvent.createdAt))
    .limit(1)
  if (recentSend) {
    return actionErr("הודעה נשלחה זה עתה. יש להמתין מספר שניות לפני שליחה נוספת.")
  }

  const rows =
    documentIds.length === 0
      ? []
      : await db
          .select({
            id: claimDocument.id,
            blobPathname: claimDocument.blobPathname,
            fileName: claimDocument.fileName,
            fileSize: claimDocument.fileSize,
            contentType: claimDocument.contentType,
          })
          .from(claimDocument)
          .where(
            and(
              eq(claimDocument.claimId, claimId),
              eq(claimDocument.partnerId, claimRow.partnerId),
              inArray(claimDocument.id, documentIds),
            ),
          )

  if (rows.length !== documentIds.length || rows.some((row) => !row.blobPathname)) {
    return actionErr("אחד הקבצים שנבחרו אינו זמין עוד. רעננו את התיק ונסו שוב.")
  }

  const declaredTotal = rows.reduce((sum, row) => sum + (row.fileSize ?? 0), 0)
  if (rows.some((row) => (row.fileSize ?? 0) > MAX_DOC_BYTES)) {
    return actionErr("אחד הקבצים חורג ממגבלת 10MB.")
  }
  if (declaredTotal > MAX_TOTAL_ATTACHMENT_BYTES) {
    return actionErr("הקבצים שנבחרו חורגים ממגבלת 25MB להודעה.")
  }

  const attachments: ManualEmailAttachment[] = []
  let actualTotal = 0

  for (const row of rows) {
    if (row.contentType && !ACCEPTED_DOC_TYPES.includes(row.contentType)) {
      return actionErr("אחד הקבצים שנבחרו אינו מסוג נתמך.")
    }

    const result = await get(row.blobPathname!, { access: "private" })
    if (!result || result.statusCode === 304) {
      return actionErr("טעינת אחד הקבצים נכשלה. נסו שוב.")
    }
    const content = Buffer.from(await new Response(result.stream).arrayBuffer())
    actualTotal += content.byteLength
    if (
      content.byteLength > MAX_DOC_BYTES ||
      actualTotal > MAX_TOTAL_ATTACHMENT_BYTES
    ) {
      return actionErr("הקבצים שנבחרו חורגים ממגבלת הגודל המותרת.")
    }

    attachments.push({
      filename: safeFilename(row.fileName, `document-${row.id}`),
      content,
      contentType: row.contentType || result.blob.contentType || "application/octet-stream",
    })
  }

  const sent = await sendManualEmail({
    to: recipientResult.data,
    subject,
    body,
    attachments,
  })
  if (!sent.ok) return actionErr(sent.error)

  await recordClaimEvent({
    claimId,
    partnerId: claimRow.partnerId,
    type: "manual_email_sent",
    actorUserId: admin.id,
    actorRole: admin.role,
    meta: {
      recipient: recipientResult.data,
      subject,
      documentIds,
      attachmentCount: attachments.length,
      attachmentBytes: actualTotal,
      messageId: sent.messageId,
      manual: true,
    },
  })

  return actionOk({ messageId: sent.messageId })
}
