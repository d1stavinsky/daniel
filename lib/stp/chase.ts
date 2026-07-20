import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { partner } from "@/lib/db/schema"
import { createNotification } from "@/lib/notifications"
import { sendAlertEmail } from "@/lib/email"
import { docKindLabels, type DocKind } from "@/lib/documents"

function appUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  return base ? `${base}${path}` : path
}

async function markEmailSent(id: string): Promise<void> {
  const { notification } = await import("@/lib/db/schema")
  await db.update(notification).set({ emailSent: true }).where(eq(notification.id, id))
}

/** Partner chase: missing required document (STP auto-chase). */
export async function notifyStpMissingDoc(input: {
  claimId: string
  partnerId: string
  kind: DocKind
  clientName: string
  plate: string
  note?: string
}): Promise<{ created: boolean; emailed: boolean }> {
  const label = docKindLabels[input.kind]
  const title = `דרישה אוטומטית: ${label}`
  const body = `נדרש להשלים "${label}" עבור תיק ${input.claimId} (${input.clientName}).${input.note ? ` ${input.note}` : ""}`
  const day = new Date().toISOString().slice(0, 10)
  const id = await createNotification({
    audience: "partner",
    recipientPartnerId: input.partnerId,
    claimId: input.claimId,
    type: "stp_chase",
    title,
    body,
    dedupeKey: `stp-chase:missing:${input.claimId}:${input.kind}:${day}`,
  })
  if (!id) return { created: false, emailed: false }

  const [p] = await db
    .select({ email: partner.contactEmail })
    .from(partner)
    .where(eq(partner.id, input.partnerId))
    .limit(1)
  if (!p?.email) return { created: true, emailed: false }

  const res = await sendAlertEmail({
    to: p.email,
    subject: `AXIS · דרישה אוטומטית — מסמך חסר בתיק ${input.claimId}`,
    heading: "נדרשת השלמת מסמך",
    lines: [
      `שלום,`,
      `במסגרת הטיפול בתיק ${input.claimId} (${input.clientName}, רכב ${input.plate}) חסר המסמך הבא:`,
      `${label}${input.note ? ` — ${input.note}` : ""}`,
      `יש להעלות את המסמך דרך פורטל השותפים בהקדם כדי למנוע עיכוב בתביעה.`,
    ],
    cta: { label: "מעבר לפורטל השותפים", url: appUrl("/dashboard") },
  })
  if (res.ok) await markEmailSent(id)
  return { created: true, emailed: res.ok }
}

/** Partner chase: extracted data failed validation (mismatch). */
export async function notifyDataMismatch(input: {
  claimId: string
  partnerId: string
  documentId: string
  kind: DocKind
  clientName: string
  plate: string
  issues: string[]
  extractionKey?: string
}): Promise<{ created: boolean; emailed: boolean }> {
  const label = docKindLabels[input.kind]
  const issueText = input.issues.join(" · ")
  const title = `אי-התאמה בנתונים: ${label}`
  const body = `בתיק ${input.claimId} זוהתה אי-התאמה במסמך "${label}": ${issueText}. יש להעלות מסמך מתוקן או לפנות למשרד.`
  const id = await createNotification({
    audience: "partner",
    recipientPartnerId: input.partnerId,
    claimId: input.claimId,
    type: "stp_chase",
    title,
    body,
    dedupeKey: `stp-chase:mismatch:${input.documentId}:${input.extractionKey ?? "latest"}`,
  })
  if (!id) return { created: false, emailed: false }

  const [p] = await db
    .select({ email: partner.contactEmail })
    .from(partner)
    .where(eq(partner.id, input.partnerId))
    .limit(1)
  if (!p?.email) return { created: true, emailed: false }

  const res = await sendAlertEmail({
    to: p.email,
    subject: `AXIS · אי-התאמת נתונים בתיק ${input.claimId}`,
    heading: "נדרש תיקון מסמך",
    lines: [
      `שלום,`,
      `בתיק ${input.claimId} (${input.clientName}, רכב ${input.plate}) זוהתה אי-התאמה במסמך ${label}:`,
      ...input.issues,
      `יש להעלות גרסה מתוקנת דרך פורטל השותפים או ליצור קשר עם צוות AXIS.`,
    ],
    cta: { label: "מעבר לפורטל השותפים", url: appUrl("/dashboard") },
  })
  if (res.ok) await markEmailSent(id)
  return { created: true, emailed: res.ok }
}
