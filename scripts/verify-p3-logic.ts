/**
 * Focused verification for Priority 3 pure logic (no DB required).
 * Usage: npx tsx scripts/verify-p3-logic.ts
 */

import {
  deriveSlaBreach,
  getClaimNextAction,
  unresolvedWorkflowStage,
  type InboxDocSignal,
} from "@/lib/ops/next-action"
import { demandExceedsAppraisal } from "@/lib/stp/cross-field"
import { INTERNAL_AUDIT_PREFIX } from "@/lib/stp/types"
import { DOC_KINDS, docKindWorkflowStage, type DocKind } from "@/lib/documents"

let failures = 0
function check(name: string, ok: boolean) {
  if (!ok) failures++
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`)
}

function doc(kind: DocKind, overrides: Partial<InboxDocSignal> = {}): InboxDocSignal {
  return {
    kind,
    status: "approved",
    hasFile: true,
    extractionStatus: "none",
    extractionConfidence: null,
    stpStatus: "none",
    // Signature-required kinds must be verified to count as validated.
    ...(kind === "demand_letter" ? { signatureStatus: "verified" } : {}),
    ...overrides,
  }
}

/** All docs validated except the given kinds (left as pending, no file). */
function docsWithPending(pendingKinds: DocKind[]): InboxDocSignal[] {
  return DOC_KINDS.map((kind) =>
    pendingKinds.includes(kind)
      ? doc(kind, { status: "pending", hasFile: false })
      : doc(kind),
  )
}

// --- Cross-field tolerance -------------------------------------------------
check("demand 121k vs appraisal 100k → exceeds (20% tolerance)", demandExceedsAppraisal(121_000, 100_000))
check("demand 120k vs appraisal 100k → within tolerance (inclusive)", !demandExceedsAppraisal(120_000, 100_000))
check("demand 100k vs appraisal 100k → within tolerance", !demandExceedsAppraisal(100_000, 100_000))
check("appraisal 0 → not comparable, no flag", !demandExceedsAppraisal(50_000, 0))
check("NaN demand → no flag", !demandExceedsAppraisal(Number.NaN, 100_000))

// --- Unresolved workflow stage ----------------------------------------------
check(
  "pending appraiser_report → stage 3",
  unresolvedWorkflowStage(docsWithPending(["appraiser_report"])) === 3,
)
check(
  "pending demand_letter only → stage 4",
  unresolvedWorkflowStage(docsWithPending(["demand_letter"])) === 4,
)
check(
  "pending power_of_attorney → stage 2",
  unresolvedWorkflowStage(docsWithPending(["power_of_attorney"])) === 2,
)
check("all validated → stage 6", unresolvedWorkflowStage(docsWithPending([])) === 6)

// --- SLA breach derivation ---------------------------------------------------
const H8D = 8 * 24 // 8 days in hours
const H3D = 3 * 24

check(
  "stage 3 pending, 8 days → SLA breached (stage 3)",
  deriveSlaBreach(docsWithPending(["repair_invoice"]), H8D, false).breached &&
    deriveSlaBreach(docsWithPending(["repair_invoice"]), H8D, false).stage === 3,
)
check(
  "stage 4 pending, 8 days → SLA breached (stage 4)",
  deriveSlaBreach(docsWithPending(["demand_letter"]), H8D, false).stage === 4,
)
check(
  "stage 3 pending, 3 days → no breach",
  !deriveSlaBreach(docsWithPending(["repair_invoice"]), H3D, false).breached,
)
check(
  "stage 2 pending, 8 days → no breach (SLA only covers 3/4)",
  !deriveSlaBreach(docsWithPending(["owner_id"]), H8D, false).breached,
)
check(
  "closed claim → no breach",
  !deriveSlaBreach(docsWithPending(["demand_letter"]), H8D, true).breached,
)

// --- Next-action integration --------------------------------------------------
const now = new Date()
const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000)

const breachedClaim = getClaimNextAction(
  {
    claimId: "T-1",
    clientName: "בדיקה",
    partnerId: "p1",
    partnerName: "שותף",
    plate: "1234567",
    stageEnteredAt: eightDaysAgo,
    docs: docsWithPending(["demand_letter"]),
  },
  now,
)
check("breached claim carries slaBreached=true", breachedClaim.slaBreached)
check("breached claim urgency lands in urgent band (>=95)", breachedClaim.urgencyScore >= 95)

const auditClaim = getClaimNextAction(
  {
    claimId: "T-2",
    clientName: "בדיקה",
    partnerId: "p1",
    partnerName: "שותף",
    plate: "1234567",
    stageEnteredAt: now,
    docs: DOC_KINDS.map((kind) =>
      kind === "demand_letter"
        ? doc(kind, {
            status: "uploaded",
            stpStatus: "exception",
            stpReason: `${INTERNAL_AUDIT_PREFIX}: סכום הדרישה חורג מדוח השמאי ב־25%`,
            signatureStatus: "verified",
          })
        : doc(kind),
    ),
  },
  now,
)
check("internal audit flag wins the ladder", auditClaim.nextAction === "internal_audit")
check("internal audit is critical urgency (>=100)", auditClaim.urgencyScore >= 100)
check("internal audit maps to Demand stage 4", auditClaim.workflowStage === 4)

// stage map sanity
check(
  "doc stage map: appraiser=3, demand=4",
  docKindWorkflowStage.appraiser_report === 3 && docKindWorkflowStage.demand_letter === 4,
)

console.log(failures === 0 ? "\nAll P3 logic checks passed." : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
