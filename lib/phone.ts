/**
 * Israeli mobile phone helpers (E.164 + local display).
 * Client-safe: no server imports.
 */

/** Digits only, for matching / storage keys. */
export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "")
}

/**
 * Normalize to E.164 without plus: 9725XXXXXXXX (12 digits).
 * Accepts: 05X..., 5X..., +9725X..., 9725X..., whatsapp:+9725X...
 */
export function normalizeIsraeliPhoneE164(raw: string): string | null {
  let d = phoneDigits(raw)
  if (d.startsWith("9720")) d = `972${d.slice(4)}`
  if (d.startsWith("0") && d.length === 10) d = `972${d.slice(1)}`
  if (d.length === 9 && d.startsWith("5")) d = `972${d}`
  if (d.length === 12 && d.startsWith("9725")) return d
  return null
}

/** True for Israeli mobile numbers we accept for intake. */
export function isValidIsraeliMobile(raw: string): boolean {
  return normalizeIsraeliPhoneE164(raw) != null
}

/** Display form: 05X-XXX-XXXX */
export function formatIsraeliPhoneDisplay(e164OrLocal: string): string {
  const e164 = normalizeIsraeliPhoneE164(e164OrLocal)
  if (!e164) return e164OrLocal.trim()
  const local = `0${e164.slice(3)}` // 05XXXXXXXX
  return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`
}

/** Strip Twilio/Meta "whatsapp:" prefix before normalizing. */
export function stripWhatsAppAddress(from: string): string {
  return from.replace(/^whatsapp:/i, "").trim()
}
