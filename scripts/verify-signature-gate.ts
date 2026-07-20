/**
 * Final validation for ZT-0 / ZT-1 signature hard-block (Priority 1 residual gap).
 * Usage: npx tsx scripts/verify-signature-gate.ts
 */

import {
  assertAttorneySignatureVerifiedForApproval,
  requiresAttorneySignature,
  SIGNATURE_PENDING,
  SIGNATURE_VERIFIED,
} from "@/lib/demand-letter-shared"
import { isValidatedDocumentRow } from "@/lib/document-workflow-gates"
import { getClaimNextAction, type InboxDocSignal } from "@/lib/ops/next-action"
import { DOC_KINDS, type DocKind } from "@/lib/documents"

let failures = 0
function check(name: string, ok: boolean) {
  if (!ok) failures++
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`)
}

function doc(kind: DocKind, o: Partial<InboxDocSignal> = {}): InboxDocSignal {
  return {
    kind,
    status: "approved",
    hasFile: true,
    extractionStatus: "none",
    extractionConfidence: null,
    stpStatus: "none",
    ...o,
  }
}

// --- requiresAttorneySignature ----------------------------------------------
check("demand_letter requires attorney signature", requiresAttorneySignature("demand_letter"))
check("appraiser_report does not require attorney signature", !requiresAttorneySignature("appraiser_report"))

// --- approve hard-block -----------------------------------------------------
let blocked = false
try {
  assertAttorneySignatureVerifiedForApproval({
    kind: "demand_letter",
    signatureStatus: SIGNATURE_PENDING,
  })
} catch {
  blocked = true
}
check("approve blocked when signatureStatus=pending_signature", blocked)

blocked = false
try {
  assertAttorneySignatureVerifiedForApproval({
    kind: "demand_letter",
    signatureStatus: null,
  })
} catch {
  blocked = true
}
check("approve blocked when signatureStatus=null", blocked)

blocked = false
try {
  assertAttorneySignatureVerifiedForApproval({
    kind: "demand_letter",
    signatureStatus: "signed_uploaded",
  })
} catch {
  blocked = true
}
check("approve blocked when signatureStatus is not exactly verified", blocked)

let allowed = true
try {
  assertAttorneySignatureVerifiedForApproval({
    kind: "demand_letter",
    signatureStatus: SIGNATURE_VERIFIED,
  })
} catch {
  allowed = false
}
check("approve allowed when signatureStatus=verified", allowed)

allowed = true
try {
  assertAttorneySignatureVerifiedForApproval({
    kind: "appraiser_report",
    signatureStatus: null,
  })
} catch {
  allowed = false
}
check("non-signature docs still approvable without signatureStatus", allowed)

// --- validated count ignores unverified demand ------------------------------
check(
  "approved demand without verified signature is NOT validated",
  !isValidatedDocumentRow({
    kind: "demand_letter",
    status: "approved",
    blobPathname: "x",
    stpStatus: "none",
    signatureStatus: SIGNATURE_PENDING,
  }),
)
check(
  "approved demand with verified signature IS validated",
  isValidatedDocumentRow({
    kind: "demand_letter",
    status: "approved",
    blobPathname: "x",
    stpStatus: "none",
    signatureStatus: SIGNATURE_VERIFIED,
  }),
)
check(
  "approved demand with null signature is NOT validated (no override)",
  !isValidatedDocumentRow({
    kind: "demand_letter",
    status: "approved",
    blobPathname: "x",
    stpStatus: "none",
    signatureStatus: null,
  }),
)

// --- inbox: pending_signature still wins when draft pending -----------------
const pendingInbox = getClaimNextAction({
  claimId: "T-sig",
  clientName: "c",
  partnerId: "p",
  partnerName: "n",
  plate: "1",
  stageEnteredAt: new Date(),
  docs: DOC_KINDS.map((k) =>
    k === "demand_letter"
      ? doc(k, {
          status: "pending",
          hasFile: false,
          signatureStatus: SIGNATURE_PENDING,
        })
      : doc(k),
  ),
})
check("inbox shows pending_signature for unsigned demand", pendingInbox.nextAction === "pending_signature")

// Staff-approved-but-unverified demand must not count as complete / resolution
const fakeApproved = getClaimNextAction({
  claimId: "T-bypass",
  clientName: "c",
  partnerId: "p",
  partnerName: "n",
  plate: "1",
  stageEnteredAt: new Date(),
  docs: DOC_KINDS.map((k) =>
    k === "demand_letter"
      ? doc(k, { status: "approved", signatureStatus: SIGNATURE_PENDING })
      : doc(k),
  ),
})
check(
  "fake-approved pending_signature demand does not reach pending_resolution",
  fakeApproved.nextAction !== "pending_resolution" && fakeApproved.nextAction !== "none",
)

console.log(failures === 0 ? "\nSignature gate residual path CLOSED." : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
