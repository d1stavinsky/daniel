"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Loader2, Lock, ShieldCheck } from "lucide-react"
import { completePasswordReset, type ResetState } from "@/app/actions/account"
import { EnsuraLogo } from "@/components/brand/ensura-logo"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "מעדכן..." : "עדכון סיסמה והמשך"}
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
          dir="ltr"
          placeholder="••••••••"
          className="h-11 w-full rounded-lg border border-input bg-background/60 pr-10 pl-3 text-left text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
      </div>
    </div>
  )
}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState<ResetState, FormData>(completePasswordReset, {})

  return (
    <div className="w-full max-w-md">
      <div className="glass-strong rounded-2xl border border-border p-8 shadow-2xl sm:p-10">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <EnsuraLogo tone="dark" />
          <div>
            <h1 className="flex items-center justify-center gap-2 text-xl font-semibold text-foreground text-balance">
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
              בחירת סיסמה חדשה
            </h1>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              מטעמי אבטחה, יש להחליף את הסיסמה הזמנית לפני הכניסה הראשונה
            </p>
          </div>
        </div>

        <form action={formAction} className="flex flex-col gap-5">
          <PasswordField
            id="currentPassword"
            name="currentPassword"
            label="סיסמה זמנית נוכחית"
            autoComplete="current-password"
          />
          <PasswordField
            id="newPassword"
            name="newPassword"
            label="סיסמה חדשה (לפחות 8 תווים)"
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

      <p className="mt-6 text-center text-xs text-muted-foreground">
        גישה מאובטחת · אינשורה | ENSURA
      </p>
    </div>
  )
}
