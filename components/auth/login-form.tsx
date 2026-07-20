"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Loader2, Lock, Mail } from "lucide-react"
import { loginAction, type LoginState } from "@/app/actions/login"
import { AxisLogo } from "@/components/brand/axis-logo"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "מתחבר..." : "כניסה"}
    </button>
  )
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, { error: null })
  const searchParams = useSearchParams()
  const resetSuccess = searchParams.get("reset") === "success"

  return (
    <div className="w-full max-w-md">
      <div className="glass-strong rounded-2xl border border-border p-8 shadow-2xl sm:p-10">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <AxisLogo />
          <div>
            <h1 className="text-xl font-semibold text-foreground text-balance">כניסה לפורטל השותפים</h1>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              הזינו את פרטי ההתחברות שקיבלתם מ־AXIS
            </p>
          </div>
        </div>

        {resetSuccess && (
          <p
            className="mb-5 rounded-lg border border-trust/30 bg-trust-muted px-3 py-2 text-sm text-foreground"
            role="status"
          >
            הסיסמה עודכנה בהצלחה. ניתן להתחבר עם הסיסמה החדשה.
          </p>
        )}

        <form action={formAction} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              דוא&quot;ל
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                dir="ltr"
                placeholder="name@garage.co.il"
                className="h-11 w-full rounded-lg border border-input bg-background/60 pr-10 pl-3 text-left text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              סיסמה
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                dir="ltr"
                placeholder="••••••••"
                className="h-11 w-full rounded-lg border border-input bg-background/60 pr-10 pl-3 text-left text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>
          </div>

          {state.error && (
            <p
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {state.error}
            </p>
          )}

          <SubmitButton />

          <Link
            href="/forgot-password"
            className="mx-auto text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-gold hover:underline"
          >
            שכחתם סיסמה?
          </Link>
        </form>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        גישה מאובטחת · AXIS ניהול תביעות · לשימוש שותפים מורשים בלבד
      </p>
    </div>
  )
}
