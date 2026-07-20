import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
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

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16 lg:py-28">
        <div className="flex flex-col items-start gap-7">
          <p className="inline-flex items-center gap-2 text-xs font-medium tracking-wide text-ensura-navy/60">
            <span>פחות התעסקות. יותר שליטה.</span>
            <span aria-hidden="true" className="text-ensura-gold">
              ·
            </span>
            <bdi dir="ltr" className="font-manrope tracking-[0.08em] text-ensura-navy/45">
              Claims Made Simple
            </bdi>
          </p>

          <div className="max-w-xl space-y-4">
            <h1
              id="ensura-hero-heading"
              className="text-3xl font-bold leading-[1.2] tracking-tight text-ensura-ink text-balance md:text-5xl md:leading-[1.12]"
            >
              ניהול תביעות רכב. פשוט יותר.
            </h1>

            <p className="max-w-lg text-base leading-relaxed text-ensura-navy/70 text-pretty md:text-lg">
              אינשורה מנהלת עבור מוסכים וסוכנויות ביטוח את כל תהליך התביעה — עם
              מעטפת מקצועית, מעקב דיגיטלי וכל הגורמים במקום אחד.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button
              render={<Link href="/login" />}
              size="lg"
              className="h-11 gap-2 rounded-lg bg-ensura-teal px-5 text-sm font-semibold text-white hover:bg-ensura-teal/90"
            >
              הצטרפות לאינשורה
              <ArrowLeft className="size-4" />
            </Button>
            <Button
              render={<Link href="#how-it-works" />}
              size="lg"
              variant="outline"
              className="h-11 rounded-lg border-ensura-navy/15 bg-white/70 px-5 text-sm font-medium text-ensura-ink hover:bg-white hover:text-ensura-ink"
            >
              איך זה עובד
            </Button>
          </div>

          <p className="border-t border-ensura-navy/10 pt-5 text-sm text-ensura-navy/55">
            אתם מעבירים את התיק. אנחנו מנהלים את התהליך.
          </p>
        </div>

        <div className="relative">
          <div
            className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-gradient-to-bl from-ensura-teal/10 via-transparent to-ensura-navy/5 blur-2xl"
            aria-hidden="true"
          />
          <HeroDashboardPreview className="relative animate-in fade-in slide-in-from-bottom-2 duration-700" />
        </div>
      </div>
    </section>
  )
}
