import { type NextRequest, NextResponse } from "next/server"
import { desc, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { claim, inboundEmail, inboundEmailAttachment } from "@/lib/db/schema"
import { getSessionUser } from "@/lib/session"
import { requireClaimAccess } from "@/lib/tenant"

type RouteContext = { params: Promise<{ id: string }> }

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const { id: claimId } = await context.params
    const access = await requireClaimAccess(claimId)
    const [linkedClaim] = await db
      .select({ id: claim.id, customerName: claim.customerName })
      .from(claim)
      .where(eq(claim.id, access.claimId))
      .limit(1)
    const emails = await db
      .select()
      .from(inboundEmail)
      .where(eq(inboundEmail.claimId, access.claimId))
      .orderBy(desc(inboundEmail.receivedAt))

    const emailIds = emails.map((email) => email.id)
    const attachments =
      emailIds.length === 0
        ? []
        : await db
            .select()
            .from(inboundEmailAttachment)
            .where(inArray(inboundEmailAttachment.inboundEmailId, emailIds))

    const byEmail = new Map<string, typeof attachments>()
    for (const attachment of attachments) {
      const list = byEmail.get(attachment.inboundEmailId) ?? []
      list.push(attachment)
      byEmail.set(attachment.inboundEmailId, list)
    }

    return NextResponse.json({
      claim: linkedClaim ?? { id: access.claimId, customerName: "" },
      emails: emails.map((email) => ({
        id: email.id,
        fromAddress: email.fromAddress,
        toAddresses: parseStringArray(email.toAddresses),
        ccAddresses: parseStringArray(email.ccAddresses),
        subject: email.subject,
        textBody: email.textBody,
        status: email.status,
        error: email.error,
        receivedAt: email.receivedAt.toISOString(),
        attachments: (byEmail.get(email.id) ?? []).map((attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          contentType: attachment.contentType,
          status: attachment.status,
          rejectionReason: attachment.rejectionReason,
          savedDocumentId: attachment.savedDocumentId,
          savedKind: attachment.savedKind,
          savedAt: attachment.savedAt?.toISOString() ?? null,
          hasFile: Boolean(attachment.blobPathname),
        })),
      })),
    })
  } catch (error) {
    console.error("[inbound-email] list failed:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "Failed to load communications" }, { status: 500 })
  }
}
