/**
 * Claim-level verification indicator — derived from document rows in DB.
 * Quiet Luxury: tone only (green / yellow / red); no copy in the bar itself.
 */

import { REQUIRED_DOC_COUNT, DOC_KINDS } from "@/lib/claim-progress"
import { STP_AUTO_VERIFY_CONFIDENCE } from "@/lib/stp/types"

export type ClaimVerificationTone = "green" | "yellow" | "red"

export type ClaimVerificationState = {
  tone: ClaimVerificationTone
  /** Verified kinds / required kinds, 0–100. */
  percent: number
  verifiedCount: number
  requiredCount: number
}

/** Minimal doc fields needed to derive claim verification tone. */
export type VerificationDocSignal = {
  kind: string
  status: string
  hasFile: boolean
  extractionStatus: string
  /** Stored as 0–100 integer in DB; null if unknown. */
  extractionConfidence: number | null
  stpStatus: string
}

function isVerified(doc: VerificationDocSignal): boolean {
  return doc.status === "approved" || doc.stpStatus === "auto_verified"
}

/** Red: missing flag, STP exception, extraction failure/review, or confidence ≤ 95%. */
function needsAction(doc: VerificationDocSignal): boolean {
  if (doc.status === "missing") return true
  if (doc.stpStatus === "exception" || doc.stpStatus === "chased") return true
  if (doc.extractionStatus === "failed" || doc.extractionStatus === "needs_review") return true
  if (
    doc.hasFile &&
    !isVerified(doc) &&
    doc.extractionConfidence != null &&
    doc.extractionConfidence / 100 <= STP_AUTO_VERIFY_CONFIDENCE
  ) {
    return true
  }
  return false
}

/** Yellow: uploaded / AI in flight, awaiting admin or model. */
function isWaiting(doc: VerificationDocSignal): boolean {
  if (!doc.hasFile || isVerified(doc) || needsAction(doc)) return false
  if (doc.status === "uploaded") return true
  if (doc.extractionStatus === "processing" || doc.extractionStatus === "ready") return true
  return true
}

/**
 * Derive claim verification from live document signals.
 * Priority: red (action) > yellow (waiting) > green (all verified).
 */
export function deriveClaimVerification(
  docs: VerificationDocSignal[],
): ClaimVerificationState {
  const byKind = new Map<string, VerificationDocSignal[]>()
  for (const d of docs) {
    const list = byKind.get(d.kind) ?? []
    list.push(d)
    byKind.set(d.kind, list)
  }

  let verifiedCount = 0
  let hasAction = false
  let hasWaiting = false
  let hasMissingKind = false

  for (const kind of DOC_KINDS) {
    const rows = byKind.get(kind) ?? []
    const withFile = rows.filter((d) => d.hasFile)

    if (rows.some(needsAction)) hasAction = true

    if (withFile.length === 0) {
      hasMissingKind = true
      continue
    }

    if (withFile.some(needsAction)) {
      hasAction = true
      continue
    }

    if (withFile.every(isVerified)) {
      verifiedCount += 1
      continue
    }

    if (withFile.some(isWaiting) || withFile.some((d) => !isVerified(d))) {
      hasWaiting = true
    }
  }

  const percent =
    REQUIRED_DOC_COUNT <= 0
      ? 0
      : Math.round((Math.min(verifiedCount, REQUIRED_DOC_COUNT) / REQUIRED_DOC_COUNT) * 100)

  if (hasAction || hasMissingKind) {
    return { tone: "red", percent, verifiedCount, requiredCount: REQUIRED_DOC_COUNT }
  }
  if (verifiedCount >= REQUIRED_DOC_COUNT) {
    return {
      tone: "green",
      percent: 100,
      verifiedCount: REQUIRED_DOC_COUNT,
      requiredCount: REQUIRED_DOC_COUNT,
    }
  }
  return {
    tone: "yellow",
    percent,
    verifiedCount,
    requiredCount: REQUIRED_DOC_COUNT,
  }
}

export const verificationToneStyles: Record<
  ClaimVerificationTone,
  { bar: string; track: string; label: string }
> = {
  green: {
    bar: "bg-emerald-500",
    track: "bg-emerald-500/15",
    label: "כל המסמכים אומתו",
  },
  yellow: {
    bar: "bg-amber-400",
    track: "bg-amber-400/15",
    label: "ממתין לאימות AI או לאישור ידני",
  },
  red: {
    bar: "bg-rose-500",
    track: "bg-rose-500/15",
    label: "נדרשת פעולה — מסמך חסר, חוסר התאמה או ביטחון נמוך",
  },
}

export function emptyVerificationState(): ClaimVerificationState {
  return {
    tone: "red",
    percent: 0,
    verifiedCount: 0,
    requiredCount: REQUIRED_DOC_COUNT,
  }
}
