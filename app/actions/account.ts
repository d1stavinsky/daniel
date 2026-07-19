"use server"

import { and, eq } from "drizzle-orm"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { account, user } from "@/lib/db/schema"
import { auth } from "@/lib/auth"
import { requireUser } from "@/lib/session"

export type ResetState = { error?: string }

/**
 * Force-password-reset: verifies the current (temporary) password, sets a new
 * one via Better Auth's hasher, and clears the mustResetPassword flag.
 * Used by new partners/sub-users on first login.
 */
export async function completePasswordReset(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const sessionUser = await requireUser()
  const currentPassword = String(formData.get("currentPassword") ?? "")
  const newPassword = String(formData.get("newPassword") ?? "")
  const confirm = String(formData.get("confirm") ?? "")

  if (newPassword.length < 8) {
    return { error: "הסיסמה החדשה חייבת להכיל לפחות 8 תווים." }
  }
  if (newPassword !== confirm) {
    return { error: "הסיסמאות אינן תואמות." }
  }
  if (newPassword === currentPassword) {
    return { error: "יש לבחור סיסמה שונה מהסיסמה הזמנית." }
  }

  const ctx = await auth.$context

  // Verify the current password against the stored credential hash.
  const [cred] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, sessionUser.id), eq(account.providerId, "credential")))
    .limit(1)
  if (!cred?.password) {
    return { error: "לא נמצאה סיסמה קיימת לחשבון." }
  }
  const valid = await ctx.password.verify({ hash: cred.password, password: currentPassword })
  if (!valid) {
    return { error: "הסיסמה הנוכחית שגויה." }
  }

  // Store the new hash and clear the reset flag atomically.
  const hashed = await ctx.password.hash(newPassword)
  const now = new Date()
  try {
    await db.transaction(async (tx) => {
      await tx.update(account).set({ password: hashed, updatedAt: now }).where(eq(account.id, cred.id))
      await tx.update(user).set({ mustResetPassword: false, updatedAt: now }).where(eq(user.id, sessionUser.id))
    })
  } catch (err) {
    console.error("[completePasswordReset] failed:", err)
    return { error: "עדכון הסיסמה נכשל. נסו שוב." }
  }

  // Send them to their role-appropriate home.
  redirect(sessionUser.role === "admin" ? "/admin" : "/dashboard")
}
