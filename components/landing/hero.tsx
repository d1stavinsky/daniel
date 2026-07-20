import { ArrowLeft } from "lucide-react"
import { HeroDashboardPreview } from "@/components/landing/hero-dashboard-preview"

export function Hero() {
  return (
    <section
      id="hero"
      className="relative overflow-hidden bg-ensura-canvas"
      dir="rtl"
      aria-labelledby="ensura-hero-heading"
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 85% 15%, color-mix(in srgb, #20B6A6 12%, transparent), transparent 60%), radial-gradient(ellipse 55% 45% at 10% 90%, color-mix(in srgb, #10263F 6%, transparent), transparent 55%)",
        }}
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:gap-12 sm:py-16 md:px-8 md:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16 lg:py-28">
        <div className="flex w-full min-w-0 flex-col items-start gap-6 sm:gap-7">
          <p className="flex max-w-full flex-col gap-1 text-xs font-medium tracking-wide text-ensura-navy/60 sm:inline-flex sm:flex-row sm:items-center sm:gap-2">
            <span>פחות התעסקות. יותר שליטה.</span>
            <span aria-hidden="true" className="hidden text-ensura-gold sm:inline">
              ·
            </span>
            <bdi
              dir="ltr"
              className="font-manrope tracking-[0.08em] text-ensura-navy/45"
            >
              Claims Made Simple
            </bdi>
          </p>

          <div className="max-w-xl space-y-4">
            <h1
              id="ensura-hero-heading"
              className="text-[1.75rem] font-bold leading-[1.2] tracking-tight text-ensura-ink text-balance sm:text-3xl md:text-5xl md:leading-[1.12]"
            >
              ניהול תביעות רכב. פשוט יותר.
            </h1>

            <p className="max-w-lg text-base leading-relaxed text-ensura-navy/70 text-pretty md:text-lg">
              אינשורה מנהלת עבור מוסכים וסוכנויות ביטוח את כל תהליך התביעה — עם
              מעטפת מקצועית, מעקב דיגיטלי וכל הגורמים במקום אחד.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <a
              href="#join"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-ensura-teal px-5 text-base font-semibold text-white transition-colors hover:bg-ensura-teal/90 touch-manipulation sm:w-auto sm:text-sm"
            >
              הצטרפות לאינשורה
              <ArrowLeft className="size-4 shrink-0" />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-ensura-navy/15 bg-white/70 px-5 text-base font-medium text-ensura-ink transition-colors hover:bg-white touch-manipulation sm:w-auto sm:text-sm"
            >
              איך זה עובד
            </a>
          </div>

          <p className="w-full border-t border-ensura-navy/10 pt-5 text-sm text-ensura-navy/55">
            אתם מעבירים את התיק. אנחנו מנהלים את התהליך.
          </p>
        </div>

        <div className="relative min-w-0">
          <div
            className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-gradient-to-bl from-ensura-teal/10 via-transparent to-ensura-navy/5 blur-2xl sm:-inset-6"
            aria-hidden="true"
          />
          <HeroDashboardPreview className="relative motion-safe-enter animate-in fade-in slide-in-from-bottom-2 duration-700" />
        </div>
      </div>
    </section>
  )
}
