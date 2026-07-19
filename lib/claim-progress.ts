import { DOC_KINDS, REQUIRED_DOCS, type DocStatus } from "@/lib/documents"

/**
 * Claim progress driven by mandatory document validation + Stage 6 payment gate.
 * `completed` requires all docs validated AND manual payment confirmation.
 */
export type ClaimProgressStatus =
  | "pending"
  | "in_progress"
  | "pending_resolution"
  | "completed"

export const claimProgressLabels: Record<ClaimProgressStatus, string> = {
  pending: "ממתין",
  in_progress: "בטיפול",
  pending_resolution: "ממתין לסגירה",
  completed: "הושלם",
}

export const REQUIRED_DOC_COUNT = REQUIRED_DOCS.length

/** Statuses that count as file presence. Progress itself uses validated-doc counts. */
export const UPLOADED_DOC_STATUSES: DocStatus[] = ["uploaded", "approved"]

/**
 * Derive claim progress from validated-document count and payment confirmation.
 * - 0 → pending
 * - 1..N-1 → in_progress
 * - N + !paymentConfirmed → pending_resolution (docs validated, Stage 6 open)
 * - N + paymentConfirmed → completed
 */
export function deriveClaimProgressStatus(
  validatedCount: number,
  paymentConfirmed = false,
): ClaimProgressStatus {
  const n = Math.max(0, Math.min(REQUIRED_DOC_COUNT, Math.floor(validatedCount)))
  if (n <= 0) return "pending"
  if (n >= REQUIRED_DOC_COUNT) {
    return paymentConfirmed ? "completed" : "pending_resolution"
  }
  return "in_progress"
}

export function claimProgressPercent(validatedCount: number): number {
  if (REQUIRED_DOC_COUNT <= 0) return 0
  const n = Math.max(0, Math.min(REQUIRED_DOC_COUNT, validatedCount))
  return Math.round((n / REQUIRED_DOC_COUNT) * 100)
}

/** Map progress to coarse stage numbers kept denormalized on claim.currentStage. */
export function progressStatusToStage(status: ClaimProgressStatus): number {
  if (status === "pending") return 1
  if (status === "in_progress") return 2
  if (status === "pending_resolution") return 8
  return 9
}

export function isUploadedDocStatus(status: string): boolean {
  return UPLOADED_DOC_STATUSES.includes(status as DocStatus)
}

export { DOC_KINDS }
