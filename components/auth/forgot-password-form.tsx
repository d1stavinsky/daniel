"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import { Loader2, Mail, ArrowRight } from "lucide-react"
import { requestPasswordResetAction, type ForgotPasswordState } from "@/app/actions/forgot-password"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-ensura-teal text-base font-semibold text-white transition-colors hover:bg-ensura-teal/90 touch-manipulation disabled:pointer-events-none disabled:opacity-50 sm:text-sm"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "שולח..." : "שליחת קישור לאיפוס"}
    </button>
  )
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<ForgotPasswordState, FormData>(requestPasswordResetAction, {
    error: null,
  })

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-ensura-navy/10 bg-white p-5 shadow-[0_24px_80px_-36px_rgba(16,38,63,0.35)] sm:p-8 md:p-10">
        <div className="mb-6 text-center sm:mb-8">
          <h1 className="text-xl font-bold tracking-tight text-ensura-ink text-balance">שחזור סיסמה</h1>
          <p className="mt-2 text-sm font-normal text-ensura-navy/60 text-pretty">
            הזינו את כתובת הדוא&quot;ל של החשבון ונשלח קישור מאובטח לבחירת סיסמה חדשה
          </p>
        </div>

        {state.sent ? (
          <div className="flex flex-col gap-4 text-center">
            <p
              className="rounded-lg border border-ensura-teal/25 bg-ensura-teal/10 px-3 py-3 text-sm text-ensura-ink"
              role="status"
            >
              אם הכתובת רשומה במערכת, נשלח אליה קישור לאיפוס סיסמה. בדקו גם את תיקיית הספאם.
            </p>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center justify-center gap-2 text-sm font-medium text-ensura-teal underline-offset-4 hover:underline touch-manipulation"
            >
              חזרה להתחברות
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        ) : (
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
                  enterKeyHint="send"
                  placeholder="name@garage.co.il"
                  className="ensura-field pr-10 text-left"
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
              href="/login"
              className="mx-auto inline-flex min-h-11 items-center text-sm text-ensura-navy/55 underline-offset-4 transition-colors hover:text-ensura-teal hover:underline touch-manipulation"
            >
              חזרה להתחברות
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
