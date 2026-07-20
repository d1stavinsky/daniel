const audiences = [
  {
    title: "למוסכים",
    description:
      "ניהול מסודר של תיקי התביעה, פחות התעסקות אדמיניסטרטיבית ויכולת לעקוב אחרי כל תיק במקום אחד.",
  },
  {
    title: "לסוכנויות ביטוח",
    description:
      "שירות מקצועי ללקוחות הסוכנות, בלי להעמיס על צוות המשרד את ניהול התביעה השוטף.",
  },
  {
    title: "לשותפים מקצועיים",
    description:
      "סביבת עבודה משותפת המחברת בין כל המעורבים ומצמצמת פערי מידע ועיכובים.",
  },
] as const

export function Audience() {
  return (
    <section
      id="audience"
      className="scroll-mt-24 bg-white py-20 md:py-28"
      dir="rtl"
      aria-labelledby="audience-heading"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium tracking-[0.16em] text-ensura-teal">
            קהלי היעד
          </p>
          <h2
            id="audience-heading"
            className="mt-3 text-2xl font-bold tracking-tight text-ensura-ink text-balance md:text-4xl md:leading-[1.2]"
          >
            נבנה עבור השותפים שמנהלים את האירוע בשטח
          </h2>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {audiences.map((audience) => (
            <article
              key={audience.title}
              className="rounded-2xl border border-ensura-navy/8 bg-white p-7 shadow-[0_12px_40px_-28px_rgba(16,38,63,0.35)] md:p-8"
            >
              <div
                className="mb-5 h-px w-10 bg-ensura-gold/70"
                aria-hidden="true"
              />
              <h3 className="text-lg font-semibold tracking-tight text-ensura-ink">
                {audience.title}
              </h3>
              <p className="mt-3 text-sm font-normal leading-relaxed text-ensura-navy/65 text-pretty md:text-[15px]">
                {audience.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
