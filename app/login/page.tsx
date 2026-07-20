import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/session"
import { LoginForm } from "@/components/auth/login-form"
import { EnsuraAuthShell } from "@/components/auth/ensura-auth-shell"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "כניסה · אינשורה | ENSURA",
}

export default async function LoginPage() {
  try {
    const user = await getSessionUser()
    if (user) redirect("/portal")
  } catch (error) {
    console.error(
      "[login] session check failed:",
      error instanceof Error ? error.message : String(error),
    )
  }

  return (
    <EnsuraAuthShell>
      <Suspense
        fallback={
          <div className="h-96 w-full animate-pulse rounded-2xl border border-ensura-navy/8 bg-white/70" />
        }
      >
        <LoginForm />
      </Suspense>
    </EnsuraAuthShell>
  )
}
