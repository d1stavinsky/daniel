"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import {
  Building2,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  User,
  Users,
} from "lucide-react"
import { submitJoinLeadAction, type JoinLeadState } from "@/app/actions/join-lead"
import { cn } from "@/lib/utils"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-ensura-teal text-base font-semibold text-white transition-colors hover:bg-ensura-teal/90 touch-manipulation disabled:pointer-events-none disabled:opacity-50 sm:text-sm"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "שולח..." : "שליחת פרטים"}
    </button>
  )
}

const fieldWithIconClass = "ensura-field pr-10"

export function JoinLeadForm({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  const [state, formAction] = useActionState<JoinLeadState, FormData>(submitJoinLeadAction, {
    error: null,
    success: false,
  })

  if (state.success) {
    return (
      <div
        className={cn(
          "w-full rounded-2xl border border-ensura-navy/10 bg-white p-6 text-center shadow-[0_24px_80px_-36px_rgba(16,38,63,0.35)] sm:p-8 md:p-10",
          className,
        )}
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-ensura-teal/10 text-ensura-teal">
          <CheckCircle2 className="size-6" strokeWidth={1.75} />
        </div>
        <h3 className="mt-5 text-xl font-bold tracking-tight text-ensura-ink">הפרטים התקבלו</h3>
        <p className="mt-2 text-sm leading-relaxed text-ensura-navy/65 text-pretty">
          תודה על הפנייה. צוות אינשורה יחזור אליכם בהקדם עם המשך התהליך.
        </p>
        {!compact && (
          <Link
            href="/"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-lg bg-ensura-navy px-5 text-base font-medium text-white transition-colors hover:bg-ensura-navy/90 touch-manipulation sm:text-sm"
          >
            חזרה לדף הבית
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="rounded-2xl border border-ensura-navy/10 bg-white p-5 shadow-[0_24px_80px_-36px_rgba(16,38,63,0.35)] sm:p-8 md:p-10">
        {!compact && (
          <div className="mb-6 text-center sm:mb-8">
            <h1 className="text-xl font-bold tracking-tight text-ensura-ink text-balance">
              הצטרפות לאינשורה
            </h1>
            <p className="mt-2 text-sm font-normal text-ensura-navy/60 text-pretty">
              השאירו פרטים ונחזור אליכם לתיאום הצטרפות מסודרת
            </p>
          </div>
        )}

        <form action={formAction} className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="fullName" className="text-sm font-medium text-ensura-ink">
              שם מלא
            </label>
            <div className="relative">
              <User
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ensura-navy/40"
                aria-hidden="true"
              />
              <input
                id="fullName"
                name="fullName"
                required
                maxLength={100}
                autoComplete="name"
                enterKeyHint="next"
                className={fieldWithIconClass}
                placeholder="ישראל ישראלי"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="businessName" className="text-sm font-medium text-ensura-ink">
              שם העסק
            </label>
            <div className="relative">
              <Building2
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ensura-navy/40"
                aria-hidden="true"
              />
              <input
                id="businessName"
                name="businessName"
                required
                maxLength={120}
                autoComplete="organization"
                enterKeyHint="next"
                className={fieldWithIconClass}
                placeholder="מוסך / סוכנות"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="phone" className="text-sm font-medium text-ensura-ink">
              טלפון
            </label>
            <div className="relative">
              <Phone
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ensura-navy/40"
                aria-hidden="true"
              />
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                required
                dir="ltr"
                autoComplete="tel"
                enterKeyHint="next"
                className={`${fieldWithIconClass} text-left`}
                placeholder="050-0000000"
              />
            </div>
          </div>

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
                required
                dir="ltr"
                autoComplete="email"
                enterKeyHint="next"
                className={`${fieldWithIconClass} text-left`}
                placeholder="name@garage.co.il"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <label htmlFor="partnerType" className="text-sm font-medium text-ensura-ink">
              סוג שותף
            </label>
            <div className="relative">
              <Users
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ensura-navy/40"
                aria-hidden="true"
              />
              <select
                id="partnerType"
                name="partnerType"
                required
                defaultValue=""
                className={cn(fieldWithIconClass, "appearance-none")}
              >
                <option value="" disabled>
                  בחירה…
                </option>
                <option value="garage">מוסך</option>
                <option value="agency">סוכנות ביטוח</option>
                <option value="other">שותף מקצועי אחר</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <label htmlFor="message" className="text-sm font-medium text-ensura-ink">
              הודעה <span className="font-normal text-ensura-navy/45">(אופציונלי)</span>
            </label>
            <div className="relative">
              <MessageSquare
                className="pointer-events-none absolute right-3 top-3.5 size-4 text-ensura-navy/40"
                aria-hidden="true"
              />
              <textarea
                id="message"
                name="message"
                rows={4}
                maxLength={1000}
                enterKeyHint="send"
                className="w-full rounded-lg border border-ensura-navy/12 bg-ensura-canvas/70 py-3 pr-10 pl-3 text-base text-ensura-ink outline-none transition-colors placeholder:text-ensura-navy/35 focus:border-ensura-teal focus:ring-2 focus:ring-ensura-teal/20"
                placeholder="ספרו בקצרה על היקף הפעילות או הצורך שלכם"
              />
            </div>
          </div>

          {state.error && (
            <p
              className="sm:col-span-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-700"
              role="alert"
            >
              {state.error}
            </p>
          )}

          <div className="sm:col-span-2">
            <SubmitButton />
          </div>
        </form>
      </div>

      {!compact && (
        <p className="mt-6 text-center text-sm text-ensura-navy/45">
          כבר שותפים?{" "}
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center font-medium text-ensura-teal touch-manipulation hover:underline"
          >
            כניסה לפורטל
          </Link>
        </p>
      )}
    </div>
  )
}
