/**
 * Diagnose Twilio auth + WhatsApp Intake env readiness.
 * Usage: npx tsx --env-file=.env.local scripts/diagnose-twilio.ts
 * Does not print secrets.
 */

import {
  parseWhatsAppIntakeMessage,
  WHATSAPP_INTAKE_FORMAT_HINT,
} from "@/lib/whatsapp/intake-parser"

function mask(value: string | undefined, keep = 4): string {
  if (!value) return "(missing)"
  if (value.length <= keep) return "***"
  return `${value.slice(0, keep)}…${value.slice(-keep)}`
}

async function main() {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim()
  const token = process.env.TWILIO_AUTH_TOKEN?.trim()
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim()

  console.log("=== Twilio / WhatsApp Intake diagnostic ===")
  console.log("TWILIO_ACCOUNT_SID:", mask(sid, 6))
  console.log("TWILIO_AUTH_TOKEN:", token ? `set (${token.length} chars)` : "(missing)")
  console.log("TWILIO_WHATSAPP_FROM:", from || "(missing)")
  console.log(
    "WHATSAPP_WEBHOOK_SECRET:",
    process.env.WHATSAPP_WEBHOOK_SECRET?.trim() ? "set" : "(missing — Twilio signature auth still OK)",
  )
  console.log(
    "WHATSAPP_WEBHOOK_PUBLIC_URL:",
    process.env.WHATSAPP_WEBHOOK_PUBLIC_URL?.trim() || "(unset — set this to your public webhook URL for Twilio signature validation)",
  )

  if (!sid || !token) {
    console.error("FAIL  Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN")
    process.exitCode = 1
    return
  }
  if (!from) {
    console.error("FAIL  Missing TWILIO_WHATSAPP_FROM")
    process.exitCode = 1
    return
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    console.error(`FAIL  Twilio auth HTTP ${res.status}:`, body.slice(0, 200))
    process.exitCode = 1
    return
  }

  const account = (await res.json()) as { friendly_name?: string; status?: string; type?: string }
  console.log("PASS  Twilio authentication OK")
  console.log("      account:", account.friendly_name || "(unnamed)")
  console.log("      status:", account.status || "?")
  console.log("      type:", account.type || "?")

  const sample = parseWhatsAppIntakeMessage("קליטה 12-345-67 0501234567")
  console.log(
    sample.ok
      ? `PASS  Intake parser OK (plate=${sample.plateDisplay}, phone=${sample.phoneE164})`
      : `FAIL  Intake parser rejected valid sample`,
  )
  if (!sample.ok) process.exitCode = 1

  const bad = parseWhatsAppIntakeMessage("קליטה only-plate")
  console.log(
    !bad.ok
      ? `PASS  Fail-safe format path OK → "${WHATSAPP_INTAKE_FORMAT_HINT.slice(0, 40)}…"`
      : "FAIL  Bad format should be rejected",
  )
  if (bad.ok) process.exitCode = 1

  console.log("")
  console.log("Production note: swap TWILIO_WHATSAPP_FROM to your production WhatsApp sender;")
  console.log("no code changes required — send helpers and webhook read From from env only.")
  console.log("Webhook path: POST /api/webhook/whatsapp-intake")
  console.log("Partner message target (Sandbox):", from)
}

main().catch((err) => {
  console.error("FAIL  diagnostic error:", err instanceof Error ? err.message : err)
  process.exitCode = 1
})
