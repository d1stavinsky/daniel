import { Scale, MonitorSmartphone, ShieldCheck } from "lucide-react"

const pillars = [
  {
    icon: Scale,
    title: "מעטפת משפטית",
    description:
      "צוות משפטי מומחה המלווה כל תביעה מקצה לקצה, למיצוי הפיצוי המקסימלי מול חברות הביטוח — ללא פשרות.",
  },
  {
    icon: MonitorSmartphone,
    title: "פורטל טכנולוגי",
    description:
      "מעקב בזמן אמת אחר סטטוס התביעות והמצב הפיננסי, בממשק אחד נקי ושקוף הזמין בכל מכשיר.",
  },
  {
    icon: ShieldCheck,
    title: "ניהול נאמנות",
    description:
      "כל התשלומים מנוהלים בחשבון נאמנות ייעודי, עם ביטחון מלא ושקיפות מוחלטת בכל שלב בתהליך.",
  },
]

export function Advantage() {
  return (
    <section id="services" className="scroll-mt-24 bg-background py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium tracking-[0.15em] text-gold">
            היתרון של AXIS
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground text-balance md:text-4xl">
            שלושה עמודי תווך לשקט נפשי מוחלט
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground text-pretty">
            שילוב ייחודי של מומחיות משפטית, טכנולוגיה מתקדמת ואמון — בשירות אחד
            מלא עבור השותפים שלנו.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {pillars.map((pillar) => (
            <article
              key={pillar.title}
              className="group rounded-2xl border border-border bg-card p-8 transition-colors hover:border-gold/50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-gold/15 group-hover:text-gold-foreground">
                <pillar.icon className="size-6" />
              </div>
              <h3 className="mt-6 text-xl font-bold text-foreground">
                {pillar.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground text-pretty">
                {pillar.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
