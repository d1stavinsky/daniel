import { Resend } from "resend"

/**
 * Resend wrapper with graceful degradation. Email is disabled unless both the
 * API key and a verified business sender are configured.
 */
const apiKey = process.env.RESEND_API_KEY
const resend = apiKey ? new Resend(apiKey) : null

const FROM = process.env.RESEND_FROM?.trim()

export function emailEnabled(): boolean {
  return resend !== null && Boolean(FROM)
}

type SendArgs = {
  to: string
  subject: string
  heading: string
  lines: string[]
  cta?: { label: string; url: string }
}

export type ManualEmailAttachment = {
  filename: string
  content: Buffer
  contentType: string
}

type ManualSendArgs = {
  to: string
  subject: string
  body: string
  attachments: ManualEmailAttachment[]
}

export type ManualEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string }

/** Send a branded, RTL Hebrew transactional email. Safe to call unconditionally. */
export async function sendAlertEmail({ to, subject, heading, lines, cta }: SendArgs): Promise<{ ok: boolean }> {
  if (!resend || !FROM) {
    console.log("[email] skipped (RESEND_API_KEY / RESEND_FROM not configured):", subject)
    return { ok: false }
  }
  try {
    const html = renderEmail({ heading, lines, cta })
    const { error } = await resend.emails.send({ from: FROM, to, subject, html })
    if (error) {
      console.log("[v0] resend error:", error.message)
      return { ok: false }
    }
    return { ok: true }
  } catch (err) {
    console.log("[v0] resend threw:", err instanceof Error ? err.message : String(err))
    return { ok: false }
  }
}

/**
 * Explicit staff-triggered email. Unlike alerts, failures are returned to the
 * operator and never degraded into a silent no-op.
 */
export async function sendManualEmail({
  to,
  subject,
  body,
  attachments,
}: ManualSendArgs): Promise<ManualEmailResult> {
  if (!resend) return { ok: false, error: "שירות הדוא״ל אינו מוגדר במערכת." }
  if (!FROM) {
    return { ok: false, error: "כתובת השולח העסקית (RESEND_FROM) אינה מוגדרת במערכת." }
  }

  try {
    const html = renderManualEmail(body)
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
      text: body,
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    })
    if (error) return { ok: false, error: error.message || "שליחת הדוא״ל נכשלה." }
    if (!data?.id) return { ok: false, error: "שירות הדוא״ל לא החזיר אישור שליחה." }
    return { ok: true, messageId: data.id }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "שליחת הדוא״ל נכשלה.",
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function renderEmail({ heading, lines, cta }: Omit<SendArgs, "to" | "subject">): string {
  const body = lines
    .map(
      (l) =>
        `<p style="margin:0 0 12px;color:#3f3f46;font-size:15px;line-height:1.6">${escapeHtml(l)}</p>`,
    )
    .join("")
  const button = cta
    ? `<a href="${escapeHtml(cta.url)}" style="display:inline-block;margin-top:8px;background:#C5A059;color:#121212;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px">${escapeHtml(cta.label)}</a>`
    : ""
  return `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#f4f4f5;padding:32px 16px;font-family:'Heebo',Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7">
      <div style="background:#121212;padding:20px 28px">
        <span style="color:#C5A059;font-size:20px;font-weight:700;letter-spacing:1px">AXIS</span>
        <span style="color:#a1a1aa;font-size:12px;margin-inline-start:8px">ניהול תביעות</span>
      </div>
      <div style="padding:28px">
        <h1 style="margin:0 0 16px;color:#121212;font-size:19px;font-weight:700">${escapeHtml(heading)}</h1>
        ${body}
        ${button}
      </div>
      <div style="padding:16px 28px;background:#fafafa;border-top:1px solid #e4e4e7">
        <p style="margin:0;color:#a1a1aa;font-size:12px">הודעה אוטומטית ממערכת AXIS. נא לא להשיב לדוא"ל זה.</p>
      </div>
    </div>
  </body></html>`
}

function renderManualEmail(body: string): string {
  const paragraphs = escapeHtml(body)
    .split(/\r?\n/)
    .map((line) =>
      line
        ? `<p style="margin:0 0 12px;color:#3f3f46;font-size:15px;line-height:1.6">${line}</p>`
        : `<div style="height:8px"></div>`,
    )
    .join("")

  return `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#f4f4f5;padding:32px 16px;font-family:'Heebo',Arial,sans-serif">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7">
      <div style="background:#121212;padding:20px 28px">
        <span style="color:#C5A059;font-size:20px;font-weight:700;letter-spacing:1px">AXIS</span>
        <span style="color:#a1a1aa;font-size:12px;margin-inline-start:8px">ניהול תביעות</span>
      </div>
      <div style="padding:28px">${paragraphs}</div>
      <div style="padding:16px 28px;background:#fafafa;border-top:1px solid #e4e4e7">
        <p style="margin:0;color:#71717a;font-size:12px">הודעה זו נשלחה ידנית על ידי צוות AXIS.</p>
      </div>
    </div>
  </body></html>`
}
