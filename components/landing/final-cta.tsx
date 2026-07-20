import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export function FinalCta() {
  return (
    <section
      id="join"
      className="bg-ensura-canvas py-24 md:py-28"
      dir="rtl"
      aria-labelledby="final-cta-heading"
    >
      <div className="mx-auto max-w-2xl px-4 text-center md:px-8">
        <h2
          id="final-cta-heading"
          className="text-2xl font-bold tracking-tight text-ensura-ink text-balance md:text-4xl md:leading-[1.2]"
        >
          מוכנים לנהל תביעות בצורה פשוטה יותר?
        </h2>

        <p className="mx-auto mt-4 max-w-xl text-base font-normal leading-relaxed text-ensura-navy/65 text-pretty md:text-lg">
          הצטרפו לאינשורה וקבלו מעטפת אחת שמרכזת את השירות, המעקב והטיפול
          המקצועי.
        </p>

        <div className="mt-8 flex justify-center">
          <Button
            render={<Link href="/login" />}
            size="lg"
            className="h-11 gap-2 rounded-lg bg-ensura-teal px-6 text-sm font-semibold text-white hover:bg-ensura-teal/90"
          >
            הצטרפות לאינשורה
            <ArrowLeft className="size-4" />
          </Button>
        </div>
      </div>
    </section>
  )
}
