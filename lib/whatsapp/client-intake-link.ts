/**
 * Signed client intake link (WhatsApp CTA after claim open).
 */

import { createHmac, timingSafeEqual } from "crypto"

const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

function signingSecret(): string {
  return (
    process.env.WHATSAPP_INTAKE_LINK_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    ""
  )
}

/**
 * Public origin for client-facing intake links.
 * Prefer the Cloudflare/ngrok host from WHATSAPP_WEBHOOK_PUBLIC_URL so WhatsApp
 * recipients never get http://localhost:3000.
 */
function publicAppOrigin(): string {
  const webhook = process.env.WHATSAPP_WEBHOOK_PUBLIC_URL?.trim()
  if (webhook) {
    try {
      const origin = new URL(webhook).origin
      if (origin && !/localhost|127\.0\.0\.1/i.test(origin)) return origin
    } catch {
      /* ignore malformed */
    }
  }

  const explicit =
    process.env.CLIENT_INTAKE_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    ""
  if (explicit && !/localhost|127\.0\.0\.1/i.test(explicit)) {
    return explicit.replace(/\/$/, "")
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/$/, "")
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "")
  }

  // Last resort (local-only testing)
  return (explicit || "http://localhost:3000").replace(/\/$/, "")
}

export type ClientIntakePayload = {
  claimId: string
  plate: string
  phoneE164: string
  exp: number
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4))
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64")
}

export function createClientIntakeToken(input: {
  claimId: string
  plate: string
  phoneE164: string
}): string {
  const secret = signingSecret()
  if (!secret) throw new Error("Intake link signing secret is not configured")

  const payload: ClientIntakePayload = {
    claimId: input.claimId,
    plate: input.plate,
    phoneE164: input.phoneE164,
    exp: Date.now() + TOKEN_TTL_MS,
  }
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac("sha256", secret).update(body).digest()
  return `${body}.${b64url(sig)}`
}

export function verifyClientIntakeToken(token: string): ClientIntakePayload | null {
  const secret = signingSecret()
  if (!secret) return null
  const [body, sigPart] = token.split(".")
  if (!body || !sigPart) return null

  const expected = createHmac("sha256", secret).update(body).digest()
  const actual = fromB64url(sigPart)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null

  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as ClientIntakePayload
    if (!payload.claimId || !payload.plate || !payload.phoneE164 || !payload.exp) return null
    if (Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

export function buildClientIntakeUrl(token: string): string {
  const base = publicAppOrigin()
  return `${base}/client-intake?t=${encodeURIComponent(token)}`
}

function axisContactSignature(): string[] {
  const phone = process.env.AXIS_CONTACT_PHONE?.trim()
  const address = process.env.AXIS_CONTACT_ADDRESS?.trim()
  return [
    "בברכה,",
    "צוות AXIS",
    ...(phone ? [`טלפון: ${phone}`] : []),
    ...(address ? [`כתובת: ${address}`] : []),
  ]
}

/** Professional client response with the secure intake link. */
export function clientIntakeLinkBody(plate: string, url: string): string {
  return [
    `שלום, התיק נפתח בהצלחה עבור רכב ${plate}.`,
    "",
    "ב-AXIS אנו עובדים בצורה מסודרת ומאובטחת בלבד.",
    "כדי להתחיל בטיפול, יש להעלות את כל המסמכים דרך הקישור המאובטח להלן בלבד (אין לשלוח תמונות בצ׳אט):",
    url,
    "",
    ...axisContactSignature(),
  ].join("\n")
}

/** @deprecated Use clientIntakeLinkBody — kept for any external callers. */
export const clientIntakeSmsBody = clientIntakeLinkBody
