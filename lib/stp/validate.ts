import { plateDigits } from "@/lib/validation"
import {
  STP_AMOUNT_TOLERANCE,
  type ValidationIssue,
} from "@/lib/stp/types"
import type { ExtractedDataPayload, IdpPilotKind } from "@/lib/idp/types"

function fieldValue(
  payload: ExtractedDataPayload,
  key: string,
): string | number | null {
  return payload.fields.find((f) => f.key === key)?.value ?? null
}

function amountsClose(a: number, b: number, tolerance = STP_AMOUNT_TOLERANCE): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  if (b === 0) return Math.abs(a) < 1
  return Math.abs(a - b) / Math.abs(b) <= tolerance
}

/**
 * Cross-check extracted fields against the claim record.
 * Only flags mismatches when the extracted value is present.
 */
export function validateExtractionAgainstClaim(input: {
  kind: IdpPilotKind
  payload: ExtractedDataPayload
  claimPlate: string
  requestedAmount: number
}): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const { kind, payload, claimPlate, requestedAmount } = input

  const extractedPlate = fieldValue(payload, "plate")
  if (extractedPlate != null && String(extractedPlate).trim() !== "") {
    const a = plateDigits(String(extractedPlate))
    const b = plateDigits(claimPlate)
    if (a && b && a !== b) {
      issues.push({
        code: "plate_mismatch",
        field: "plate",
        message: `מספר רכב בחילוץ (${extractedPlate}) אינו תואם לתיק (${claimPlate})`,
      })
    }
  }

  const amountKey =
    kind === "repair_invoice"
      ? "totalAmount"
      : kind === "demand_letter"
        ? "demandedAmount"
        : "estimatedDamage"
  const amountRaw = fieldValue(payload, amountKey)
  if (typeof amountRaw === "number" && Number.isFinite(amountRaw) && requestedAmount > 0) {
    if (!amountsClose(amountRaw, requestedAmount)) {
      issues.push({
        code: "amount_mismatch",
        field: amountKey,
        message: `סכום בחילוץ (${amountRaw}) חורג מהסכום בתיק (${requestedAmount}) מעבר ל־${Math.round(STP_AMOUNT_TOLERANCE * 100)}%`,
      })
    }
  }

  return issues
}
