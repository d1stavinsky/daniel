import { randomUUID } from "crypto"
import { and, eq, lt, ne, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { claim, notification, partner, user } from "@/lib/db/schema"
import { SLA_BREACH_DAYS, STUCK_DAYS } from "@/lib/workflow-data"
import { DOC_KINDS, docKindLabels, type DocKind } from "@/lib/documents"
import { sendAlertEmail } from "@/lib/email"
import { countValidatedDocs } from "@/lib/document-workflow-gates"
import { claimDocument } from "@/lib/db/schema"
import { recordClaimEvent } from "@/lib/claim-events"
import {
  businessWorkflowStageLabelsHe,
  unresolvedWorkflowStage,
  type InboxDocSignal,
} from "@/lib/ops/next-action"
import { inArray } from "drizzle-orm"
import {
  REQUIRED_DOC_COUNT,
  claimProgressLabels,
  deriveClaimProgressStatus,
} from "@/lib/claim-progress"

/** Absolute base URL for links inside emails. */
function appUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  return base ? `${base}${path}` : path
}

type CreateArgs = {
  audience: "admin" | "partner"
  recipientPartnerId?: string | null
  claimId?: string | null
  type: "stuck_claim" | "missing_doc" | "doc_uploaded" | "stp_chase" | "sla_breach"
  title: string
  body?: string
  dedupeKey: string
}

/**
 * Idempotently create a notification. Returns the row id, or null if a row with
 * the same dedupeKey already exists (so callers can skip re-sending email).
 */
export async function createNotification(args: CreateArgs): Promise<string | null> {
  const existing = await db
    .select({ id: notification.id })
    .from(notification)
    .where(eq(notification.dedupeKey, args.dedupeKey))
    .limit(1)
  if (existing.length > 0) return null

  const id = randomUUID()
  try {
    await db.insert(notification).values({
      id,
      audience: args.audience,
      recipientPartnerId: args.recipientPartnerId ?? null,
      claimId: args.claimId ?? null,
      type: args.type,
      title: args.title,
      body: args.body ?? "",
      dedupeKey: args.dedupeKey,
      read: false,
      emailSent: false,
      createdAt: new Date(),
    })
    return id
  } catch {
    // Unique violation from a concurrent insert — treat as already-created.
    return null
  }
}

async function markEmailSent(id: string): Promise<void> {
  await db.update(notification).set({ emailSent: true }).where(eq(notification.id, id))
}

/** All AXIS admin email addresses (recipients for internal alerts). */
async function adminEmails(): Promise<string[]> {
  const rows = await db
    .select({ email: user.email })
    .from(user)
    .where(sql`${user.role} in ('admin', 'support')`)
  return rows.map((r) => r.email)
}

/**
 * Fire a "document missing" alert to the owning partner (in-app + email).
 * Called when an admin flags a required document as missing.
 */
export async function notifyMissingDoc(
  claimId: string,
  partnerId: string,
  kind: DocKind,
  note: string,
): Promise<void> {
  const [c] = await db
    .select({ clientName: claim.clientName, plate: claim.plate })
    .from(claim)
    .where(eq(claim.id, claimId))
    .limit(1)
  if (!c) return

  const label = docKindLabels[kind]
  const title = `מסמך חסר: ${label}`
  const body = `נדרש להשלים "${label}" עבור תיק ${claimId} (${c.clientName}).${note ? ` הערה: ${note}` : ""}`
  // Dedupe per (claim, kind) so re-flagging the same doc doesn't spam.
  const id = await createNotification({
    audience: "partner",
    recipientPartnerId: partnerId,
    claimId,
    type: "missing_doc",
    title,
    body,
    dedupeKey: `missing:${claimId}:${kind}`,
  })

  // Even if the in-app row already existed, we only email on first creation.
  if (!id) return
  const [p] = await db
    .select({ email: partner.contactEmail })
    .from(partner)
    .where(eq(partner.id, partnerId))
    .limit(1)
  if (p?.email) {
    const res = await sendAlertEmail({
      to: p.email,
      subject: `AXIS · מסמך חסר בתיק ${claimId}`,
      heading: "נדרשת השלמת מסמך",
      lines: [
        `שלום,`,
        `במסגרת הטיפול בתיק <strong>${claimId}</strong> (${c.clientName}, רכב ${c.plate}) חסר המסמך הבא:`,
        `<strong>${label}</strong>${note ? `<br/>הערת המשרד: ${note}` : ""}`,
        `יש להעלות את המסמך דרך פורטל השותפים בהקדם כדי למנוע עיכוב בתביעה.`,
      ],
      cta: { label: "מעבר לפורטל השותפים", url: appUrl("/dashboard") },
    })
    if (res.ok) await markEmailSent(id)
  }
}

export type ScanResult = { scanned: number; stuck: number; created: number; emailed: number }

/**
 * Scan open claims stuck without document-progress movement beyond STUCK_DAYS.
 * Progress is document-driven (P0) — does not use the legacy stage ledger as authority.
 */
export async function scanStuckClaims(): Promise<ScanResult> {
  const threshold = new Date(Date.now() - STUCK_DAYS * 24 * 60 * 60 * 1000)
  const rows = await db
    .select({
      id: claim.id,
      clientName: claim.clientName,
      plate: claim.plate,
      partnerId: claim.partnerId,
      stageEnteredAt: claim.stageEnteredAt,
      paymentConfirmedAt: claim.paymentConfirmedAt,
      businessName: partner.businessName,
    })
    .from(claim)
    .leftJoin(partner, eq(partner.id, claim.partnerId))
    .where(and(ne(claim.status, "closed"), lt(claim.stageEnteredAt, threshold)))

  let created = 0
  let emailed = 0
  const admins = await adminEmails()

  for (const c of rows) {
    const validatedDocCount = await countValidatedDocs(c.id)
    const progressStatus = deriveClaimProgressStatus(
      validatedDocCount,
      Boolean(c.paymentConfirmedAt),
    )
    // Closed / fully resolved claims should not alert as stuck.
    if (progressStatus === "completed") continue

    const days = Math.floor((Date.now() - new Date(c.stageEnteredAt).getTime()) / (24 * 60 * 60 * 1000))
    const statusLabel = claimProgressLabels[progressStatus]
    const dedupeKey = `stuck:${c.id}:${new Date(c.stageEnteredAt).toISOString()}`
    const id = await createNotification({
      audience: "admin",
      claimId: c.id,
      type: "stuck_claim",
      title: `תיק תקוע: ${c.id}`,
      body: `תיק ${c.id} (${c.clientName}) בסטטוס "${statusLabel}" עם ${validatedDocCount}/${REQUIRED_DOC_COUNT} מסמכים מאומתים כבר ${days} ימים.`,
      dedupeKey,
    })
    if (!id) continue
    created++

    if (admins.length > 0) {
      const res = await sendAlertEmail({
        to: admins.join(", "),
        subject: `AXIS · תיק תקוע ${c.id} (${days} ימים)`,
        heading: "תיק תקוע מעל 5 ימים",
        lines: [
          `תיק <strong>${c.id}</strong> דורש התייחסות.`,
          `לקוח: ${c.clientName} · רכב: ${c.plate} · שותף: ${c.businessName ?? "—"}`,
          `סטטוס מסמכים: <strong>${statusLabel}</strong> · ${validatedDocCount}/${REQUIRED_DOC_COUNT} מסמכים אומתו.`,
          `ללא התקדמות כבר <strong>${days} ימים</strong> (סף התראה: ${STUCK_DAYS} ימים).`,
        ],
        cta: { label: "פתיחת התיק בקונסולת הניהול", url: appUrl("/admin") },
      })
      if (res.ok) {
        await markEmailSent(id)
        emailed++
      }
    }
  }

  return { scanned: rows.length, stuck: rows.length, created, emailed }
}

export type SlaScanResult = { scanned: number; breached: number; created: number; emailed: number }

/**
 * SLA Monitor (P3): flag open claims sitting in Investigation (stage 3) or
 * Demand (stage 4) beyond SLA_BREACH_DAYS without document progress.
 * Alerts admins (in-app + email) and records an audit event; the Ops Inbox
 * derives the same breach live via deriveSlaBreach.
 */
export async function scanSlaBreaches(): Promise<SlaScanResult> {
  const threshold = new Date(Date.now() - SLA_BREACH_DAYS * 24 * 60 * 60 * 1000)
  const rows = await db
    .select({
      id: claim.id,
      clientName: claim.clientName,
      plate: claim.plate,
      partnerId: claim.partnerId,
      stageEnteredAt: claim.stageEnteredAt,
      businessName: partner.businessName,
    })
    .from(claim)
    .leftJoin(partner, eq(partner.id, claim.partnerId))
    .where(and(ne(claim.status, "closed"), lt(claim.stageEnteredAt, threshold)))

  let breached = 0
  let created = 0
  let emailed = 0
  const admins = await adminEmails()

  for (const c of rows) {
    const docRows = await db
      .select({
        kind: claimDocument.kind,
        status: claimDocument.status,
        blobPathname: claimDocument.blobPathname,
        extractionStatus: claimDocument.extractionStatus,
        extractionConfidence: claimDocument.extractionConfidence,
        stpStatus: claimDocument.stpStatus,
      })
      .from(claimDocument)
      .where(and(eq(claimDocument.claimId, c.id), inArray(claimDocument.kind, DOC_KINDS)))

    const signals: InboxDocSignal[] = docRows.map((d) => ({
      kind: d.kind,
      status: d.status,
      hasFile: Boolean(d.blobPathname),
      extractionStatus: d.extractionStatus ?? "none",
      extractionConfidence: d.extractionConfidence,
      stpStatus: d.stpStatus ?? "none",
    }))

    const stage = unresolvedWorkflowStage(signals)
    if (stage !== 3 && stage !== 4) continue
    breached++

    const days = Math.floor(
      (Date.now() - new Date(c.stageEnteredAt).getTime()) / (24 * 60 * 60 * 1000),
    )
    const stageLabel = businessWorkflowStageLabelsHe[stage]
    const dedupeKey = `sla-breach:${c.id}:${stage}:${new Date(c.stageEnteredAt).toISOString()}`
    const id = await createNotification({
      audience: "admin",
      claimId: c.id,
      type: "sla_breach",
      title: `SLA הופר: ${c.id}`,
      body: `תיק ${c.id} (${c.clientName}) נמצא בשלב "${stageLabel}" כבר ${days} ימים — מעל יעד ה־SLA של ${SLA_BREACH_DAYS} ימים.`,
      dedupeKey,
    })
    if (!id) continue
    created++

    await recordClaimEvent({
      claimId: c.id,
      partnerId: c.partnerId,
      type: "sla_breach",
      actorUserId: "system:sla-monitor",
      actorRole: "system",
      meta: { stage, stageLabel, days, slaDays: SLA_BREACH_DAYS },
    })

    if (admins.length > 0) {
      const res = await sendAlertEmail({
        to: admins.join(", "),
        subject: `AXIS · חריגת SLA בתיק ${c.id} (${days} ימים בשלב ${stageLabel})`,
        heading: `SLA הופר — שלב ${stageLabel}`,
        lines: [
          `תיק <strong>${c.id}</strong> חורג מיעד הטיפול.`,
          `לקוח: ${c.clientName} · רכב: ${c.plate} · שותף: ${c.businessName ?? "—"}`,
          `שלב נוכחי: <strong>${stageLabel}</strong> · ללא התקדמות כבר <strong>${days} ימים</strong>.`,
          `יעד SLA: ${SLA_BREACH_DAYS} ימים לשלבי חקירה ודרישה.`,
        ],
        cta: { label: "פתיחת התיק בקונסולת הניהול", url: appUrl("/admin") },
      })
      if (res.ok) {
        await markEmailSent(id)
        emailed++
      }
    }
  }

  return { scanned: rows.length, breached, created, emailed }
}
