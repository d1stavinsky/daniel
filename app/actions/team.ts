"use server"

import { randomBytes, randomUUID } from "crypto"
import { and, asc, eq, ne } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { account, user } from "@/lib/db/schema"
import { auth } from "@/lib/auth"
import { requireAdmin, requireUser } from "@/lib/session"
import { createTeamMemberSchema, zodErrorMessage } from "@/lib/schemas"

export type TeamMember = {
  id: string
  name: string
  email: string
  partnerRole: "owner" | "member"
  mustResetPassword: boolean
  createdAt: string
  isSelf: boolean
}

export type CreateMemberResult =
  | { ok: true; member: TeamMember; credentials: { username: string; password: string } }
  | { ok: false; error: string }

function generatePassword(): string {
  const core = randomBytes(6).toString("base64url").slice(0, 8)
  return `Ax-${core}${randomBytes(1).toString("hex")}`
}

/**
 * Resolve the partnerId a caller may administer team members for.
 * Team create/delete is admin-only — partners are read-only observers.
 */
async function resolveManagedPartnerId(explicitPartnerId?: string): Promise<string> {
  const u = await requireUser()
  if (u.role === "admin") {
    if (!explicitPartnerId) throw new Error("partnerId required")
    return explicitPartnerId
  }
  throw new Error("Forbidden")
}

/** List the garage team (all users sharing a partnerId). Admin-only. */
export async function listTeamMembers(explicitPartnerId?: string): Promise<TeamMember[]> {
  await requireAdmin()
  const me = await requireUser()
  const partnerId = await resolveManagedPartnerId(explicitPartnerId)
  const rows = await db
    .select()
    .from(user)
    .where(eq(user.partnerId, partnerId))
    .orderBy(asc(user.createdAt))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    partnerRole: r.partnerRole === "owner" ? "owner" : "member",
    mustResetPassword: r.mustResetPassword,
    createdAt: r.createdAt.toISOString(),
    isSelf: r.id === me.id,
  }))
}

/**
 * Provision a new garage sub-user (member) under a partner org.
 * Admin-only — partners cannot create users.
 */
export async function createTeamMember(formData: FormData): Promise<CreateMemberResult> {
  await requireAdmin()
  const explicitPartnerId = String(formData.get("partnerId") ?? "").trim() || undefined
  const partnerId = await resolveManagedPartnerId(explicitPartnerId)

  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const parsed = createTeamMemberSchema.safeParse({ name, email, partnerId: explicitPartnerId })
  if (!parsed.success) {
    return { ok: false, error: zodErrorMessage(parsed.error) }
  }

  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, parsed.data.email)).limit(1)
  if (existing.length > 0) {
    return { ok: false, error: 'כתובת הדוא"ל כבר רשומה במערכת.' }
  }

  const password = generatePassword()
  const ctx = await auth.$context
  const hashed = await ctx.password.hash(password)
  const userId = randomUUID()
  const now = new Date()

  try {
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name: parsed.data.name,
        email: parsed.data.email,
        emailVerified: true,
        role: "partner",
        partnerId,
        partnerRole: "member",
        mustResetPassword: true,
        createdAt: now,
        updatedAt: now,
      })

      await tx.insert(account).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hashed,
        createdAt: now,
        updatedAt: now,
      })
    })
  } catch (err) {
    console.error("[createTeamMember] failed:", err)
    return { ok: false, error: "יצירת המשתמש נכשלה. נסו שוב." }
  }

  revalidatePath("/dashboard")
  revalidatePath("/admin")

  return {
    ok: true,
    member: {
      id: userId,
      name: parsed.data.name,
      email: parsed.data.email,
      partnerRole: "member",
      mustResetPassword: true,
      createdAt: now.toISOString(),
      isSelf: false,
    },
    credentials: { username: parsed.data.email, password },
  }
}

/** Remove a garage sub-user (members only; never the owner or yourself). Admin-only. */
export async function removeTeamMember(memberId: string, explicitPartnerId?: string): Promise<void> {
  await requireAdmin()
  const me = await requireUser()
  const partnerId = await resolveManagedPartnerId(explicitPartnerId)
  if (memberId === me.id) throw new Error("Cannot remove yourself")

  const [target] = await db.select().from(user).where(eq(user.id, memberId)).limit(1)
  if (!target || target.partnerId !== partnerId) throw new Error("Not found")
  if (target.partnerRole === "owner") throw new Error("Cannot remove the owner")

  // Delete only members belonging to this tenant (defense in depth via ne owner).
  await db.delete(user).where(and(eq(user.id, memberId), eq(user.partnerId, partnerId), ne(user.partnerRole, "owner")))
  revalidatePath("/dashboard")
  revalidatePath("/admin")
}
