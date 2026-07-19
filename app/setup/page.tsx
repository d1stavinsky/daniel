import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { SetupForm } from "@/components/auth/setup-form"

/** Never prerender — this page queries Neon for an existing admin. */
export const dynamic = "force-dynamic"

export const metadata = {
  title: "הגדרת מנהל · AXIS",
}

export default async function SetupPage() {
  // If an admin already exists, this page is closed forever.
  // When the DB is unreachable (offline build / DNS), fall through to the form
  // so static generation never hard-fails; runtime will re-check.
  try {
    const existingAdmin = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.role, "admin"))
      .limit(1)
    if (existingAdmin.length > 0) redirect("/login")
  } catch (err) {
    console.warn(
      "[setup] database unreachable; rendering setup form anyway:",
      err instanceof Error ? err.message : String(err),
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
        <SetupForm />
      </div>
    </main>
  )
}
