import { formatCurrency } from "@/lib/claims-data"
import type { ClaimProgressStatus } from "@/lib/claim-progress"
import { REQUIRED_DOC_COUNT, claimProgressPercent } from "@/lib/claim-progress"
import type { ClaimVerificationState } from "@/lib/claim-verification"

export { formatCurrency, formatMoneyInput, parseMoneyInput, toMoneyNumber, moneyEquals } from "@/lib/claims-data"
export {
  claimProgressLabels,
  deriveClaimProgressStatus,
  REQUIRED_DOC_COUNT,
  type ClaimProgressStatus,
} from "@/lib/claim-progress"

export type StepStatus = "pending" | "in-progress" | "done"

export const stepStatusLabels: Record<StepStatus, string> = {
  pending: "ממתין",
  "in-progress": "בטיפול",
  done: "הושלם",
}

export type WorkflowStage = {
  id: number
  key: string
  label: string
  short: string
}

/* The 9 stages of the AXIS claims workflow (SOP) */
export const STAGES: WorkflowStage[] = [
  { id: 1, key: "collection", label: "איסוף נתונים", short: "איסוף" },
  { id: 2, key: "signing", label: "חתימת מסמכים", short: "חתימה" },
  { id: 3, key: "noSubmission", label: "טופס אי-הגשה", short: "אי-הגשה" },
  { id: 4, key: "appraisal", label: "שמאות", short: "שמאות" },
  { id: 5, key: "demand", label: "מכתב דרישה", short: "דרישה" },
  { id: 6, key: "filing", label: "הגשת תביעה", short: "הגשה" },
  { id: 7, key: "followup", label: "מעקב וטיפול", short: "מעקב" },
  { id: 8, key: "payment", label: "התאמה ותשלום", short: "תשלום" },
  { id: 9, key: "closing", label: "סגירת תיק", short: "סגירה" },
]

export const PAYMENT_STAGE = 8
export const TOTAL_STAGES = STAGES.length

export type ClaimStep = {
  stage: number
  status: StepStatus
  docs: string[]
  /* internal legal note — visible only in Admin mode, hidden from partners */
  notes: string
}

export type WorkflowClaim = {
  id: string
  clientName: string
  customerName: string
  clientPhone: string | null
  plate: string
  carModel: string
  partnerId: string
  partnerName: string
  /** @deprecated Prefer progressStatus — kept for compatibility. */
  currentStage: number
  /** @deprecated Prefer progressStatus — stage ledger no longer drives the UI. */
  steps: ClaimStep[]
  requestedAmount: number
  receivedAmount: number
  /** Hebrew-formatted claim createdAt. */
  date: string
  /** ISO timestamp when the claim was opened. */
  createdAt: string
  /** User id of the admin/staff who created the claim. */
  createdBy: string
  /** Resolved display name for createdBy. */
  createdByName: string
  /** People who worked on this claim over time. */
  contributors: string[]
  /* days since progress status last changed */
  daysInStage: number
  /* whether AXIS has released the matched funds to the partner */
  fundsReleased: boolean
  closed: boolean
  /** Stage 6: staff confirmed compensation received in account. */
  paymentConfirmed: boolean
  paymentConfirmedAt: string | null
  /** Automatic status from mandatory document uploads. */
  progressStatus: ClaimProgressStatus
  uploadedDocCount: number
  requiredDocCount: number
  /** Verification tone + fill from live document / STP / IDP state. */
  verification: ClaimVerificationState
}

/* A stage pending longer than this many days is flagged as overdue. */
export const OVERDUE_DAYS = 3
/* Notification threshold: a claim stuck in the same stage beyond this is alerted. */
export const STUCK_DAYS = 5
/* SLA: max days a claim may sit in Investigation (3) or Demand (4) without progress. */
export const SLA_BREACH_DAYS = 7

export function isOverdue(claim: WorkflowClaim): boolean {
  return !claim.closed && claim.daysInStage > OVERDUE_DAYS
}

export function isStuck(claim: WorkflowClaim): boolean {
  return !claim.closed && claim.daysInStage >= STUCK_DAYS
}

export function overdueClaims(claims: WorkflowClaim[]): WorkflowClaim[] {
  return claims.filter(isOverdue).sort((a, b) => b.daysInStage - a.daysInStage)
}

// --- State machine ---------------------------------------------------------
// The 9 stages form a strict linear state machine. "done" stages must form a
// contiguous prefix (1..d). At most one stage may be "in-progress", and it must
// be the stage immediately after the done prefix. No skipping is ever allowed.

export function statusOf(steps: ClaimStep[], stage: number): StepStatus {
  return steps.find((s) => s.stage === stage)?.status ?? "pending"
}

/* Number of leading, contiguous "done" stages. */
export function doneCount(steps: ClaimStep[]): number {
  let d = 0
  for (let s = 1; s <= TOTAL_STAGES; s++) {
    if (statusOf(steps, s) === "done") d = s
    else break
  }
  return d
}

/* Which target statuses are legal for a given stage right now. Any status not
   returned here is a forbidden transition (e.g. skipping ahead). */
export function allowedTransitions(steps: ClaimStep[], stage: number): StepStatus[] {
  const d = doneCount(steps)
  const current = statusOf(steps, stage)

  // Locked stages inside the done prefix (everything except the last done one).
  if (stage < d) return [current]

  // The last completed stage: may be reverted, but only if the next stage
  // hasn't been started yet (otherwise the prefix would break).
  if (stage === d) {
    const nextStarted = stage < TOTAL_STAGES && statusOf(steps, stage + 1) !== "pending"
    return nextStarted ? [current] : ["done", "in-progress", "pending"]
  }

  // The frontier stage (immediately after the done prefix): fully editable.
  if (stage === d + 1) return ["pending", "in-progress", "done"]

  // Anything further ahead is locked — no skipping.
  return [current]
}

export function canTransition(steps: ClaimStep[], stage: number, target: StepStatus): boolean {
  return allowedTransitions(steps, stage).includes(target)
}

/* Apply a validated transition, returning a new ledger. */
export function applyTransition(steps: ClaimStep[], stage: number, target: StepStatus): ClaimStep[] {
  return steps.map((s) => (s.stage === stage ? { ...s, status: target } : s))
}

export type MatchState = "match" | "discrepancy" | "pending"

export function matchState(claim: WorkflowClaim): MatchState {
  if (claim.receivedAmount <= 0) return "pending"
  if (claim.receivedAmount >= claim.requestedAmount) return "match"
  return "discrepancy"
}

export const matchLabels: Record<MatchState, string> = {
  match: "תואם",
  discrepancy: "פער",
  pending: "ממתין",
}

export function progressPercent(claim: WorkflowClaim): number {
  return claimProgressPercent(claim.uploadedDocCount)
}

/* Recompute the "current" stage from the step ledger. */
export function deriveCurrentStage(steps: ClaimStep[]): number {
  const inProgress = steps.find((s) => s.status === "in-progress")
  if (inProgress) return inProgress.stage
  const firstPending = steps.find((s) => s.status === "pending")
  return firstPending ? firstPending.stage : TOTAL_STAGES
}

export function stageLabel(stageId: number): string {
  return STAGES.find((s) => s.id === stageId)?.label ?? "—"
}

/** Payment / close gate: all docs validated and payment manually confirmed (Stage 6). */
export function isPaymentReceived(claim: WorkflowClaim): boolean {
  return claim.progressStatus === "completed" && claim.paymentConfirmed
}

/* Build a fresh 9-stage ledger for a new claim starting at stage 1. */
export function freshLedger(): { stage: number; status: StepStatus }[] {
  return STAGES.map((s) => ({ stage: s.id, status: s.id === 1 ? "in-progress" : "pending" }))
}

/* Financial buckets for the overview cards, derived from validated document progress. */
export function financialBuckets(claims: WorkflowClaim[]) {
  let legal = 0 // in progress (some docs validated, not complete)
  let trust = 0 // validated docs, funds not released
  let garage = 0 // paid out / file closed / funds released
  for (const c of claims) {
    if (c.closed || c.fundsReleased) garage += c.receivedAmount || c.requestedAmount
    else if (c.progressStatus === "completed" || c.progressStatus === "pending_resolution") {
      trust += c.receivedAmount || c.requestedAmount
    } else if (c.progressStatus === "in_progress") legal += c.requestedAmount
  }
  return { legal, trust, garage }
}
