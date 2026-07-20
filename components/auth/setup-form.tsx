"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Loader2, ShieldCheck } from "lucide-react"
import { bootstrapAdmin, type BootstrapState } from "@/app/actions/bootstrap"
import { AxisLogo } from "@/components/brand/axis-logo"

const field =
  "h-11 w-full rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "יוצר חשבון..." : "יצירת חשבון מנהל"}
    </button>
  )
}

export function SetupForm() {
  const [state, formAction] = useActionState<BootstrapState, FormData>(bootstrapAdmin, { error: null })

  return (
    <div className="w-full max-w-md">
      <div className="glass-strong rounded-2xl border border-border p-8 shadow-2xl sm:p-10">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <AxisLogo />
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              הגדרה ראשונית
            </div>
            <h1 className="text-xl font-semibold text-foreground text-balance">יצירת חשבון מנהל AXIS</h1>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              חשבון זה ינהל את השותפים והתביעות. ניתן ליצור פעם אחת בלבד.
            </p>
          </div>
        </div>

        <form action={formAction} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-sm font-medium text-foreground">שם מלא</label>
            <input id="name" name="name" required placeholder="ישראל ישראלי" className={field} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground">דוא&quot;ל</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              dir="ltr"
              placeholder="admin@axis.co.il"
              className={`${field} text-left`}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium text-foreground">סיסמה</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              dir="ltr"
              placeholder="לפחות 8 תווים"
              className={`${field} text-left`}
            />
          </div>

          {state.error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}

          <SubmitButton />
        </form>
      </div>
    </div>
  )
}
