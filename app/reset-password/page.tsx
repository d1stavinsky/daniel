import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/session"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import { TokenResetPasswordForm } from "@/components/auth/token-reset-password-form"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "בחירת סיסמה · AXIS",
}

type SearchParams = Promise<{ token?: string; error?: string }>

/**
 * Dual-purpose reset page:
 * 1) Email token flow (unauthenticated): /reset-password?token=...
 * 2) Forced first-login change (authenticated + mustResetPassword)
 */
export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const token = typeof params.token === "string" ? params.token : null
  const error = typeof params.error === "string" ? params.error : null

  // Forgot-password email link (token present, or invalid-token redirect).
  if (token || error) {
    return (
      <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-4 py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, var(--gold) 10%, transparent), transparent 70%)",
          }}
        />
        <div className="relative z-10 flex justify-center">
          <TokenResetPasswordForm token={token} invalidReason={error} />
        </div>
      </main>
    )
  }

  const user = await getSessionUser()
  if (!user) redirect("/forgot-password")
  // If no reset is pending, don't linger here.
  if (!user.mustResetPassword) redirect("/portal")

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, var(--gold) 10%, transparent), transparent 70%)",
        }}
      />
      <div className="relative z-10 flex justify-center">
        <ResetPasswordForm />
      </div>
    </main>
  )
}
