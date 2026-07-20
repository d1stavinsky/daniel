// Strict input masks & validators for Israeli data integrity.
// Used on both client (live masking) and server (authoritative validation).

// --- Israeli license plates ------------------------------------------------
// Modern Israeli plates are 7 or 8 digits, conventionally grouped:
//   7 digits -> NN-NNN-NN  (2-3-2)
//   8 digits -> NNN-NN-NNN (3-2-3)

/** Strip everything except digits, capped at 8 (the max plate length). */
export function plateDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 8)
}

/** Live mask: format raw input into the canonical hyphenated grouping. */
export function formatPlate(raw: string): string {
  const d = plateDigits(raw)
  if (d.length <= 6) {
    // group as 2-3-2 while typing (covers the 7-digit path)
    if (d.length <= 2) return d
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`
    return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
  }
  if (d.length === 7) {
    return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
  }
  // 8 digits -> 3-2-3
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
}

/** A plate is valid if it contains exactly 7 or 8 digits. */
export function isValidPlate(raw: string): boolean {
  const len = plateDigits(raw).length
  return len === 7 || len === 8
}

/** Canonical stored form: always the hyphenated grouping. */
export function normalizePlate(raw: string): string {
  return formatPlate(raw)
}

// --- Claim IDs -------------------------------------------------------------
// Canonical claim id format: "CLM-" followed by 4+ digits, e.g. CLM-4821.

const CLAIM_ID_RE = /^CLM-\d{4,}$/

export function isValidClaimId(id: string): boolean {
  return CLAIM_ID_RE.test(id.trim().toUpperCase())
}

/** Live mask for a claim-id search/entry field. Forces the CLM- prefix and
 *  only allows digits after it. */
export function formatClaimId(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6)
  if (digits.length === 0) return raw.trim() === "" ? "" : "CLM-"
  return `CLM-${digits}`
}

/** Generate a fresh claim id from a numeric sequence value. */
export function makeClaimId(seq: number): string {
  return `CLM-${String(seq).padStart(4, "0")}`
}

// --- Email addresses -------------------------------------------------------
// Practical email check (not full RFC 5322). Allows dots, plus-tags, and digits.
// Strips invisible Unicode that often sneaks in when pasting into RTL fields.

const INVISIBLE_EMAIL_CHARS = /[\u200B-\u200D\u2060\uFEFF\u200E\u200F\u202A-\u202E\u00A0]/g

/**
 * Normalize email for storage/comparison:
 * trim, strip zero-width / bidi marks / NBSP, lowercase.
 */
export function normalizeEmail(raw: string): string {
  return String(raw ?? "")
    .replace(INVISIBLE_EMAIL_CHARS, "")
    .trim()
    .toLowerCase()
}

/**
 * Accepts standard addresses like user.name+tag@gmail.com.
 * Requires a local part, @, domain label, and a dot-TLD (2+ chars).
 */
export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw)
  if (!email || email.length > 254) return false
  // Practical, permissive pattern — not the overly strict Zod HTML5 email regex.
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
    email,
  )
}
