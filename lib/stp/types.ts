/** STP (straight-through processing) policy constants — P3. */

/** Auto-verify (אומת) only when overall IDP confidence is strictly above this. */
export const STP_AUTO_VERIFY_CONFIDENCE = 0.95

/** Amount mismatch tolerance vs claim.requestedAmount (relative). */
export const STP_AMOUNT_TOLERANCE = 0.2

/**
 * Cross-field audit (P3): demand letter amount may exceed the appraiser
 * estimate by at most this relative margin before an Internal Audit flag.
 */
export const DEMAND_VS_APPRAISAL_TOLERANCE = 0.2

/** Machine-readable prefix stamped on stpReason for cross-field audit flags. */
export const INTERNAL_AUDIT_PREFIX = "Internal Audit" as const

export type StpStatus = "none" | "auto_verified" | "exception" | "chased"

export type StpDecisionCode =
  | "auto_verified"
  | "low_confidence"
  | "validation_failed"
  | "extraction_failed"
  | "missing_doc"

export type ValidationIssue = {
  code: "plate_mismatch" | "amount_mismatch" | "missing_critical_field"
  message: string
  field?: string
}

export type StpDecision = {
  status: StpStatus
  code: StpDecisionCode
  reason: string
  issues: ValidationIssue[]
  autoApproved: boolean
}
