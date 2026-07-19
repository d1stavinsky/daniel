/**
 * Cross-field validation (P3): demand letter vs appraiser (Shamai) report.
 * Flags an "Internal Audit" STP exception on the demand letter when the
 * demanded amount exceeds the appraisal estimate beyond tolerance, and
 * blocks claim submission until the mismatch is resolved.
 */

import { and, eq, inArray, isNotNull, like } from "drizzle-orm"
import { db } from "@/lib/db"
import { claimDocument } from "@/lib/db/schema"
import { recordClaimEvent } from "@/lib/claim-events"
import { parseExtractedData } from "@/lib/idp/types"
import {
  DEMAND_VS_APPRAISAL_TOLERANCE,
  INTERNAL_AUDIT_PREFIX,
} from "@/lib/stp/types"

const SYSTEM_ACTOR = "system:cross-field-audit"

const CROSS_FIELD_KINDS = ["demand_letter", "appraiser_report"] as const

export type CrossFieldAuditResult = {
  /** true when the audit produced (or kept) an Internal Audit flag. */
  flagged: boolean
  /** true when a prior Internal Audit flag was cleared by this run. */
  cleared: boolean
  demandedAmount: number | null
  estimatedDamage: number | null
  /** Relative excess of demand over appraisal (0.25 = +25%). Null when not comparable. */
  excessRatio: number | null
  reason: string | null
}

export function isInternalAuditReason(reason: string | null | undefined): boolean {
  return Boolean(reason?.startsWith(INTERNAL_AUDIT_PREFIX))
}

/** True when the demand/appraisal pair is comparable and out of tolerance. */
export function demandExceedsAppraisal(
  demandedAmount: number,
  estimatedDamage: number,
  tolerance = DEMAND_VS_APPRAISAL_TOLERANCE,
): boolean {
  if (!Number.isFinite(demandedAmount) || !Number.isFinite(estimatedDamage)) return false
  if (estimatedDamage <= 0) return false
  return demandedAmount > estimatedDamage * (1 + tolerance)
}

function numericField(raw: string | null, key: string): number | null {
  const payload = parseExtractedData(raw)
  const value = payload?.fields.find((f) => f.key === key)?.value
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""))
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

/**
 * Run the demand-vs-appraisal audit for a claim. Persists an Internal Audit
 * exception on the demand letter when out of tolerance; clears a prior
 * internal-audit flag when the pair is back within tolerance.
 * Skips silently when either amount is not yet extracted.
 */
export async function runDemandAppraisalAudit(claimId: string): Promise<CrossFieldAuditResult> {
  const rows = await db
    .select({
      id: claimDocument.id,
      partnerId: claimDocument.partnerId,
      kind: claimDocument.kind,
      status: claimDocument.status,
      blobPathname: claimDocument.blobPathname,
      extractedData: claimDocument.extractedData,
      stpStatus: claimDocument.stpStatus,
      stpReason: claimDocument.stpReason,
    })
    .from(claimDocument)
    .where(
      and(
        eq(claimDocument.claimId, claimId),
        inArray(claimDocument.kind, [...CROSS_FIELD_KINDS]),
        isNotNull(claimDocument.blobPathname),
      ),
    )

  const demand = rows.find((r) => r.kind === "demand_letter") ?? null
  const appraisal = rows.find((r) => r.kind === "appraiser_report") ?? null

  const none: CrossFieldAuditResult = {
    flagged: false,
    cleared: false,
    demandedAmount: null,
    estimatedDamage: null,
    excessRatio: null,
    reason: null,
  }

  if (!demand || !appraisal) return none

  const demandedAmount = numericField(demand.extractedData, "demandedAmount")
  const estimatedDamage = numericField(appraisal.extractedData, "estimatedDamage")
  if (demandedAmount == null || estimatedDamage == null || estimatedDamage <= 0) {
    return { ...none, demandedAmount, estimatedDamage }
  }

  const excessRatio = demandedAmount / estimatedDamage - 1
  const now = new Date()
  const hadAuditFlag = demand.stpStatus === "exception" && isInternalAuditReason(demand.stpReason)

  if (demandExceedsAppraisal(demandedAmount, estimatedDamage)) {
    const reason =
      `${INTERNAL_AUDIT_PREFIX}: סכום הדרישה (₪${demandedAmount.toLocaleString("he-IL")}) ` +
      `חורג מדוח השמאי (₪${estimatedDamage.toLocaleString("he-IL")}) ` +
      `ב־${Math.round(excessRatio * 100)}% — מעל סף ${Math.round(DEMAND_VS_APPRAISAL_TOLERANCE * 100)}%`

    await db
      .update(claimDocument)
      .set({
        // Revoke validation so the demand letter cannot count toward progress.
        status: "uploaded",
        extractionStatus: "needs_review",
        stpStatus: "exception",
        stpReason: reason.slice(0, 800),
        stpDecidedAt: now,
        updatedAt: now,
      })
      .where(eq(claimDocument.id, demand.id))

    if (!hadAuditFlag) {
      await recordClaimEvent({
        claimId,
        partnerId: demand.partnerId,
        type: "internal_audit_flagged",
        actorUserId: SYSTEM_ACTOR,
        actorRole: "system",
        documentId: demand.id,
        documentKind: "demand_letter",
        meta: { demandedAmount, estimatedDamage, excessRatio },
      })
    }

    return { flagged: true, cleared: false, demandedAmount, estimatedDamage, excessRatio, reason }
  }

  // Back within tolerance: clear only our own audit flag, never other exceptions.
  if (hadAuditFlag) {
    await db
      .update(claimDocument)
      .set({
        stpStatus: "none",
        stpReason: "ביקורת פנימית נסגרה — הסכומים בטווח התקין",
        stpDecidedAt: now,
        updatedAt: now,
      })
      .where(eq(claimDocument.id, demand.id))

    await recordClaimEvent({
      claimId,
      partnerId: demand.partnerId,
      type: "internal_audit_cleared",
      actorUserId: SYSTEM_ACTOR,
      actorRole: "system",
      documentId: demand.id,
      documentKind: "demand_letter",
      meta: { demandedAmount, estimatedDamage, excessRatio },
    })

    return { flagged: false, cleared: true, demandedAmount, estimatedDamage, excessRatio, reason: null }
  }

  return { ...none, demandedAmount, estimatedDamage, excessRatio }
}

/**
 * Submission gate: throw while any Internal Audit flag is open on the claim.
 * Called before payment confirmation / claim closure.
 */
export async function assertNoOpenInternalAudit(claimId: string): Promise<void> {
  const [flagged] = await db
    .select({ id: claimDocument.id, stpReason: claimDocument.stpReason })
    .from(claimDocument)
    .where(
      and(
        eq(claimDocument.claimId, claimId),
        eq(claimDocument.stpStatus, "exception"),
        like(claimDocument.stpReason, `${INTERNAL_AUDIT_PREFIX}%`),
      ),
    )
    .limit(1)

  if (flagged) {
    throw new Error(
      "ביקורת פנימית פתוחה: סכום מכתב הדרישה חורג מדוח השמאי. יש לתקן את הנתונים לפני התקדמות.",
    )
  }
}
