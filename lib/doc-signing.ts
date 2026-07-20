import { createHmac, timingSafeEqual } from "crypto"

// Time-limited signed URLs for private document access. We wrap Vercel Blob's
// private storage with a short-lived HMAC token so download links expire and
// cannot be forged, while the serve route still re-checks the session + tenant.

function resolveSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET must be set in production")
  }
  return "dev-insecure-secret-change-me"
}

const SECRET = resolveSecret()

/** Signed document links are valid for this many seconds. */
export const SIGNED_URL_TTL_SECONDS = 300 // 5 minutes

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url")
}

/** Produce a signed, expiring token for a document id. */
export function signDocToken(docId: string, ttlSeconds = SIGNED_URL_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = b64url(JSON.stringify({ d: docId, e: exp }))
  return `${payload}.${sign(payload)}`
}

/** Verify a token; returns the docId if valid and unexpired, else null. */
export function verifyDocToken(token: string): { docId: string } | null {
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return null

  const expected = sign(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const { d, e } = JSON.parse(Buffer.from(payload, "base64url").toString())
    if (typeof d !== "string" || typeof e !== "number") return null
    if (Math.floor(Date.now() / 1000) > e) return null
    return { docId: d }
  } catch {
    return null
  }
}
