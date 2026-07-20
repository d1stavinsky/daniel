import Link from "next/link"
import { JoinLeadForm } from "@/components/landing/join-lead-form"

export function FinalCta() {
  return (
    <section
      id="join"
      className="relative overflow-hidden bg-ensura-canvas py-16 sm:py-20 md:py-28"
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
          className="text-[1.65rem] font-bold tracking-tight text-ensura-ink text-balance sm:text-2xl md:text-4xl md:leading-[1.2]"
        >
          מוכנים לנהל תביעות בצורה פשוטה יותר?
        </h2>

        <p className="mx-auto mt-4 max-w-xl text-base font-normal leading-relaxed text-ensura-navy/65 text-pretty md:text-lg">
          השאירו פרטי קשר ונחזור אליכם לתיאום הצטרפות מסודרת לאינשורה.
        </p>

        <div className="mt-8 text-start sm:mt-10">
          <JoinLeadForm compact />
        </div>

        <p className="mt-6 text-center text-sm text-ensura-navy/45">
          כבר שותפים?{" "}
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center font-medium text-ensura-teal touch-manipulation hover:underline"
          >
            כניסה לפורטל
          </Link>
        </p>
      </div>
    </section>
  )
}
