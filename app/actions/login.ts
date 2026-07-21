"use server"

import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { APIError } from "better-auth/api"
import { db } from "@/lib/db"
import { partner, user } from "@/lib/db/schema"
import { auth } from "@/lib/auth"

export type LoginState = { error: string | null }

/**
 * Signs a user in server-side (progressive enhancement) and routes them to the
 * correct surface based on their role: admins to /admin, partners to /dashboard.
 * The nextCookies() plugin on the auth server writes the session cookie.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { error: 'יש להזין דוא"ל וסיסמה.' }
  }

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    })
  } catch (err) {
    if (err instanceof APIError) {
      return { error: "פרטי ההתחברות שגויים. נסו שוב." }
    }

    const message = err instanceof Error ? err.message : String(err)
    console.error("[loginAction] sign-in failed:", message)

    // Better Auth sometimes throws plain Errors for CSRF / origin / config issues.
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
      return { error: "פרטי ההתחברות שגויים. נסו שוב." }
    }

    return { error: "אירעה שגיאה בעת ההתחברות. נסו שוב מאוחר יותר." }
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
