import { type NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { ingestResendEmail, type ResendReceivedEventData } from "@/lib/inbound-email"

export const maxDuration = 120

function normalizeAddress(value: string): string {
  const bracketed = value.match(/<([^>]+)>/)
  return (bracketed?.[1] ?? value).trim().toLowerCase()
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  const inboundAddress = process.env.RESEND_INBOUND_ADDRESS
  if (!apiKey || !webhookSecret || !inboundAddress) {
    return NextResponse.json({ error: "Inbound email is not configured" }, { status: 503 })
  }

  const svixId = request.headers.get("svix-id")
  const svixTimestamp = request.headers.get("svix-timestamp")
  const svixSignature = request.headers.get("svix-signature")
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing webhook signature" }, { status: 400 })
  }

  const payload = await request.text()
  let event: ReturnType<Resend["webhooks"]["verify"]>
  try {
    const resend = new Resend(apiKey)
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: svixId,
        timestamp: svixTimestamp,
        signature: svixSignature,
      },
      webhookSecret,
    })
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 })
  }

  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const data = event.data as ResendReceivedEventData & { received_for?: string[] }
  const recipients = [...(data.to ?? []), ...(data.received_for ?? [])].map(normalizeAddress)
  if (!recipients.includes(normalizeAddress(inboundAddress))) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  try {
    const result = await ingestResendEmail(svixId, data)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error(
      "[resend-inbound] ingestion failed:",
      error instanceof Error ? error.message : String(error),
    )
    return NextResponse.json({ error: "Inbound email ingestion failed" }, { status: 500 })
  }
}

export async function GET() {
  const required = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    RESEND_INBOUND_ADDRESS: process.env.RESEND_INBOUND_ADDRESS,
  }
  const missing = Object.entries(required)
    .filter(([, value]) => !value?.trim())
    .map(([key]) => key)
  return NextResponse.json({
    ok: true,
    configured: missing.length === 0,
    missing,
  })
}
