"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import { Loader2, Mail, ArrowRight } from "lucide-react"
import { requestPasswordResetAction, type ForgotPasswordState } from "@/app/actions/forgot-password"
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
      {pending ? "שולח..." : "שליחת קישור לאיפוס"}
    </button>
  )
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<ForgotPasswordState, FormData>(requestPasswordResetAction, {
    error: null,
  })

  return (
    <div className="w-full max-w-md">
      <div className="glass-strong rounded-2xl border border-border p-8 shadow-2xl sm:p-10">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <AxisLogo />
          <div>
            <h1 className="text-xl font-semibold text-foreground text-balance">שחזור סיסמה</h1>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              הזינו את כתובת הדוא&quot;ל של החשבון ונשלח קישור מאובטח לבחירת סיסמה חדשה
            </p>
          </div>
        </div>

        {state.sent ? (
          <div className="flex flex-col gap-4 text-center">
            <p
              className="rounded-lg border border-trust/30 bg-trust-muted px-3 py-3 text-sm text-foreground"
              role="status"
            >
              אם הכתובת רשומה במערכת, נשלח אליה קישור לאיפוס סיסמה. בדקו גם את תיקיית הספאם.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 text-sm font-medium text-gold underline-offset-4 hover:underline"
            >
              חזרה להתחברות
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        ) : (
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
              href="/login"
              className="mx-auto text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-gold hover:underline"
            >
              חזרה להתחברות
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
