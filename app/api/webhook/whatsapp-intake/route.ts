/**
 * WhatsApp Intake webhook — garage opens a claim by texting:
 *   קליטה [טלפון לקוח] [מספר רכב] [שם לקוח]
 *
 * Auth (fail-closed): Bearer WHATSAPP_WEBHOOK_SECRET, or Twilio signature when
 * TWILIO_AUTH_TOKEN is set.
 *
 * Partner resolution: sender WhatsApp number → partner.whatsappPhone,
 * else WHATSAPP_INTAKE_DEFAULT_PARTNER_ID.
 */

import { createHmac, timingSafeEqual } from "crypto"
import { NextResponse, type NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { createClaimRecord } from "@/lib/claims/create-claim-record"
import {
  parseWhatsAppIntakeMessage,
  WHATSAPP_INTAKE_BAD_PHONE,
  WHATSAPP_INTAKE_BAD_PLATE,
  WHATSAPP_INTAKE_FORMAT_HINT,
} from "@/lib/whatsapp/intake-parser"
import { resolvePartnerForWhatsAppSender } from "@/lib/whatsapp/partner-lookup"
import {
  buildClientIntakeUrl,
  clientIntakeLinkBody,
  createClientIntakeToken,
} from "@/lib/whatsapp/client-intake-link"
import { sendWhatsAppText, twimlMessage } from "@/lib/whatsapp/send"

export const runtime = "nodejs"

const SYSTEM_ACTOR = { id: "system:whatsapp-intake", name: "WhatsApp Intake" } as const

function webhookSecretConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_WEBHOOK_SECRET?.trim() || process.env.TWILIO_AUTH_TOKEN?.trim())
}

function authorizeBearer(request: NextRequest): boolean {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim()
  if (!secret) return false
  const auth = request.headers.get("authorization")
  return auth === `Bearer ${secret}`
}

function validateTwilioSignature(
  request: NextRequest,
  params: URLSearchParams,
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim()
  if (!authToken) return false

  const signature = request.headers.get("x-twilio-signature")
  if (!signature) return false

  const url = process.env.WHATSAPP_WEBHOOK_PUBLIC_URL?.trim() || request.url
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
  let data = url
  for (const [k, v] of sorted) data += k + v

  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64")
  try {
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

async function readInbound(request: NextRequest): Promise<{
  body: string
  from: string
  mediaCount: number
  params: URLSearchParams
  wantsTwiml: boolean
  rawBody: string
}> {
  const contentType = request.headers.get("content-type") || ""

  if (contentType.includes("application/json")) {
    const json = (await request.json()) as Record<string, unknown>
    const body = String(json.Body ?? json.body ?? json.message ?? "")
    const from = String(json.From ?? json.from ?? json.wa_id ?? "")
    const mediaCount = Number(json.NumMedia ?? json.numMedia ?? 0) || 0
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(json)) {
      if (typeof v === "string" || typeof v === "number") params.set(k, String(v))
    }
    return {
      body,
      from,
      mediaCount,
      params,
      wantsTwiml: false,
      rawBody: JSON.stringify(json),
    }
  }

  const raw = await request.text()
  const params = new URLSearchParams(raw)
  return {
    body: params.get("Body") || params.get("body") || "",
    from: params.get("From") || params.get("from") || "",
    mediaCount: Number(params.get("NumMedia") ?? 0) || 0,
    params,
    wantsTwiml: true,
    rawBody: raw,
  }
}

const MEDIA_REDIRECT_REPLY =
  "לא ניתן לקלוט מסמכים בצ׳אט. אנא השתמש בקישור שנשלח אליך להעלאת המסמכים בצורה מאובטחת ומסודרת"

function reply(message: string, wantsTwiml: boolean, status = 200) {
  if (wantsTwiml) {
    return new NextResponse(twimlMessage(message), {
      status,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    })
  }
  return NextResponse.json({ ok: status < 400, reply: message }, { status })
}

async function logIncomingPost(request: NextRequest) {
  const fullDebug =
    process.env.NODE_ENV !== "production" || process.env.WHATSAPP_INTAKE_DEBUG === "true"
  const headers = Object.fromEntries(request.headers.entries())

  for (const sensitiveHeader of ["authorization", "cookie", "x-twilio-signature"]) {
    if (headers[sensitiveHeader]) headers[sensitiveHeader] = "[REDACTED]"
  }

  if (!fullDebug) {
    console.log("Webhook received", {
      method: request.method,
      url: request.url,
      headers,
      rawBody: "[Set WHATSAPP_INTAKE_DEBUG=true to log the raw body]",
    })
    return
  }

  let rawBody = "[Unable to read raw body]"
  try {
    rawBody = await request.clone().text()
  } catch (error) {
    console.error("[whatsapp-intake] Failed to clone raw request body", error)
  }

  console.log("Webhook received", {
    method: request.method,
    url: request.url,
    headers,
    rawBody,
  })
}

export async function POST(request: NextRequest) {
  await logIncomingPost(request)

  if (!webhookSecretConfigured()) {
    console.error("[whatsapp-intake] WHATSAPP_WEBHOOK_SECRET / TWILIO_AUTH_TOKEN not configured")
    return NextResponse.json({ error: "WhatsApp intake is not configured" }, { status: 503 })
  }

  let inbound: Awaited<ReturnType<typeof readInbound>>
  try {
    inbound = await readInbound(request)
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const bearerOk = authorizeBearer(request)
  const twilioOk = validateTwilioSignature(request, inbound.params)
  if (!bearerOk && !twilioOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Media (images/PDFs) must go through the secure intake link, not chat.
  if (inbound.mediaCount > 0) {
    if (!inbound.wantsTwiml && inbound.from) {
      await sendWhatsAppText(inbound.from, MEDIA_REDIRECT_REPLY).catch(() => false)
    }
    return reply(MEDIA_REDIRECT_REPLY, inbound.wantsTwiml, 200)
  }

  const parsed = parseWhatsAppIntakeMessage(inbound.body)

  if (!parsed.ok) {
    const debugPayload =
      process.env.NODE_ENV !== "production" || process.env.WHATSAPP_INTAKE_DEBUG === "true"
    if (debugPayload) {
      console.log("[whatsapp-intake] parse failed — raw request body:", inbound.rawBody)
    }
    const message =
      parsed.reason === "bad_plate"
        ? WHATSAPP_INTAKE_BAD_PLATE
        : parsed.reason === "bad_phone"
          ? WHATSAPP_INTAKE_BAD_PHONE
          : WHATSAPP_INTAKE_FORMAT_HINT
    return reply(message, inbound.wantsTwiml, 200)
  }

  if (!inbound.from) {
    return reply(WHATSAPP_INTAKE_FORMAT_HINT, inbound.wantsTwiml, 200)
  }

  const partnerRow = await resolvePartnerForWhatsAppSender(inbound.from)
  if (!partnerRow) {
    const msg =
      "לא זוהה מוסך שותף למספר זה. פנו למנהל AXIS לרישום מספר WhatsApp של המוסך."
    await sendWhatsAppText(inbound.from, msg).catch(() => false)
    return reply(msg, inbound.wantsTwiml, 200)
  }

  try {
    const created = await createClaimRecord(
      {
        clientName: parsed.customerName,
        customerName: parsed.customerName,
        plate: parsed.plate,
        carModel: "—",
        partnerId: partnerRow.id,
        requestedAmount: 0,
        clientPhone: parsed.phoneE164,
        source: "whatsapp",
      },
      SYSTEM_ACTOR,
    )

    const token = createClientIntakeToken({
      claimId: created.claimId,
      plate: created.plate,
      phoneE164: parsed.phoneE164,
    })
    const url = buildClientIntakeUrl(token)
    const clientMessage = clientIntakeLinkBody(created.plate, url)
    const garageConfirmation =
      `התיק נפתח בהצלחה עבור ${parsed.customerName} עם רכב ${created.plate}. ` +
      "הלקוח קיבל הודעה עם לינק להעלאת מסמכים."

    console.log(`NEW CLAIM CREATED: ${created.claimId} - ${parsed.customerName}`)

    // Twilio webhook callers receive the garage confirmation through TwiML.
    // JSON/manual callers need an explicit REST message.
    if (!inbound.wantsTwiml && inbound.from) {
      const garageNotified = await sendWhatsAppText(inbound.from, garageConfirmation).catch(
        () => false,
      )
      if (!garageNotified) console.warn("[whatsapp-intake] garage confirmation delivery failed")
    }

    // The secure upload link is sent directly to the supplied client number.
    const clientNotified = await sendWhatsAppText(parsed.phoneE164, clientMessage).catch(
      () => false,
    )
    if (!clientNotified) console.warn("[whatsapp-intake] client WhatsApp delivery failed")

    revalidatePath("/admin")
    revalidatePath("/dashboard")

    return reply(garageConfirmation, inbound.wantsTwiml, 200)
  } catch (err) {
    console.error("[whatsapp-intake] create failed:", err instanceof Error ? err.message : String(err))
    const msg = "פתיחת התיק נכשלה. נסו שוב או פנו לתמיכת AXIS."
    await sendWhatsAppText(inbound.from, msg).catch(() => false)
    return reply(msg, inbound.wantsTwiml, 200)
  }
}

/** Health / Twilio webhook probe */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "whatsapp-intake",
    configured: webhookSecretConfigured(),
  })
}
