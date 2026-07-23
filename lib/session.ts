import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { partner, user } from "@/lib/db/schema"
import { normalizeRole, type AppRole } from "@/lib/rbac"
import { isAccountLocked } from "@/lib/auth/lockout"

export type SessionUser = {
  id: string
  name: string
  email: string
  role: AppRole
  partnerId: string | null
  partnerRole: "owner" | "member" | null
  mustResetPassword: boolean
}

/** Returns the current session user (with role + partnerId), or null.
 * Suspended partner orgs are treated as logged out so requireUser paths stay locked.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return null
    const u = session.user as typeof session.user & {
      role?: string
      partnerId?: string | null
      partnerRole?: string | null
      mustResetPassword?: boolean
    }
    const role = normalizeRole(u.role)
    const partnerId = u.partnerId ?? null

    // Locked accounts must not keep using an existing session cookie.
    const [lockRow] = await db
      .select({ lockedAt: user.lockedAt })
      .from(user)
      .where(eq(user.id, u.id))
      .limit(1)
    if (isAccountLocked(lockRow)) {
      try {
        await auth.api.signOut({ headers: await headers() })
      } catch {
        // Best-effort.
      }
      return null
    }

    if (role === "partner") {
      if (!partnerId) return null
      const active = await isPartnerOrgActive(partnerId)
      if (!active) return null
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role,
      partnerId,
      partnerRole: u.partnerRole === "owner" ? "owner" : u.partnerRole === "member" ? "member" : null,
      mustResetPassword: Boolean(u.mustResetPassword),
    }
  } catch (error) {
    console.error(
      "[session] getSessionUser failed:",
      error instanceof Error ? error.message : String(error),
    )
    return null
  }
}

/** Throws unless a session exists. Returns the session user. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new Error("Unauthorized")
  return user
}

/** Throws unless the session user is a full admin. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== "admin") throw new Error("Forbidden")
  return user
}

/** Throws unless admin or support agent. */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== "admin" && user.role !== "support") throw new Error("Forbidden")
  return user
}

/**
 * Throws unless the session user is a partner bound to a partnerId.
 * Returns the user with a guaranteed non-null partnerId — the tenant key.
 */
export async function requirePartner(): Promise<SessionUser & { partnerId: string }> {
  const user = await requireUser()
  if (user.role !== "partner" || !user.partnerId) throw new Error("Forbidden")

  const active = await isPartnerOrgActive(user.partnerId)
  if (!active) throw new Error("Forbidden")

  return { ...user, partnerId: user.partnerId }
}

/** Returns false when the partner org is missing or suspended. */
export async function isPartnerOrgActive(partnerId: string): Promise<boolean> {
  const [org] = await db
    .select({ status: partner.status })
    .from(partner)
    .where(eq(partner.id, partnerId))
    .limit(1)
  return Boolean(org && org.status === "active")
}
