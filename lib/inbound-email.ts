import { randomUUID } from "crypto"
import { put } from "@vercel/blob"
import { and, eq, inArray } from "drizzle-orm"
import { Resend } from "resend"
import { db } from "@/lib/db"
import { claim, inboundEmail, inboundEmailAttachment } from "@/lib/db/schema"
import { ACCEPTED_DOC_TYPES, MAX_DOC_BYTES } from "@/lib/documents"
import { recordClaimEvent } from "@/lib/claim-events"

const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024
const MAX_BODY_CHARS = 200_000
const FETCH_TIMEOUT_MS = 30_000
const PROCESSING_LEASE_MS = 2 * 60 * 1000
const CLAIM_ID_PATTERN = /\bCLM-\d{4,}\b/gi
const CUSTOMER_NAME_PATTERNS = [
  /(?:שם\s*(?:הלקוח|לקוח|המבוטח|מבוטח))\s*[:：-]\s*([^\r\n;|]{2,100})/giu,
  /(?:customer|client|insured)\s*name\s*[:：-]\s*([^\r\n;|]{2,100})/giu,
]
const MISSING_CUSTOMER_NAMES = new Set(["", "-", "—", "לא ידוע", "לא צוין", "unknown", "n/a"])

export type ResendReceivedEventData = {
  email_id: string
  created_at: string
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  received_for?: string[]
  message_id?: string
  subject: string
}

export function extractClaimIds(...parts: Array<string | null | undefined>): string[] {
  const ids = new Set<string>()
  for (const part of parts) {
    for (const match of part?.match(CLAIM_ID_PATTERN) ?? []) ids.add(match.toUpperCase())
  }
  return Array.from(ids)
}

function normalizeCustomerName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200e\u200f]/g, "")
    .replace(/[.,'"״׳()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("he-IL")
}

function isMissingCustomerName(value: string | null | undefined): boolean {
  return MISSING_CUSTOMER_NAMES.has(normalizeCustomerName(value ?? ""))
}

function cleanExtractedCustomerName(value: string): string | null {
  const cleaned = value
    .replace(CLAIM_ID_PATTERN, "")
    .replace(/\s+(?:claim|תיק|מס(?:פר|׳)?\s*תיק)\s*[:：-].*$/iu, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim()

  if (cleaned.length < 2 || cleaned.length > 100) return null
  if (/[\u0000-\u001F\u007F]/.test(cleaned)) return null
  if (/[@<>]/.test(cleaned)) return null
  if (!/[\p{L}]/u.test(cleaned)) return null
  if (cleaned.split(/\s+/).length > 8) return null
  return cleaned
}

/** Extract only explicitly labelled customer names; never infer from signatures or free prose. */
export function extractExplicitCustomerName(
  ...parts: Array<string | null | undefined>
): string | null {
  const names = new Map<string, string>()
  for (const part of parts) {
    if (!part) continue
    for (const pattern of CUSTOMER_NAME_PATTERNS) {
      pattern.lastIndex = 0
      for (const match of part.matchAll(pattern)) {
        const candidate = cleanExtractedCustomerName(match[1] ?? "")
        if (candidate) names.set(normalizeCustomerName(candidate), candidate)
      }
    }
  }
  return names.size === 1 ? Array.from(names.values())[0]! : null
}

function safeFilename(value: string | null | undefined, fallback: string): string {
  const cleaned = (value || fallback)
    .replace(/[\r\n\0]/g, "")
    .replace(/[\\/]/g, "_")
    .replace(/[^\w.\-\u0590-\u05FF ]/g, "_")
    .trim()
  return cleaned.slice(0, 180) || fallback
}

function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return ""
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

type ResolvedClaim = {
  id: string
  partnerId: string
  customerName: string
  updatedCustomerName: string | null
}

async function resolveClaim(parts: string[]): Promise<ResolvedClaim | null> {
  const ids = extractClaimIds(...parts)
  const extractedName = extractExplicitCustomerName(...parts)

  if (ids.length > 1) return null
  if (ids.length === 1) {
    const [row] = await db
      .select({
        id: claim.id,
        partnerId: claim.partnerId,
        clientName: claim.clientName,
        customerName: claim.customerName,
      })
      .from(claim)
      .where(eq(claim.id, ids[0]!))
      .limit(1)
    if (!row) return null

    if (extractedName && isMissingCustomerName(row.customerName)) {
      const [updated] = await db
        .update(claim)
        .set({ customerName: extractedName, updatedAt: new Date() })
        .where(and(eq(claim.id, row.id), eq(claim.customerName, row.customerName)))
        .returning({ customerName: claim.customerName })
      return {
        id: row.id,
        partnerId: row.partnerId,
        customerName: updated?.customerName ?? row.customerName,
        updatedCustomerName: updated?.customerName ?? null,
      }
    }

    if (
      extractedName &&
      normalizeCustomerName(extractedName) !== normalizeCustomerName(row.customerName) &&
      normalizeCustomerName(extractedName) !== normalizeCustomerName(row.clientName)
    ) {
      console.warn(`[inbound-email] Claim ${row.id} rejected: explicit customer name mismatch`)
      return null
    }

    return {
      id: row.id,
      partnerId: row.partnerId,
      customerName: row.customerName,
      updatedCustomerName: null,
    }
  }

  if (!extractedName) return null
  const openClaims = await db
    .select({
      id: claim.id,
      partnerId: claim.partnerId,
      clientName: claim.clientName,
      customerName: claim.customerName,
    })
    .from(claim)
    .where(eq(claim.status, "open"))
  const normalizedName = normalizeCustomerName(extractedName)
  const matches = openClaims.filter(
    (row) =>
      normalizeCustomerName(row.customerName) === normalizedName ||
      normalizeCustomerName(row.clientName) === normalizedName,
  )
  if (matches.length !== 1) return null

  return {
    id: matches[0]!.id,
    partnerId: matches[0]!.partnerId,
    customerName: matches[0]!.customerName,
    updatedCustomerName: null,
  }
}

function resendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured")
  return new Resend(apiKey)
}

export async function ingestResendEmail(
  providerEventId: string,
  eventData: ResendReceivedEventData,
): Promise<{ duplicate: boolean; claimId: string | null }> {
  const existing = await db
    .select()
    .from(inboundEmail)
    .where(eq(inboundEmail.providerEmailId, eventData.email_id))
    .limit(1)

  if (existing[0]?.status === "ready") {
    return { duplicate: true, claimId: existing[0].claimId }
  }
  if (
    existing[0]?.status === "processing" &&
    Date.now() - existing[0].updatedAt.getTime() < PROCESSING_LEASE_MS
  ) {
    return { duplicate: true, claimId: existing[0].claimId }
  }

  const now = new Date()
  if (!existing[0]) {
    await db
      .insert(inboundEmail)
      .values({
        id: randomUUID(),
        providerEventId,
        providerEmailId: eventData.email_id,
        providerMessageId: eventData.message_id ?? null,
        fromAddress: eventData.from,
        toAddresses: JSON.stringify(eventData.to ?? []),
        ccAddresses: JSON.stringify(eventData.cc ?? []),
        subject: (eventData.subject ?? "").slice(0, 500),
        status: "processing",
        receivedAt: new Date(eventData.created_at),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
  }

  const [emailRow] = await db
    .select()
    .from(inboundEmail)
    .where(eq(inboundEmail.providerEmailId, eventData.email_id))
    .limit(1)
  if (!emailRow) throw new Error("Failed to persist inbound email")
  if (emailRow.status === "ready") return { duplicate: true, claimId: emailRow.claimId }

  await db
    .update(inboundEmail)
    .set({ status: "processing", error: null, updatedAt: new Date() })
    .where(eq(inboundEmail.id, emailRow.id))

  const resend = resendClient()

  try {
    const messageResult = await resend.emails.receiving.get(eventData.email_id, {
      html_format: "cid",
    })
    if (messageResult.error || !messageResult.data) {
      throw new Error(messageResult.error?.message || "Failed to retrieve inbound email")
    }

    const message = messageResult.data
    const textBody = (message.text || htmlToPlainText(message.html)).slice(0, MAX_BODY_CHARS)
    const matchedClaim = await resolveClaim([message.subject, textBody])
    if (matchedClaim?.updatedCustomerName) {
      console.log(
        `AUTO-LINKED: Email from ${message.from} to Claim ${matchedClaim.id} - Updated name to ${matchedClaim.updatedCustomerName}`,
      )
    }

    await db
      .update(inboundEmail)
      .set({
        providerMessageId: message.message_id,
        claimId: matchedClaim?.id ?? null,
        partnerId: matchedClaim?.partnerId ?? null,
        fromAddress: message.from,
        toAddresses: JSON.stringify(message.to ?? []),
        ccAddresses: JSON.stringify(message.cc ?? []),
        subject: (message.subject ?? "").slice(0, 500),
        textBody,
        status: "processing",
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(inboundEmail.id, emailRow.id))

    const attachmentResult = await resend.emails.receiving.attachments.list({
      emailId: eventData.email_id,
    })
    if (attachmentResult.error || !attachmentResult.data) {
      throw new Error(attachmentResult.error?.message || "Failed to list inbound attachments")
    }

    let acceptedTotal = 0
    for (const attachment of attachmentResult.data.data) {
      const fileName = safeFilename(attachment.filename, `attachment-${attachment.id}`)
      const supported = ACCEPTED_DOC_TYPES.includes(attachment.content_type)
      const withinFileLimit = attachment.size <= MAX_DOC_BYTES
      const withinTotalLimit = acceptedTotal + attachment.size <= MAX_TOTAL_ATTACHMENT_BYTES
      const rejectionReason = !supported
        ? "סוג הקובץ אינו נתמך"
        : !withinFileLimit
          ? "הקובץ גדול מ־10MB"
          : !withinTotalLimit
            ? "הצרופות חורגות ממגבלת 25MB להודעה"
            : null

      await db
        .insert(inboundEmailAttachment)
        .values({
          id: randomUUID(),
          inboundEmailId: emailRow.id,
          providerAttachmentId: attachment.id,
          fileName,
          fileSize: attachment.size,
          contentType: attachment.content_type,
          contentDisposition: attachment.content_disposition,
          contentId: attachment.content_id ?? null,
          status: rejectionReason ? "rejected" : "processing",
          rejectionReason,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing()

      const [staged] = await db
        .select()
        .from(inboundEmailAttachment)
        .where(
          and(
            eq(inboundEmailAttachment.inboundEmailId, emailRow.id),
            eq(inboundEmailAttachment.providerAttachmentId, attachment.id),
          ),
        )
        .limit(1)
      if (!staged || staged.status === "pending" || staged.status === "saved" || staged.status === "rejected") {
        if (!rejectionReason && staged?.status !== "rejected") acceptedTotal += attachment.size
        continue
      }
      if (rejectionReason) continue

      const response = await fetch(attachment.download_url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!response.ok) throw new Error(`Attachment download failed (${response.status})`)
      const content = Buffer.from(await response.arrayBuffer())
      if (content.byteLength > MAX_DOC_BYTES) throw new Error("Attachment exceeded size limit")
      acceptedTotal += content.byteLength
      if (acceptedTotal > MAX_TOTAL_ATTACHMENT_BYTES) throw new Error("Email attachment total exceeded limit")

      const pathname = `inbound-email/${emailRow.id}/${attachment.id}-${fileName}`
      const blob = await put(pathname, content, {
        access: "private",
        contentType: attachment.content_type,
      })
      await db
        .update(inboundEmailAttachment)
        .set({
          blobPathname: blob.pathname,
          fileSize: content.byteLength,
          status: "pending",
          rejectionReason: null,
          updatedAt: new Date(),
        })
        .where(eq(inboundEmailAttachment.id, staged.id))
    }

    await db
      .update(inboundEmail)
      .set({ status: "ready", error: null, updatedAt: new Date() })
      .where(eq(inboundEmail.id, emailRow.id))

    if (matchedClaim) {
      await recordClaimEvent({
        claimId: matchedClaim.id,
        partnerId: matchedClaim.partnerId,
        type: "inbound_email_received",
        actorRole: "system",
        meta: {
          inboundEmailId: emailRow.id,
          providerEmailId: eventData.email_id,
          from: message.from,
          subject: message.subject,
          attachmentCount: attachmentResult.data.data.length,
        },
      })
    }

    return { duplicate: false, claimId: matchedClaim?.id ?? null }
  } catch (error) {
    await db
      .update(inboundEmail)
      .set({
        status: "failed",
        error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
        updatedAt: new Date(),
      })
      .where(eq(inboundEmail.id, emailRow.id))
    throw error
  }
}
