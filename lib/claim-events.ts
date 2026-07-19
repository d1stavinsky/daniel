import { randomUUID } from "crypto"
import { db } from "@/lib/db"
import { claimEvent } from "@/lib/db/schema"

export type ClaimEventType =
  | "doc_uploaded"
  | "doc_approved"
  | "doc_missing"
  | "doc_reset"
  | "doc_removed"
  | "doc_viewed"
  | "progress_synced"
  | "idp_extracted"
  | "idp_reviewed"
  | "stp_auto_verified"
  | "stp_exception"
  | "stp_chase"
  | "payment_confirmed"
  | "demand_draft_generated"
  | "demand_version_mismatch"
  | "internal_audit_flagged"
  | "internal_audit_cleared"
  | "sla_breach"
  | "claim_created"
  | "client_intake_submitted"
  | "manual_email_sent"
  | "inbound_email_received"
  | "inbound_attachment_saved"

/**
 * Append-only claim audit event. Never throws to callers — logging must not
 * break the primary mutation path.
 */
export async function recordClaimEvent(input: {
  claimId: string
  partnerId: string
  type: ClaimEventType
  actorUserId?: string | null
  actorRole?: string | null
  documentId?: string | null
  documentKind?: string | null
  meta?: Record<string, unknown>
}): Promise<void> {
  try {
    await db.insert(claimEvent).values({
      id: randomUUID(),
      claimId: input.claimId,
      partnerId: input.partnerId,
      type: input.type,
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      documentId: input.documentId ?? null,
      documentKind: input.documentKind ?? null,
      meta: JSON.stringify(input.meta ?? {}),
      createdAt: new Date(),
    })
  } catch (err) {
    console.error(
      "[claim-event] insert failed:",
      input.type,
      input.claimId,
      err instanceof Error ? err.message : String(err),
    )
  }
}
