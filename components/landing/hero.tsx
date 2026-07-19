import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src="/hero-axis.png"
          alt=""
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-primary/90" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-24 md:px-8 md:py-32">
        <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-medium tracking-wide text-gold">
          משפט · טכנולוגיה · נאמנות
        </span>

        <h1 className="max-w-4xl text-3xl font-bold leading-tight tracking-tight text-primary-foreground text-balance md:text-5xl md:leading-[1.15]">
          AXIS | אקסיס – המרכז לניהול תביעות.
        </h1>

        <p className="max-w-2xl text-base leading-relaxed text-primary-foreground/70 text-pretty md:text-lg">
          פלטפורמה טכנולוגית לניהול תביעות, המשלבת מעטפת משפטית מקצועית ושקיפות
          מלאה. הדרך החכמה לניהול מוסכים וסוכנויות ביטוח.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            render={<Link href="/login" />}
            size="lg"
            className="gap-2 bg-gold text-gold-foreground hover:bg-gold/90"
          >
            כניסה לפורטל השותפים
            <ArrowLeft className="size-4" />
          </Button>
          <Button
            render={<Link href="#advantage" />}
            size="lg"
            variant="outline"
            className="border-primary-foreground/25 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            גלו את היתרון
          </Button>
        </div>
      </div>
    </section>
  )
}
