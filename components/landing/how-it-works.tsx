const steps = [
  {
    number: "01",
    title: "מעבירים את התיק",
    description:
      "המוסך או סוכן הביטוח פותחים תיק ומעלים את המידע הראשוני.",
  },
  {
    number: "02",
    title: "אינשורה מנהלת",
    description:
      "אנחנו מרכזים את המסמכים, התקשורת, המעקב והטיפול המקצועי.",
  },
  {
    number: "03",
    title: "אתם נשארים מעודכנים",
    description:
      "הסטטוס, המסמכים והפעולות מופיעים בפורטל באופן מסודר ושקוף.",
  },
] as const

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-[var(--ensura-header-offset)] bg-ensura-canvas py-16 sm:py-20 md:py-28"
      dir="rtl"
      aria-labelledby="how-it-works-heading"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium tracking-[0.16em] text-ensura-teal">
            איך זה עובד
          </p>
          <h2
            id="how-it-works-heading"
            className="mt-3 text-2xl font-bold tracking-tight text-ensura-ink text-balance md:text-4xl md:leading-[1.2]"
          >
            תהליך אחד. בלי לרדוף אחרי אף אחד.
          </h2>
        </div>

        <ol className="mt-10 grid gap-10 sm:mt-14 md:grid-cols-3 md:gap-8 lg:gap-12">
          {steps.map((step) => (
            <li key={step.number} className="text-center md:text-right">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-ensura-teal/25 md:mx-0">
                <span className="font-manrope text-lg font-semibold tracking-[0.08em] text-ensura-teal">
                  {step.number}
                </span>
              </div>

              <h3 className="mt-5 text-lg font-bold tracking-tight text-ensura-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ensura-navy/65 text-pretty md:text-[15px]">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
