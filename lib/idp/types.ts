/** Pilot kinds for Document Intelligence (P2). */
export const IDP_PILOT_KINDS = ["repair_invoice", "appraiser_report", "demand_letter"] as const

export type IdpPilotKind = (typeof IDP_PILOT_KINDS)[number]

export function isIdpPilotKind(kind: string): kind is IdpPilotKind {
  return (IDP_PILOT_KINDS as readonly string[]).includes(kind)
}

export type ExtractionStatus =
  | "none"
  | "processing"
  | "ready"
  | "needs_review"
  | "failed"
  | "reviewed"

export type ExtractedField = {
  key: string
  label: string
  value: string | number | null
  confidence: number // 0–1
}

export type ExtractedDataPayload = {
  kind: IdpPilotKind
  fields: ExtractedField[]
  overallConfidence: number
  notes?: string
  extractedAt: string
}

export type FieldDef = { key: string; label: string; description: string }

export const IDP_FIELD_DEFS: Record<IdpPilotKind, FieldDef[]> = {
  repair_invoice: [
    { key: "vendorName", label: "שם המוסך / ספק", description: "Business name on the invoice" },
    { key: "invoiceNumber", label: "מספר חשבונית", description: "Invoice / receipt number" },
    { key: "invoiceDate", label: "תאריך", description: "Invoice date ISO YYYY-MM-DD if possible" },
    { key: "totalAmount", label: "סכום כולל", description: "Total amount including VAT as number" },
    { key: "vatAmount", label: "מע״מ", description: "VAT amount as number if present" },
    { key: "plate", label: "מספר רכב", description: "Israeli license plate if present" },
  ],
  appraiser_report: [
    { key: "appraiserName", label: "שם שמאי", description: "Appraiser full name" },
    { key: "reportDate", label: "תאריך דוח", description: "Report date ISO YYYY-MM-DD" },
    { key: "estimatedDamage", label: "אומדן נזק", description: "Estimated damage amount as number" },
    { key: "plate", label: "מספר רכב", description: "Vehicle plate" },
    { key: "vehicleDescription", label: "תיאור רכב", description: "Make/model/year if present" },
  ],
  demand_letter: [
    { key: "claimantName", label: "שם התובע / שולח", description: "Claimant or sender name" },
    { key: "recipientName", label: "שם הנמען", description: "Recipient / insurer / party" },
    { key: "letterDate", label: "תאריך מכתב", description: "Letter date ISO YYYY-MM-DD" },
    { key: "demandedAmount", label: "סכום דרישה", description: "Demanded amount as number" },
    { key: "plate", label: "מספר רכב", description: "Vehicle plate if mentioned" },
    { key: "incidentDate", label: "תאריך אירוע", description: "Accident / loss date if present" },
  ],
}

export const IDP_KIND_LABELS: Record<IdpPilotKind, string> = {
  repair_invoice: "חשבונית תיקון",
  appraiser_report: "דו״ח שמאי",
  demand_letter: "מכתב דרישה",
}

/** Below this overall confidence → needs_review. */
export const IDP_CONFIDENCE_THRESHOLD = 0.75

/** Below this field confidence → highlight for HITL. */
export const IDP_FIELD_CONFIDENCE_THRESHOLD = 0.7

export function parseExtractedData(raw: string | null | undefined): ExtractedDataPayload | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ExtractedDataPayload
    if (!parsed || !Array.isArray(parsed.fields)) return null
    return parsed
  } catch {
    return null
  }
}
