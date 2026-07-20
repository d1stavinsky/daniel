import Link from "next/link"
import { JoinLeadForm } from "@/components/landing/join-lead-form"

export function FinalCta() {
  return (
    <section
      id="join"
      className="relative overflow-hidden bg-ensura-canvas py-24 md:py-28"
      dir="rtl"
      aria-labelledby="final-cta-heading"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 45% at 50% 100%, color-mix(in srgb, #20B6A6 8%, transparent), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-xl px-4 text-center md:px-8">
        <h2
          id="final-cta-heading"
          className="text-2xl font-bold tracking-tight text-ensura-ink text-balance md:text-4xl md:leading-[1.2]"
        >
          מוכנים לנהל תביעות בצורה פשוטה יותר?
        </h2>

        <p className="mx-auto mt-4 max-w-xl text-base font-normal leading-relaxed text-ensura-navy/65 text-pretty md:text-lg">
          השאירו פרטי קשר ונחזור אליכם לתיאום הצטרפות מסודרת לאינשורה.
        </p>

        <div className="mt-10 text-start">
          <JoinLeadForm compact />
        </div>

        <p className="mt-6 text-center text-xs text-ensura-navy/45">
          כבר שותפים?{" "}
          <Link href="/login" className="font-medium text-ensura-teal hover:underline">
            כניסה לפורטל
          </Link>
        </p>
      </div>
    </section>
  )
}
