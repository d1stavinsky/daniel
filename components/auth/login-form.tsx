"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Loader2, Lock, Mail } from "lucide-react"
import { loginAction, type LoginState } from "@/app/actions/login"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-ensura-teal text-base font-semibold text-white transition-colors hover:bg-ensura-teal/90 touch-manipulation disabled:pointer-events-none disabled:opacity-50 sm:text-sm"
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
    <div className="w-full">
      <div className="rounded-2xl border border-ensura-navy/10 bg-white p-5 shadow-[0_24px_80px_-36px_rgba(16,38,63,0.35)] sm:p-8 md:p-10">
        <div className="mb-6 text-center sm:mb-8">
          <h1 className="text-xl font-bold tracking-tight text-ensura-ink text-balance">
            כניסה לפורטל השותפים
          </h1>
          <p className="mt-2 text-sm font-normal text-ensura-navy/60 text-pretty">
            הזינו את פרטי ההתחברות שקיבלתם מאינשורה
          </p>
        </div>

        {resetSuccess && (
          <p
            className="mb-5 rounded-lg border border-ensura-teal/25 bg-ensura-teal/10 px-3 py-2.5 text-sm text-ensura-ink"
            role="status"
          >
            הסיסמה עודכנה בהצלחה. ניתן להתחבר עם הסיסמה החדשה.
          </p>
        )}

        <form action={formAction} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-ensura-ink">
              דוא&quot;ל
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ensura-navy/40"
                aria-hidden="true"
              />
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                dir="ltr"
                enterKeyHint="next"
                placeholder="name@garage.co.il"
                className="ensura-field-icon text-left"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium text-ensura-ink">
              סיסמה
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ensura-navy/40"
                aria-hidden="true"
              />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                dir="ltr"
                enterKeyHint="go"
                placeholder="••••••••"
                className="ensura-field-icon text-left"
              />
            </div>
          </div>

          {state.error && (
            <p
              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-700"
              role="alert"
            >
              {state.error}
            </p>
          )}

          <SubmitButton />

          <Link
            href="/forgot-password"
            className="mx-auto inline-flex min-h-11 items-center text-sm text-ensura-navy/55 underline-offset-4 transition-colors hover:text-ensura-teal hover:underline touch-manipulation"
          >
            שכחתם סיסמה?
          </Link>
        </form>
      </div>

      <p className="mt-6 px-2 text-center text-xs leading-relaxed text-ensura-navy/45">
        גישה מאובטחת · אינשורה | ENSURA · לשימוש שותפים מורשים בלבד
      </p>
    </div>
  )
}
