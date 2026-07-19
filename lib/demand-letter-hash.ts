import { createHash } from "crypto"

/** English STP / audit reason when signed upload does not match draft fingerprint. */
export const DEMAND_CONTENT_MISMATCH = "Invalid: Content Mismatch" as const

/** Hebrew operator-facing copy for mismatch blockers. */
export const DEMAND_CONTENT_MISMATCH_HE =
  "אימות גרסה נכשל: תוכן המסמך החתום אינו תואם לטיוטה שהופקה." as const

export const DRAFT_VERSION_MARKER_PREFIX = "AXIS-Version-Hash:" as const

export type DemandDraftVersionPayload = {
  v: 1
  kind: "demand_letter"
  claimId: string
  clientName: string
  plate: string
  carModel: string
  requestedAmount: number
  partnerName: string
}

/** Deterministic canonical payload used to fingerprint a demand-letter draft version. */
export function buildDemandDraftVersionPayload(input: {
  claimId: string
  clientName: string
  plate: string
  carModel: string
  requestedAmount: number
  partnerName: string
}): DemandDraftVersionPayload {
  return {
    v: 1,
    kind: "demand_letter",
    claimId: input.claimId.trim(),
    clientName: input.clientName.trim(),
    plate: input.plate.trim(),
    carModel: input.carModel.trim(),
    requestedAmount: Math.round(input.requestedAmount),
    partnerName: input.partnerName.trim(),
  }
}

/** SHA-256 hex fingerprint of the canonical draft payload. */
export function hashDemandDraftPayload(payload: DemandDraftVersionPayload): string {
  const canonical = [
    String(payload.v),
    payload.kind,
    payload.claimId,
    payload.clientName,
    payload.plate,
    payload.carModel,
    String(payload.requestedAmount),
    payload.partnerName,
  ].join("|")
  return createHash("sha256").update(canonical, "utf8").digest("hex")
}

/** SHA-256 hex fingerprint of normalized draft body text. */
export function hashDemandDraftBody(body: string): string {
  return createHash("sha256").update(normalizeDraftBodyForHash(body), "utf8").digest("hex")
}

export function normalizeDraftBodyForHash(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
}

export function embedDraftVersionMarker(body: string, versionHash: string): string {
  return `${body}\n${DRAFT_VERSION_MARKER_PREFIX} ${versionHash}\n`
}

/** Extract embedded version hash from OCR/text, if present. */
export function extractVersionHashFromText(text: string): string | null {
  const match = text.match(/AXIS-Version-Hash:\s*([a-f0-9]{64})/i)
  return match?.[1]?.toLowerCase() ?? null
}

/** Scan binary buffers for an embedded version marker (works for text-based PDFs). */
export function extractVersionHashFromBytes(bytes: Buffer): string | null {
  const utf8 = bytes.toString("utf8")
  const fromUtf8 = extractVersionHashFromText(utf8)
  if (fromUtf8) return fromUtf8

  const latin1 = bytes.toString("latin1")
  return extractVersionHashFromText(latin1)
}

export function versionHashesMatch(expected: string, found: string | null): boolean {
  if (!found) return false
  return expected.toLowerCase() === found.toLowerCase()
}

/** Build draft body + version hash for persistence at generation time. */
export function buildVersionedDemandDraftBody(input: {
  claimId: string
  clientName: string
  plate: string
  carModel: string
  requestedAmount: number
  partnerName: string
  bodyWithoutMarker: string
}): { body: string; versionHash: string } {
  const payload = buildDemandDraftVersionPayload(input)
  const versionHash = hashDemandDraftPayload(payload)
  const body = embedDraftVersionMarker(input.bodyWithoutMarker, versionHash)
  return { body, versionHash }
}
