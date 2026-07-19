import { and, eq, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { claim, claimDocument } from "@/lib/db/schema"
import { isStaff } from "@/lib/rbac"
import { requireUser, type SessionUser } from "@/lib/session"

export type ClaimAccess = {
  user: SessionUser
  claimId: string
  partnerId: string
}

/**
 * Load a claim with mandatory tenant isolation in the SQL WHERE clause.
 * - Admins + support: filter by claim id only
 * - Partners: filter by claim id AND partnerId === session org
 */
export async function requireClaimAccess(claimId: string): Promise<ClaimAccess> {
  const user = await requireUser()
  if (!claimId) throw new Error("Claim not found")

  const filters: SQL[] = [eq(claim.id, claimId)]
  if (!isStaff(user)) {
    if (!user.partnerId) throw new Error("Forbidden")
    filters.push(eq(claim.partnerId, user.partnerId))
  }

  const [row] = await db
    .select({ id: claim.id, partnerId: claim.partnerId })
    .from(claim)
    .where(and(...filters))
    .limit(1)

  if (!row) {
    if (!isStaff(user)) throw new Error("Forbidden")
    throw new Error("Claim not found")
  }

  return { user, claimId: row.id, partnerId: row.partnerId }
}

/** Same isolation for claim lookups that may return null (read APIs). */
export async function findClaimAccess(claimId: string): Promise<ClaimAccess | null> {
  const user = await requireUser()
  if (!claimId) return null

  const filters: SQL[] = [eq(claim.id, claimId)]
  if (!isStaff(user)) {
    if (!user.partnerId) return null
    filters.push(eq(claim.partnerId, user.partnerId))
  }

  const [row] = await db
    .select({ id: claim.id, partnerId: claim.partnerId })
    .from(claim)
    .where(and(...filters))
    .limit(1)

  if (!row) return null
  return { user, claimId: row.id, partnerId: row.partnerId }
}

/** Load a document row with partnerId enforced in SQL for partner sessions. */
export async function requireDocumentAccess(docId: string): Promise<{
  user: SessionUser
  doc: typeof claimDocument.$inferSelect
}> {
  const user = await requireUser()
  if (!docId) throw new Error("Document not available")

  const filters: SQL[] = [eq(claimDocument.id, docId)]
  if (!isStaff(user)) {
    if (!user.partnerId) throw new Error("Forbidden")
    filters.push(eq(claimDocument.partnerId, user.partnerId))
  }

  const [row] = await db
    .select()
    .from(claimDocument)
    .where(and(...filters))
    .limit(1)

  if (!row) {
    if (!isStaff(user)) throw new Error("Forbidden")
    throw new Error("Document not available")
  }

  return { user, doc: row }
}
