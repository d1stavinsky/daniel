"use server"

import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { APIError } from "better-auth/api"
import { db } from "@/lib/db"
import { partner, user } from "@/lib/db/schema"
import { auth } from "@/lib/auth"
import {
  clearFailedLoginAttempts,
  GENERIC_CREDENTIALS_MESSAGE,
  getLockoutByEmail,
  isAccountLocked,
  LOCKOUT_USER_MESSAGE,
  recordFailedLoginAttempt,
} from "@/lib/auth/lockout"

export type LoginState = { error: string | null }

function isLockoutError(err: unknown): boolean {
  if (err instanceof APIError) {
    const code = (err.body as { code?: string } | undefined)?.code
    if (code === "ACCOUNT_LOCKED") return true
    if (err.message?.includes("נחסם")) return true
  }
  if (err instanceof Error && err.message.includes("ACCOUNT_LOCKED")) return true
  return false
}

/**
 * Signs a user in server-side (progressive enhancement) and routes them to the
 * correct surface based on their role: admins to /admin, partners to /dashboard.
 * Tracks failed attempts and enforces account lockout after the threshold.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { error: 'יש להזין דוא"ל וסיסמה.' }
  }

  const lockout = await getLockoutByEmail(email)
  if (isAccountLocked(lockout)) {
    return { error: LOCKOUT_USER_MESSAGE }
  }

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    })
  } catch (err) {
    if (isLockoutError(err)) {
      return { error: LOCKOUT_USER_MESSAGE }
    }

    if (err instanceof APIError) {
      const result = await recordFailedLoginAttempt(email)
      if (result.locked) {
        return { error: LOCKOUT_USER_MESSAGE }
      }
      return { error: GENERIC_CREDENTIALS_MESSAGE }
    }

    const message = err instanceof Error ? err.message : String(err)
    console.error("[loginAction] sign-in failed:", message)

    const lower = message.toLowerCase()
    if (
      lower.includes("invalid origin") ||
      lower.includes("trusted") ||
      lower.includes("csrf") ||
      lower.includes("origin")
    ) {
      return {
        error: "ההתחברות נחסמה עקב הגדרת דומיין. פנו למנהל המערכת.",
      }
    }
    if (lower.includes("password") || lower.includes("credential") || lower.includes("user not found")) {
      const result = await recordFailedLoginAttempt(email)
      if (result.locked) {
        return { error: LOCKOUT_USER_MESSAGE }
      }
      return { error: GENERIC_CREDENTIALS_MESSAGE }
    }

    return { error: "אירעה שגיאה בעת ההתחברות. נסו שוב מאוחר יותר." }
  }

  // Successful auth — reset brute-force counters.
  if (lockout?.id) {
    await clearFailedLoginAttempts(lockout.id)
  } else {
    const [row] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1)
    if (row) await clearFailedLoginAttempts(row.id)
  }

  // Route by role (redirect throws, so it must be outside the try/catch).
  const [row] = await db
    .select({ role: user.role, partnerId: user.partnerId })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  // Suspended partner orgs must not retain an active session.
  if (row?.role !== "admin" && row?.role !== "support" && row?.partnerId) {
    const [org] = await db
      .select({ status: partner.status })
      .from(partner)
      .where(eq(partner.id, row.partnerId))
      .limit(1)
    if (org?.status === "suspended") {
      try {
        await auth.api.signOut({ headers: await headers() })
      } catch {
        // Best-effort sign-out; still block access below.
      }
      return { error: "החשבון מושבת. פנו למנהל המערכת." }
    }
  }

  redirect(row?.role === "admin" || row?.role === "support" ? "/admin" : "/dashboard")
}
