/**
 * Client-safe demand-letter constants & pure signature gates.
 * Do NOT import DB / Blob / server modules here — used by Ops Inbox & upload UI.
 */

import type { DocKind } from "@/lib/documents"

export const SIGNATURE_PENDING = "pending_signature" as const
/** Set only after signed upload passes the Demand version-hash gate. */
export const SIGNATURE_VERIFIED = "verified" as const
export const DEMAND_LETTER_KIND: DocKind = "demand_letter"

/** Doc kinds that require wet attorney signature before approval/validation. */
export const ATTORNEY_SIGNATURE_REQUIRED_KINDS: readonly DocKind[] = [DEMAND_LETTER_KIND]

export function requiresAttorneySignature(kind: string): boolean {
  return (ATTORNEY_SIGNATURE_REQUIRED_KINDS as readonly string[]).includes(kind)
}

export function isAttorneySignatureVerified(
  signatureStatus: string | null | undefined,
): boolean {
  return signatureStatus === SIGNATURE_VERIFIED
}

/**
 * Hard block for manual and automated approval paths.
 * Signature-required docs may only proceed when signatureStatus === verified.
 */
export function assertAttorneySignatureVerifiedForApproval(input: {
  kind: string
  signatureStatus: string | null | undefined
}): void {
  if (!requiresAttorneySignature(input.kind)) return
  if (isAttorneySignatureVerified(input.signatureStatus)) return
  throw new Error(
    "לא ניתן לאשר מכתב דרישה לפני אימות חתימת עו״ד. יש להעלות את הסריקה החתומה דרך «סומן כחתום והעלה» ולאמת את גרסת הטיוטה.",
  )
}
