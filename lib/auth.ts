import { eq } from "drizzle-orm"
import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { pool } from "@/lib/db"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { sendAlertEmail } from "@/lib/email"

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    process.env.V0_RUNTIME_URL ||
    "http://localhost:3000"
  )
}

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    // Public self-signup is disabled — admins provision partners; bootstrap creates the first admin.
    disableSignUp: true,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user: resetUser, token }) => {
      const resetUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`
      await sendAlertEmail({
        to: resetUser.email,
        subject: "איפוס סיסמה · AXIS",
        heading: "בקשת איפוס סיסמה",
        lines: [
          "קיבלנו בקשה לאיפוס הסיסמה לחשבון השותפים שלכם ב־AXIS.",
          "לחצו על הכפתור למטה כדי לבחור סיסמה חדשה. הקישור תקף לשעה אחת.",
          "אם לא ביקשתם איפוס סיסמה, ניתן להתעלם מהודעה זו.",
        ],
        cta: { label: "בחירת סיסמה חדשה", url: resetUrl },
      })
    },
    onPasswordReset: async ({ user: resetUser }) => {
      // Clear forced first-login flag if it was still set.
      await db
        .update(user)
        .set({ mustResetPassword: false, updatedAt: new Date() })
        .where(eq(user.id, resetUser.id))
    },
  },
  user: {
    additionalFields: {
      // RBAC role: "admin" | "support" | "partner"
      role: {
        type: "string",
        required: false,
        defaultValue: "partner",
        input: false, // never settable from the public sign-up endpoint
      },
      // The partner account a partner user belongs to (null for admins)
      partnerId: {
        type: "string",
        required: false,
        input: false,
      },
      // Forces a password change on next login.
      mustResetPassword: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      // Sub-user role within a partner org ("owner" | "member").
      partnerRole: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  trustedOrigins: [
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
    ...(process.env.NEXT_PUBLIC_APP_URL ? [process.env.NEXT_PUBLIC_APP_URL] : []),
    ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000"] : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  // nextCookies() MUST be last: it relays any cookies Better Auth sets during
  // a server action into Next's cookie store automatically.
  plugins: [nextCookies()],
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          // In dev (v0 preview iframe), force cross-site cookies so the
          // session cookie is stored by the browser.
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
})
