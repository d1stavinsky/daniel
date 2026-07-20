/**
 * Ops Inbox — next-action derivation (S1).
 * Pure, client-safe: given a claim + document signals, pick nextAction + urgencyScore.
 */

import { DOC_KINDS, docKindWorkflowStage, type DocKind } from "@/lib/documents"
import { SIGNATURE_PENDING, SIGNATURE_VERIFIED, requiresAttorneySignature } from "@/lib/demand-letter-shared"
import {
  REQUIRED_DOC_COUNT,
} from "@/lib/claim-progress"
import { INTERNAL_AUDIT_PREFIX, STP_AUTO_VERIFY_CONFIDENCE } from "@/lib/stp/types"
import { SLA_BREACH_DAYS, STUCK_DAYS } from "@/lib/workflow-data"
import type { ClaimVerificationTone } from "@/lib/claim-verification"
import { deriveClaimVerification, type VerificationDocSignal } from "@/lib/claim-verification"

export type NextActionKind =
  | "internal_audit"
  | "stp_exception"
  | "pending_approval"
  | "pending_signature"
  | "missing_docs"
  | "stuck"
  | "pending_resolution"
  | "finance_gap"
  | "none"

/** Canonical business stages from BUSINESS_PROCESS.md. */
export type BusinessWorkflowStage = 1 | 2 | 3 | 4 | 5 | 6

export const businessWorkflowStageLabelsHe: Record<BusinessWorkflowStage, string> = {
  1: "קליטה",
  2: "הקמה",
  3: "חקירה",
  4: "דרישה",
  5: "מעקב",
  6: "סגירה",
}

/**
 * Short English CTA labels for UI / API consumers.
 * Hebrew copy lives in `reason` / `labelHe`.
 */
export const nextActionLabelsEn: Record<NextActionKind, string> = {
  internal_audit: "Internal Audit",
  stp_exception: "Review Mismatch",
  pending_approval: "Approve",
  pending_signature: "Mark Signed & Upload",
  missing_docs: "Request Docs",
  stuck: "Investigate Stuck",
  pending_resolution: "Confirm Payment",
  finance_gap: "Match Amounts",
  none: "None",
}

/** Hebrew labels for operator-facing rows. */
export const nextActionLabelsHe: Record<NextActionKind, string> = {
  internal_audit: "ביקורת פנימית",
  stp_exception: "סקירת חריג AI",
  pending_approval: "אישור",
  pending_signature: "סומן כחתום והעלה",
  missing_docs: "דרישת מסמכים",
  stuck: "תיק תקוע",
  pending_resolution: "אישור תקבול",
  finance_gap: "התאמת סכומים",
  none: "אין פעולה",
}

/** @deprecated Prefer nextActionLabelsHe — kept for existing imports. */
export const nextActionLabels = nextActionLabelsHe
/** @deprecated Prefer nextActionLabelsEn / labelEn. */
export const nextActionCtas = nextActionLabelsHe

/**
 * Base urgency by action kind (0–100). Higher = more urgent.
 * Age adds a secondary boost so older items rise within the same kind.
 */
export const NEXT_ACTION_BASE_URGENCY: Record<NextActionKind, number> = {
  internal_audit: 100,
  stp_exception: 100,
  pending_approval: 80,
  pending_signature: 70,
  missing_docs: 60,
  stuck: 40,
  pending_resolution: 75,
  finance_gap: 20,
  none: 0,
}

/** Lower number = higher urgency (legacy sort key; mirrors inverted base). */
export const NEXT_ACTION_PRIORITY: Record<NextActionKind, number> = {
  internal_audit: 1,
  stp_exception: 2,
  pending_approval: 3,
  pending_signature: 4,
  missing_docs: 5,
  stuck: 6,
  pending_resolution: 7,
  finance_gap: 8,
  none: 99,
}

export const INBOX_AGING_HOURS = 48

export type InboxDocSignal = VerificationDocSignal & {
  documentId?: string
  kindLabel?: string
  stpReason?: string | null
  updatedAt?: Date | string | null
  signatureStatus?: string | null
}

/** Claim-shaped input for next-action derivation. */
export type ClaimNextActionInput = {
  claimId: string
  clientName: string
  customerName?: string
  clientPhone?: string | null
  partnerId: string
  partnerName: string
  plate: string
  /** Original creation time, used to highlight fresh intake rows. */
  createdAt?: Date | string
  /** When the claim last moved progress (stageEnteredAt). */
  stageEnteredAt: Date | string
  closed?: boolean
  paymentConfirmed?: boolean
  requestedAmount?: number
  receivedAmount?: number
  docs: InboxDocSignal[]
}

export type ClaimNextActionResult = {
  nextAction: NextActionKind
  /** Canonical 1–6 business stage currently blocked or being processed. */
  workflowStage: BusinessWorkflowStage
  /** English CTA — e.g. "Approve", "Request Docs", "Review Mismatch". */
  labelEn: string
  /** Hebrew short label for RTL UI. */
  labelHe: string
  /** Hebrew one-line reason for the operator. */
  reason: string
  /**
   * Urgency 0–130+. Higher = more urgent.
   * Kind base (0–100) + age boost (up to +30 for ~30+ days).
   */
  urgencyScore: number
  /** Legacy: lower = higher urgency. */
  priority: number
  ageHours: number
  /** Age in whole days (floor). */
  ageDays: number
  verificationTone: ClaimVerificationTone
  /** SLA fail-safe: true when the claim sat in Investigation/Demand beyond SLA_BREACH_DAYS. */
  slaBreached: boolean
  /** Which SLA-monitored stage is breached (3 = Investigation, 4 = Demand). */
  slaStage?: 3 | 4
  documentId?: string
  documentKind?: string
  documentKindLabel?: string
}

export type ClaimInboxItem = ClaimNextActionResult & {
  claimId: string
  clientName: string
  customerName: string
  clientPhone: string | null
  partnerId: string
  partnerName: string
  plate: string
  createdAt: string | null
  /** Alias of labelHe for older consumers. */
  cta: string
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function ageHoursFrom(value: Date | string, now = new Date()): number {
  const ms = now.getTime() - toDate(value).getTime()
  return Math.max(0, Math.floor(ms / (60 * 60 * 1000)))
}

/** Age boost: ~1 point per day, capped at 30. */
export function ageUrgencyBoost(ageHours: number): number {
  return Math.min(30, Math.floor(ageHours / 24))
}

export function computeUrgencyScore(kind: NextActionKind, ageHours: number): number {
  if (kind === "none") return 0
  return NEXT_ACTION_BASE_URGENCY[kind] + ageUrgencyBoost(ageHours)
}

function isVerified(doc: InboxDocSignal): boolean {
  if (!(doc.status === "approved" || doc.stpStatus === "auto_verified")) return false
  if (requiresAttorneySignature(doc.kind) && doc.signatureStatus !== SIGNATURE_VERIFIED) {
    return false
  }
  return true
}

/** Cross-field Internal Audit flag (demand vs appraisal out of tolerance). */
function isInternalAuditDoc(doc: InboxDocSignal): boolean {
  return (
    doc.stpStatus === "exception" &&
    Boolean(doc.stpReason?.startsWith(INTERNAL_AUDIT_PREFIX))
  )
}

function isStpExceptionDoc(doc: InboxDocSignal): boolean {
  if (!doc.hasFile) return false
  if (doc.stpStatus === "exception" || doc.stpStatus === "chased") return true
  if (
    (doc.extractionStatus === "needs_review" ||
      doc.extractionStatus === "failed" ||
      doc.extractionStatus === "ready") &&
    doc.stpStatus !== "auto_verified" &&
    doc.status !== "approved"
  ) {
    return true
  }
  if (
    !isVerified(doc) &&
    doc.extractionConfidence != null &&
    doc.extractionConfidence / 100 <= STP_AUTO_VERIFY_CONFIDENCE
  ) {
    return true
  }
  return false
}

function isPendingApprovalDoc(doc: InboxDocSignal): boolean {
  if (!doc.hasFile || isVerified(doc) || isStpExceptionDoc(doc)) return false
  return doc.status === "uploaded" || doc.extractionStatus === "processing"
}

function workflowStageForDoc(kind: string): 2 | 3 | 4 | 5 {
  return docKindWorkflowStage[kind as DocKind] ?? 3
}

function findPendingSignatureDoc(
  docs: InboxDocSignal[],
): InboxDocSignal | undefined {
  return docs.find(
    (d) => d.kind === "demand_letter" && d.signatureStatus === SIGNATURE_PENDING && !isVerified(d),
  )
}

function findMissingKind(
  docs: InboxDocSignal[],
): { kind: string; kindLabel?: string; workflowStage: 2 | 3 | 4 | 5 } | null {
  const byKind = new Map<string, InboxDocSignal[]>()
  for (const d of docs) {
    const list = byKind.get(d.kind) ?? []
    list.push(d)
    byKind.set(d.kind, list)
  }

  for (const kind of DOC_KINDS) {
    const rows = byKind.get(kind) ?? []
    if (rows.some((d) => d.status === "missing")) {
      return { kind, kindLabel: rows[0]?.kindLabel, workflowStage: workflowStageForDoc(kind) }
    }
    const withFile = rows.filter((d) => d.hasFile)
    if (withFile.length === 0) {
      return { kind, kindLabel: rows[0]?.kindLabel, workflowStage: workflowStageForDoc(kind) }
    }
  }
  return null
}

function pickNewest(docs: InboxDocSignal[]): InboxDocSignal | undefined {
  if (docs.length === 0) return undefined
  return [...docs].sort((a, b) => {
    const ta = a.updatedAt ? toDate(a.updatedAt).getTime() : 0
    const tb = b.updatedAt ? toDate(b.updatedAt).getTime() : 0
    return tb - ta
  })[0]
}

function stpReasonText(doc: InboxDocSignal): string {
  if (doc.stpReason?.trim()) return doc.stpReason.trim().slice(0, 120)
  if (doc.extractionStatus === "failed") return "חילוץ AI נכשל — נדרשת סקירה"
  if (doc.extractionStatus === "needs_review") return "חילוץ דורש אימות ידני"
  if (
    doc.extractionConfidence != null &&
    doc.extractionConfidence / 100 <= STP_AUTO_VERIFY_CONFIDENCE
  ) {
    return `ביטחון חילוץ ${doc.extractionConfidence}% — מתחת לסף`
  }
  if (doc.stpStatus === "chased") return "נשלחה דרישה לשותף — ממתין למענה"
  return "חריג STP — נדרשת החלטה"
}

function countValidatedKinds(docs: InboxDocSignal[]): number {
  const byKind = new Map<string, InboxDocSignal[]>()
  for (const doc of docs) {
    const list = byKind.get(doc.kind) ?? []
    list.push(doc)
    byKind.set(doc.kind, list)
  }

  let count = 0
  for (const kind of DOC_KINDS) {
    const rows = byKind.get(kind) ?? []
    const withFile = rows.filter((doc) => doc.hasFile)
    if (withFile.length > 0 && withFile.every(isVerified)) {
      count += 1
    }
  }
  return count
}

function docsComplete(docs: InboxDocSignal[]): boolean {
  return countValidatedKinds(docs) >= REQUIRED_DOC_COUNT
}

/**
 * First canonical business stage with an unresolved (not fully validated)
 * required document. Returns 6 when everything is validated.
 */
export function unresolvedWorkflowStage(docs: InboxDocSignal[]): BusinessWorkflowStage {
  const byKind = new Map<string, InboxDocSignal[]>()
  for (const doc of docs) {
    const list = byKind.get(doc.kind) ?? []
    list.push(doc)
    byKind.set(doc.kind, list)
  }

  for (const kind of DOC_KINDS) {
    const rows = byKind.get(kind) ?? []
    const withFile = rows.filter((d) => d.hasFile)
    const validated = withFile.length > 0 && withFile.every(isVerified)
    if (!validated) return workflowStageForDoc(kind)
  }
  return 6
}

/** SLA fail-safe: breached when Investigation/Demand is unresolved beyond SLA_BREACH_DAYS. */
export function deriveSlaBreach(
  docs: InboxDocSignal[],
  ageHours: number,
  closed: boolean,
): { breached: boolean; stage?: 3 | 4 } {
  if (closed) return { breached: false }
  if (ageHours < SLA_BREACH_DAYS * 24) return { breached: false }
  const stage = unresolvedWorkflowStage(docs)
  if (stage === 3 || stage === 4) return { breached: true, stage }
  return { breached: false }
}

function packResult(
  kind: NextActionKind,
  workflowStage: BusinessWorkflowStage,
  ageHours: number,
  verificationTone: ClaimVerificationTone,
  reason: string,
  extra?: Pick<ClaimNextActionResult, "documentId" | "documentKind" | "documentKindLabel">,
): ClaimNextActionResult {
  return {
    nextAction: kind,
    workflowStage,
    labelEn: nextActionLabelsEn[kind],
    labelHe: nextActionLabelsHe[kind],
    reason,
    urgencyScore: computeUrgencyScore(kind, ageHours),
    priority: NEXT_ACTION_PRIORITY[kind],
    ageHours,
    ageDays: Math.floor(ageHours / 24),
    verificationTone,
    slaBreached: false,
    ...extra,
  }
}

/** SLA urgency floor for breached items — lands in the "urgent" band. */
const SLA_URGENCY_FLOOR = 95

/**
 * Determine nextAction + urgencyScore for a claim from status, age, and doc verification.
 * Priority ladder: Internal Audit > Review Mismatch > Approve > Request Docs > Stuck > Resolution > Finance > None.
 * SLA overlay: Investigation/Demand items older than SLA_BREACH_DAYS are marked breached.
 */
export function getClaimNextAction(
  claim: ClaimNextActionInput,
  now = new Date(),
): ClaimNextActionResult {
  const result = deriveLadderAction(claim, now)
  if (result.nextAction === "none" && claim.closed) return result

  const sla = deriveSlaBreach(claim.docs, result.ageHours, Boolean(claim.closed))
  if (!sla.breached) return result

  return {
    ...result,
    slaBreached: true,
    slaStage: sla.stage,
    urgencyScore: Math.max(result.urgencyScore, SLA_URGENCY_FLOOR + ageUrgencyBoost(result.ageHours)),
  }
}

function deriveLadderAction(
  claim: ClaimNextActionInput,
  now = new Date(),
): ClaimNextActionResult {
  const verification = deriveClaimVerification(claim.docs)
  const ageHours = ageHoursFrom(claim.stageEnteredAt, now)

  if (claim.closed) {
    return packResult("none", 6, ageHours, verification.tone, "תיק סגור")
  }

  const auditDocs = claim.docs.filter(isInternalAuditDoc)
  if (auditDocs.length > 0) {
    const doc = pickNewest(auditDocs)!
    const label = doc.kindLabel ?? doc.kind
    return packResult(
      "internal_audit",
      4,
      ageHours,
      verification.tone,
      doc.stpReason?.trim().slice(0, 160) ??
        `${label}: סכום הדרישה חורג מדוח השמאי — נדרשת ביקורת פנימית`,
      {
        documentId: doc.documentId,
        documentKind: doc.kind,
        documentKindLabel: label,
      },
    )
  }

  const exceptionDocs = claim.docs.filter(isStpExceptionDoc)
  if (exceptionDocs.length > 0) {
    const doc = pickNewest(exceptionDocs)!
    const label = doc.kindLabel ?? doc.kind
    return packResult(
      "stp_exception",
      workflowStageForDoc(doc.kind),
      ageHours,
      verification.tone,
      `${label}: ${stpReasonText(doc)}`,
      {
        documentId: doc.documentId,
        documentKind: doc.kind,
        documentKindLabel: label,
      },
    )
  }

  const pendingDocs = claim.docs.filter(isPendingApprovalDoc)
  if (pendingDocs.length > 0) {
    const doc = pickNewest(pendingDocs)!
    const label = doc.kindLabel ?? doc.kind
    return packResult(
      "pending_approval",
      workflowStageForDoc(doc.kind),
      ageHours,
      verification.tone,
      `${label} ממתין לאישור`,
      {
        documentId: doc.documentId,
        documentKind: doc.kind,
        documentKindLabel: label,
      },
    )
  }

  const pendingSignature = findPendingSignatureDoc(claim.docs)
  if (pendingSignature) {
    const label = pendingSignature.kindLabel ?? "מכתב דרישה"
    return packResult(
      "pending_signature",
      4,
      ageHours,
      verification.tone,
      `${label} — טיוטה הופקה, ממתין לחתימת עו״ד והעלאת סריקה`,
      {
        documentId: pendingSignature.documentId,
        documentKind: pendingSignature.kind,
        documentKindLabel: label,
      },
    )
  }

  const missing = findMissingKind(claim.docs)
  if (missing) {
    return packResult(
      "missing_docs",
      missing.workflowStage,
      ageHours,
      verification.tone,
      `חסר מסמך: ${missing.kindLabel ?? missing.kind}`,
      {
        documentKind: missing.kind,
        documentKindLabel: missing.kindLabel,
      },
    )
  }

  if (ageHours >= STUCK_DAYS * 24 && verification.tone !== "green") {
    return packResult(
      "stuck",
      5,
      ageHours,
      verification.tone,
      `ללא התקדמות מעל ${STUCK_DAYS} ימים`,
    )
  }

  if (docsComplete(claim.docs) && !claim.paymentConfirmed) {
    return packResult(
      "pending_resolution",
      6,
      ageHours,
      verification.tone,
      "כל המסמכים אומתו — ממתין לאישור תקבול",
    )
  }

  const requested = claim.requestedAmount ?? 0
  const received = claim.receivedAmount ?? 0
  if (requested > 0 && received > 0 && received < requested) {
    return packResult("finance_gap", 6, ageHours, verification.tone, "פער בין סכום נדרש להתקבל")
  }

  return packResult("none", verification.tone === "green" ? 5 : 1, ageHours, verification.tone, "אין פעולה נדרשת")
}

/**
 * Full inbox row from claim input (next action + identity fields).
 * Prefer this when building lists for the UI.
 */
export function deriveClaimNextAction(
  input: ClaimNextActionInput,
  now = new Date(),
): ClaimInboxItem {
  const result = getClaimNextAction(input, now)
  return {
    claimId: input.claimId,
    clientName: input.clientName,
    customerName: input.customerName || input.clientName,
    clientPhone: input.clientPhone ?? null,
    partnerId: input.partnerId,
    partnerName: input.partnerName,
    plate: input.plate,
    createdAt: input.createdAt ? toDate(input.createdAt).toISOString() : null,
    ...result,
    cta: result.labelHe,
  }
}

/** Highest urgencyScore first; tie-break older first. */
export function sortInboxItems(items: ClaimInboxItem[]): ClaimInboxItem[] {
  return [...items].sort((a, b) => {
    if (b.urgencyScore !== a.urgencyScore) return b.urgencyScore - a.urgencyScore
    return b.ageHours - a.ageHours
  })
}

export function filterInboxByAction(
  items: ClaimInboxItem[],
  action: NextActionKind | "all",
): ClaimInboxItem[] {
  if (action === "all") return items.filter((i) => i.nextAction !== "none")
  return items.filter((i) => i.nextAction === action)
}
