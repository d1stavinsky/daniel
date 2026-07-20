"use server"

import { randomBytes, randomUUID } from "crypto"
import { desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { account, partner, user } from "@/lib/db/schema"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/session"
import { createPartnerSchema, zodErrorMessage } from "@/lib/schemas"

export type PartnerRow = {
  id: string
  businessName: string
  contactEmail: string
  loginUsername: string
  status: string
  createdAt: string
}

export type CreatePartnerResult =
  | { ok: true; partner: PartnerRow; credentials: { username: string; password: string } }
  | { ok: false; error: string }

export type TogglePartnerResult =
  | { ok: true; status: "active" | "suspended" }
  | { ok: false; error: string }

/** List all partner accounts (admin only). */
export async function listPartners(): Promise<PartnerRow[]> {
  await requireAdmin()
  const rows = await db.select().from(partner).orderBy(desc(partner.createdAt))
  return rows.map((p) => ({
    id: p.id,
    businessName: p.businessName,
    contactEmail: p.contactEmail,
    loginUsername: p.loginUsername,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  }))
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/gi, "")
    .slice(0, 10)
  return base || "partner"
}

/** Generate a readable but strong password. */
function generatePassword(): string {
  // 9 url-safe chars + a fixed strong suffix guarantees length & complexity.
  const core = randomBytes(6).toString("base64url").slice(0, 8)
  return `Ax-${core}${randomBytes(1).toString("hex")}`
}

/**
 * Create a new garage/agency partner + its login credential (admin only).
 * The generated password is returned ONCE so the admin can hand it over.
 */
export async function createPartner(formData: FormData): Promise<CreatePartnerResult> {
  let admin
  try {
    admin = await requireAdmin()
  } catch {
    return { ok: false, error: "אין הרשאה לבצע פעולה זו." }
  }

  const parsed = createPartnerSchema.safeParse({
    businessName: formData.get("businessName"),
    contactEmail: formData.get("contactEmail"),
  })
  if (!parsed.success) {
    return { ok: false, error: zodErrorMessage(parsed.error) }
  }
  const { businessName, contactEmail } = parsed.data

  // Ensure the login email isn't already registered.
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, contactEmail)).limit(1)
  if (existing.length > 0) {
    return { ok: false, error: 'כתובת הדוא"ל כבר רשומה במערכת.' }
  }

  const partnerId = randomUUID()
  const loginUsername = `${slugify(businessName)}-${randomBytes(2).toString("hex")}`
  const password = generatePassword()

  // Hash the password with Better Auth's configured hasher so sign-in works.
  const ctx = await auth.$context
  const hashed = await ctx.password.hash(password)

  const userId = randomUUID()
  const now = new Date()

  try {
    await db.transaction(async (tx) => {
      await tx.insert(partner).values({
        id: partnerId,
        businessName,
        contactEmail,
        loginUsername,
        status: "active",
        createdBy: admin.id,
        createdAt: now,
      })

      await tx.insert(user).values({
        id: userId,
        name: businessName,
        email: contactEmail,
        emailVerified: true,
        role: "partner",
        partnerId,
        partnerRole: "owner",
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
    console.error("[createPartner] transaction failed:", err)
    return { ok: false, error: "יצירת השותף נכשלה. נסו שוב." }
  }

  revalidatePath("/admin")
  revalidatePath("/dashboard")

  return {
    ok: true,
    partner: {
      id: partnerId,
      businessName,
      contactEmail,
      loginUsername,
      status: "active",
      createdAt: now.toISOString(),
    },
    credentials: { username: contactEmail, password },
  }
}

/** Toggle a partner between active and suspended (admin only). */
export async function togglePartnerStatus(partnerId: string): Promise<TogglePartnerResult> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, error: "אין הרשאה לבצע פעולה זו." }
  }

  if (!partnerId) {
    return { ok: false, error: "מזהה שותף חסר." }
  }

  const [row] = await db.select().from(partner).where(eq(partner.id, partnerId)).limit(1)
  if (!row) {
    return { ok: false, error: "השותף לא נמצא." }
  }

  const next = row.status === "active" ? "suspended" : "active"
  try {
    await db.update(partner).set({ status: next }).where(eq(partner.id, partnerId))
  } catch (err) {
    console.error("[togglePartnerStatus] update failed:", err)
    return { ok: false, error: "עדכון הסטטוס נכשל. נסו שוב." }
  }

  revalidatePath("/admin")
  revalidatePath("/dashboard")

  return { ok: true, status: next }
}
