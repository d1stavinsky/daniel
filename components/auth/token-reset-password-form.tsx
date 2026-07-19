"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import { Loader2, Lock, ShieldCheck } from "lucide-react"
import { completeTokenPasswordReset, type TokenResetState } from "@/app/actions/forgot-password"
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
      {pending ? "מעדכן..." : "שמירת סיסמה חדשה"}
    </button>
  )
}

function PasswordField({
  id,
  name,
  label,
  autoComplete,
}: {
  id: string
  name: string
  label: string
  autoComplete: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <Lock
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id={id}
          name={name}
          type="password"
          autoComplete={autoComplete}
          required
          minLength={8}
          dir="ltr"
          placeholder="••••••••"
          className="h-11 w-full rounded-lg border border-input bg-background/60 pr-10 pl-3 text-left text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
      </div>
    </div>
  )
}

export function TokenResetPasswordForm({
  token,
  invalidReason,
}: {
  token: string | null
  invalidReason?: string | null
}) {
  const [state, formAction] = useActionState<TokenResetState, FormData>(completeTokenPasswordReset, {})

  if (!token || invalidReason) {
    return (
      <div className="w-full max-w-md">
        <div className="glass-strong rounded-2xl border border-border p-8 shadow-2xl sm:p-10">
          <div className="mb-6 flex flex-col items-center gap-4 text-center">
            <AxisLogo />
            <h1 className="text-xl font-semibold text-foreground">קישור אינו תקין</h1>
            <p className="text-sm text-muted-foreground text-pretty">
              {invalidReason === "INVALID_TOKEN"
                ? "קישור האיפוס אינו תקין או שפג תוקפו."
                : "לא נמצא אסימון איפוס בכתובת. בקשו קישור חדש."}
            </p>
          </div>
          <Link
            href="/forgot-password"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            בקשת קישור חדש
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md">
      <div className="glass-strong rounded-2xl border border-border p-8 shadow-2xl sm:p-10">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <AxisLogo />
          <div>
            <h1 className="flex items-center justify-center gap-2 text-xl font-semibold text-foreground text-balance">
              <ShieldCheck className="size-5 text-gold" aria-hidden="true" />
              סיסמה חדשה
            </h1>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              בחרו סיסמה חזקה (לפחות 8 תווים) לחשבון השותפים שלכם
            </p>
          </div>
        </div>

        <form action={formAction} className="flex flex-col gap-5">
          <input type="hidden" name="token" value={token} />
          <PasswordField
            id="newPassword"
            name="newPassword"
            label="סיסמה חדשה"
            autoComplete="new-password"
          />
          <PasswordField id="confirm" name="confirm" label="אימות סיסמה חדשה" autoComplete="new-password" />

          {state.error && (
            <p
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {state.error}
            </p>
          )}

          <SubmitButton />
        </form>
      </div>
    </div>
  )
}
