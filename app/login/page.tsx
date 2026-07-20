import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/session"
import { LoginForm } from "@/components/auth/login-form"

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
        <Suspense fallback={<div className="h-96 w-full max-w-md animate-pulse rounded-2xl bg-muted/40" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
