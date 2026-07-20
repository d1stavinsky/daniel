// Required intake documents domain model (client-safe: no server imports).
// These required kinds are the ONLY documents supported for claims.

import type { ExtractedDataPayload, ExtractionStatus } from "@/lib/idp/types"

export type { ExtractedDataPayload, ExtractionStatus, IdpPilotKind } from "@/lib/idp/types"
export {
  IDP_PILOT_KINDS,
  IDP_FIELD_DEFS,
  IDP_KIND_LABELS,
  IDP_CONFIDENCE_THRESHOLD,
  IDP_FIELD_CONFIDENCE_THRESHOLD,
  isIdpPilotKind,
  parseExtractedData,
} from "@/lib/idp/types"

export type DocKind =
  | "demand_letter"
  | "insurance_policy"
  | "driver_license_client"
  | "repair_invoice"
  | "attorney_fee_invoice"
  | "accident_photos"
  | "owner_id"
  | "appraiser_report"
  | "trust_account_form"
  | "driver_license_third_party"
  | "vehicle_license_third_party"
  | "non_submission_confirmation"
  | "vehicle_license_client"
  | "insurance_to_trust_consent"
  | "power_of_attorney"

export type DocStatus = "pending" | "missing" | "uploaded" | "approved"

export type ClaimDoc = {
  id: string
  claimId: string
  partnerId: string
  kind: DocKind
  status: DocStatus
  fileName: string | null
  fileSize: number | null
  contentType: string | null
  note: string
  hasFile: boolean
  updatedAt: string
  /** Present for admin IDP pilot; partners may receive null/none. */
  extractionStatus?: ExtractionStatus | "none"
  extractionConfidence?: number | null
  extractedData?: ExtractedDataPayload | null
  extractionError?: string | null
  extractionModel?: string | null
  extractionReviewedBy?: string | null
  stpStatus?: "none" | "auto_verified" | "exception" | "chased"
  stpReason?: string | null
}

/** The canonical set of required documents every claim must collect, in order. */
export const REQUIRED_DOCS: {
  kind: DocKind
  label: string
  hint: string
  /** Canonical 6-stage business process stage blocked by this document. */
  workflowStage: 2 | 3 | 4 | 5
  /** When true, admins may upload many files for this kind. */
  allowsMultiple: boolean
}[] = [
  // Stage 2 — Setup
  {
    kind: "power_of_attorney",
    label: "ייפוי כוח",
    hint: "ייפוי כוח חתום לטיפול בתביעה",
    workflowStage: 2,
    allowsMultiple: false,
  },
  {
    kind: "insurance_policy",
    label: "פוליסת ביטוח",
    hint: "פוליסת הביטוח של רכב הלקוח",
    workflowStage: 2,
    allowsMultiple: false,
  },
  {
    kind: "insurance_to_trust_consent",
    label: "טופס הסכמה להעברת כספי ביטוח לחשבון נאמנות",
    hint: "הסכמה להעברת כספי ביטוח לחשבון נאמנות",
    workflowStage: 2,
    allowsMultiple: false,
  },
  {
    kind: "trust_account_form",
    label: "טופס ניהול חשבון נאמנות",
    hint: "טופס ניהול חשבון נאמנות",
    workflowStage: 2,
    allowsMultiple: false,
  },
  {
    kind: "driver_license_client",
    label: "רישיון נהיגה של נהג הרכב",
    hint: "רישיון נהיגה של נהג הרכב (לקוח)",
    workflowStage: 2,
    allowsMultiple: false,
  },
  {
    kind: "owner_id",
    label: "תעודת זהות של בעל הרכב",
    hint: "תעודת זהות של בעל הרכב",
    workflowStage: 2,
    allowsMultiple: false,
  },
  {
    kind: "driver_license_third_party",
    label: "רישיון נהיגה צד ג",
    hint: "רישיון נהיגה של צד ג׳",
    workflowStage: 2,
    allowsMultiple: false,
  },
  {
    kind: "vehicle_license_third_party",
    label: "רישיון רכב צד ג",
    hint: "רישיון רכב של צד ג׳",
    workflowStage: 2,
    allowsMultiple: false,
  },
  {
    kind: "non_submission_confirmation",
    label: "אישור אי הגשה",
    hint: "אישור אי הגשה",
    workflowStage: 2,
    allowsMultiple: false,
  },
  {
    kind: "vehicle_license_client",
    label: "רישיון רכב לקוח",
    hint: "רישיון רכב של הלקוח",
    workflowStage: 2,
    allowsMultiple: false,
  },
  // Stage 3 — Investigation
  {
    kind: "appraiser_report",
    label: "דו״ח שמאי",
    hint: "דוח שמאות רשמי",
    workflowStage: 3,
    allowsMultiple: false,
  },
  {
    kind: "repair_invoice",
    label: "חשבונית תיקון מהמוסך",
    hint: "חשבונית תיקון מהמוסך",
    workflowStage: 3,
    allowsMultiple: false,
  },
  {
    kind: "accident_photos",
    label: "תמונות תאונה",
    hint: "ניתן להעלות מספר תמונות בבת אחת",
    workflowStage: 3,
    allowsMultiple: true,
  },
  {
    kind: "attorney_fee_invoice",
    label: "חשבונית שכר טרחת עו״ד",
    hint: "חשבונית שכר טרחת עורך דין",
    workflowStage: 3,
    allowsMultiple: false,
  },
  // Stage 4 — Demand
  {
    kind: "demand_letter",
    label: "מכתב דרישה",
    hint: "מכתב דרישה רשמי",
    workflowStage: 4,
    allowsMultiple: false,
  },
]

export const DOC_KINDS: DocKind[] = REQUIRED_DOCS.map((d) => d.kind)

export const MULTI_FILE_DOC_KINDS: DocKind[] = REQUIRED_DOCS.filter((d) => d.allowsMultiple).map(
  (d) => d.kind,
)

export function docAllowsMultiple(kind: DocKind): boolean {
  return MULTI_FILE_DOC_KINDS.includes(kind)
}

export const docKindLabels: Record<DocKind, string> = Object.fromEntries(
  REQUIRED_DOCS.map((d) => [d.kind, d.label]),
) as Record<DocKind, string>

export const docKindWorkflowStage: Record<DocKind, 2 | 3 | 4 | 5> = Object.fromEntries(
  REQUIRED_DOCS.map((d) => [d.kind, d.workflowStage]),
) as Record<DocKind, 2 | 3 | 4 | 5>

export const docStatusLabels: Record<DocStatus, string> = {
  pending: "ממתין",
  missing: "חסר",
  uploaded: "הועלה",
  approved: "אושר",
}

/** Documents the admin has flagged as missing — informational for the garage. */
export function missingDocs(docs: ClaimDoc[]): ClaimDoc[] {
  return docs.filter((d) => d.status === "missing")
}

/** True if a claim has any outstanding missing-document flag. */
export function hasMissingDocs(docs: ClaimDoc[]): boolean {
  return docs.some((d) => d.status === "missing")
}

/** Completion ratio by distinct kinds (approved kinds / required kinds). */
export function docProgress(docs: ClaimDoc[]): { approved: number; total: number } {
  const byKind = new Map<DocKind, ClaimDoc[]>()
  for (const d of docs) {
    const list = byKind.get(d.kind) ?? []
    list.push(d)
    byKind.set(d.kind, list)
  }
  let approved = 0
  for (const kind of DOC_KINDS) {
    const rows = byKind.get(kind) ?? []
    const withFile = rows.filter((d) => d.hasFile)
    if (withFile.length > 0 && withFile.every((d) => d.status === "approved")) approved += 1
  }
  return { approved, total: DOC_KINDS.length }
}

/** Max upload size for intake documents (10 MB). */
export const MAX_DOC_BYTES = 10 * 1024 * 1024

export const ACCEPTED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"]
