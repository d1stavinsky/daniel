"use server"

import { revalidatePath } from "next/cache"
import { recordClaimEvent } from "@/lib/claim-events"
import { db } from "@/lib/db"
import { claim } from "@/lib/db/schema"
import {
  DEMAND_LETTER_KIND,
  generateDemandLetterDraftForClaim,
  getDemandLetterWorkflowState,
  type DemandLetterWorkflowState,
} from "@/lib/demand-letter"
import { requireStaff } from "@/lib/session"
import { eq } from "drizzle-orm"

export async function fetchDemandLetterWorkflowState(
  claimId: string,
): Promise<DemandLetterWorkflowState> {
  await requireStaff()
  if (!claimId) throw new Error("מזהה תיק חסר.")
  return getDemandLetterWorkflowState(claimId)
}

/** Generate demand-letter draft and move claim to pending-signature workflow. */
export async function generateDemandLetterDraft(claimId: string): Promise<DemandLetterWorkflowState> {
  const staff = await requireStaff()
  if (!claimId) throw new Error("מזהה תיק חסר.")

  const [row] = await db.select().from(claim).where(eq(claim.id, claimId)).limit(1)
  if (!row) throw new Error("התיק לא נמצא.")

  const { documentId, draftPathname, draftVersionHash } = await generateDemandLetterDraftForClaim(claimId)

  await recordClaimEvent({
    claimId,
    partnerId: row.partnerId,
    type: "demand_draft_generated",
    actorUserId: staff.id,
    actorRole: staff.role,
    documentId,
    documentKind: DEMAND_LETTER_KIND,
    meta: { draftPathname, draftVersionHash },
  })

  revalidatePath("/admin")
  revalidatePath("/dashboard")
  return getDemandLetterWorkflowState(claimId)
}
