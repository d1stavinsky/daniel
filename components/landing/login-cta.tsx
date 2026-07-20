import Link from "next/link"
import { ArrowLeft, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"

export function LoginCta() {
  return (
    <section id="about" className="bg-secondary/50 py-20 md:py-28">
      <div className="mx-auto max-w-4xl px-4 md:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center md:px-16 md:py-20">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/15 text-gold">
              <Lock className="size-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-primary-foreground text-balance md:text-4xl">
              פורטל השותפים שלכם מחכה
            </h2>
            <p className="max-w-xl text-base leading-relaxed text-primary-foreground/70 text-pretty">
              התחברו כדי לנהל את התביעות, לעקוב אחר הכספים בזמן אמת ולצפות בכל
              המידע במקום אחד — בסביבה מאובטחת ושקופה.
            </p>
            <Button
              render={<Link href="/login" />}
              size="lg"
              className="gap-2 bg-gold text-gold-foreground hover:bg-gold/90"
            >
              כניסה ללוח הבקרה
              <ArrowLeft className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
