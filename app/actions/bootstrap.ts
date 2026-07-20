"use server"

import { randomUUID } from "crypto"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { account, user } from "@/lib/db/schema"
import { auth } from "@/lib/auth"
import { emailSchema, personNameSchema, zodErrorMessage } from "@/lib/schemas"
import { z } from "zod"

export type BootstrapState = { error: string | null }

const bootstrapSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: z.string().min(8, { message: "הסיסמה חייבת להכיל לפחות 8 תווים." }),
})

/**
 * Creates the very first AXIS admin account and signs them in.
 * Uses direct credential provisioning (public sign-up is disabled).
 * Only works while no admin exists.
 */
export async function bootstrapAdmin(_prev: BootstrapState, formData: FormData): Promise<BootstrapState> {
  const parsed = bootstrapSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { error: zodErrorMessage(parsed.error) }
  }
  const { name, email, password } = parsed.data

  // Atomic-ish gate: re-check admin count inside a transaction before insert.
  try {
    await db.transaction(async (tx) => {
      const existingAdmin = await tx.select({ id: user.id }).from(user).where(eq(user.role, "admin")).limit(1)
      if (existingAdmin.length > 0) {
        throw new Error("ADMIN_EXISTS")
      }

      const existingEmail = await tx.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
      if (existingEmail.length > 0) {
        throw new Error("EMAIL_EXISTS")
      }

      const ctx = await auth.$context
      const hashed = await ctx.password.hash(password)
      const userId = randomUUID()
      const now = new Date()

      await tx.insert(user).values({
        id: userId,
        name,
        email,
        emailVerified: true,
        role: "admin",
        partnerId: null,
        partnerRole: null,
        mustResetPassword: false,
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
    if (err instanceof Error && err.message === "ADMIN_EXISTS") {
      return { error: "כבר קיים חשבון מנהל במערכת." }
    }
    if (err instanceof Error && err.message === "EMAIL_EXISTS") {
      return { error: 'כתובת הדוא"ל כבר רשומה במערכת.' }
    }
    console.error("[bootstrapAdmin] failed:", err)
    return { error: "יצירת החשבון נכשלה. נסו שוב." }
  }

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    })
  } catch {
    return { error: "החשבון נוצר אך ההתחברות נכשלה. התחברו ידנית." }
  }

  redirect("/admin")
}
