/**
 * Twilio WhatsApp / SMS outbound helpers.
 * Graceful no-op when TWILIO_* env vars are unset.
 */

function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_WHATSAPP_FROM?.trim(),
  )
}

function twilioSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      (process.env.TWILIO_SMS_FROM?.trim() || process.env.TWILIO_WHATSAPP_FROM?.trim()),
  )
}

async function twilioPost(to: string, from: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID!.trim()
  const token = process.env.TWILIO_AUTH_TOKEN!.trim()
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
  const params = new URLSearchParams({ To: to, From: from, Body: body })

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    console.error("[twilio] send failed", res.status, text.slice(0, 300))
    return false
  }
  return true
}

/** Ensure address is whatsapp:+E.164 for WhatsApp channel. */
export function toWhatsAppAddress(phoneOrWhatsApp: string): string {
  const raw = phoneOrWhatsApp.trim()
  if (/^whatsapp:/i.test(raw)) return raw
  const digits = raw.replace(/\D/g, "")
  return `whatsapp:+${digits}`
}

export async function sendWhatsAppText(to: string, body: string): Promise<boolean> {
  if (!twilioConfigured()) {
    console.warn("[whatsapp] Twilio not configured — skipping outbound WhatsApp")
    return false
  }
  const from = process.env.TWILIO_WHATSAPP_FROM!.trim()
  return twilioPost(toWhatsAppAddress(to), from.startsWith("whatsapp:") ? from : `whatsapp:${from}`, body)
}

/**
 * SMS to Israeli mobile (E.164 digits → +972…).
 * Uses TWILIO_SMS_FROM when set, else falls back to WhatsApp-from number (may fail).
 */
export async function sendSmsText(phoneE164: string, body: string): Promise<boolean> {
  if (!twilioSmsConfigured()) {
    console.warn("[sms] Twilio not configured — skipping SMS")
    return false
  }
  const from =
    process.env.TWILIO_SMS_FROM?.trim() ||
    process.env.TWILIO_WHATSAPP_FROM!.replace(/^whatsapp:/i, "").trim()
  const to = phoneE164.startsWith("+") ? phoneE164 : `+${phoneE164}`
  return twilioPost(to, from.startsWith("whatsapp:") ? from.replace(/^whatsapp:/i, "") : from, body)
}

/** TwiML Message reply (Twilio inbound webhook response body). */
export function twimlMessage(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`
}
