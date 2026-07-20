import { Scale, MonitorSmartphone, ShieldCheck } from "lucide-react"

const pillars = [
  {
    icon: Scale,
    title: "מעטפת מקצועית",
    description:
      "ליווי מקצועי לכל תביעה מקצה לקצה — עם סדר, בהירות ומיקוד בתוצאה עבור השותפים בשטח.",
  },
  {
    icon: MonitorSmartphone,
    title: "מעקב דיגיטלי",
    description:
      "סטטוס, מסמכים ופעולות במקום אחד — שקוף, מסודר ונגיש בכל רגע.",
  },
  {
    icon: ShieldCheck,
    title: "שקיפות מלאה",
    description:
      "כל הגורמים עובדים באותה סביבה, עם פחות פערי מידע ופחות עיכובים מיותרים.",
  },
] as const

export function Advantage() {
  return (
    <section
      id="services"
      className="scroll-mt-24 bg-ensura-canvas py-20 md:py-28"
      dir="rtl"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium tracking-[0.16em] text-ensura-teal">
            היתרון של אינשורה
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-ensura-ink text-balance md:text-4xl md:leading-[1.2]">
            פחות התעסקות. יותר שליטה.
          </h2>
          <p className="mt-4 text-base font-normal leading-relaxed text-ensura-navy/65 text-pretty">
            מעטפת אחת שמחברת שירות, מעקב וטיפול מקצועי — למוסכים, לסוכנויות
            ולשותפים בשטח.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3 lg:gap-6">
          {pillars.map((pillar) => (
            <article
              key={pillar.title}
              className="rounded-2xl border border-ensura-navy/8 bg-white p-8 shadow-[0_12px_40px_-28px_rgba(16,38,63,0.35)]"
            >
              <div className="flex size-12 items-center justify-center rounded-xl bg-ensura-teal/10 text-ensura-teal">
                <pillar.icon className="size-6" strokeWidth={1.75} />
              </div>
              <h3 className="mt-6 text-lg font-semibold tracking-tight text-ensura-ink">
                {pillar.title}
              </h3>
              <p className="mt-3 text-sm font-normal leading-relaxed text-ensura-navy/65 text-pretty">
                {pillar.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
