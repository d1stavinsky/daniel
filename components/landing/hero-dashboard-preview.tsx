import { CheckCircle2, Clock3, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

const statusCards = [
  {
    label: "בטיפול",
    value: "18",
    hint: "תיקים פעילים",
    tone: "bg-ensura-teal/10 text-ensura-teal",
    icon: Clock3,
  },
  {
    label: "ממתינים למסמכים",
    value: "6",
    hint: "דורשים מענה",
    tone: "bg-ensura-gold/15 text-ensura-navy",
    icon: FileText,
  },
  {
    label: "הושלמו החודש",
    value: "42",
    hint: "סגירה מלאה",
    tone: "bg-ensura-navy/8 text-ensura-navy",
    icon: CheckCircle2,
  },
] as const

const rows = [
  { id: "CLM-1842", garage: "מוסך דניאל", stage: "חקירה", progress: 72 },
  { id: "CLM-1837", garage: "סוכנות אור", stage: "דרישה", progress: 48 },
  { id: "CLM-1829", garage: "מוסך הצפון", stage: "איסוף מסמכים", progress: 31 },
] as const

export function HeroDashboardPreview({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-ensura-navy/10 bg-white shadow-[0_24px_80px_-32px_rgba(16,38,63,0.35)]",
        className,
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-ensura-gold/70 to-transparent" />

      <div className="flex items-center justify-between border-b border-ensura-navy/8 px-5 py-4">
        <div>
          <p className="font-manrope text-[10px] font-semibold tracking-[0.18em] text-ensura-navy/45 uppercase">
            ENSURA Console
          </p>
          <p className="mt-1 text-sm font-semibold text-ensura-ink">תיבת משימות</p>
        </div>
        <span className="rounded-full bg-ensura-teal/10 px-2.5 py-1 text-[11px] font-medium text-ensura-teal">
          בזמן אמת
        </span>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-3">
        {statusCards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className="rounded-xl border border-ensura-navy/8 bg-ensura-canvas/70 px-3.5 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-ensura-navy/55">{card.label}</p>
                <span className={cn("rounded-md p-1", card.tone)}>
                  <Icon className="size-3.5" strokeWidth={1.75} />
                </span>
              </div>
              <p className="mt-2 font-manrope text-2xl font-semibold tracking-tight text-ensura-ink">
                {card.value}
              </p>
              <p className="mt-0.5 text-[11px] text-ensura-navy/45">{card.hint}</p>
            </div>
          )
        })}
      </div>

      <div className="border-t border-ensura-navy/8 px-5 pb-5">
        <div className="mb-3 flex items-center justify-between pt-4">
          <p className="text-xs font-semibold text-ensura-ink">מעקב תביעות</p>
          <p className="font-manrope text-[10px] tracking-wide text-ensura-navy/40 uppercase">
            Live
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-ensura-navy/8">
          <div className="grid grid-cols-[5.5rem_1fr_5.5rem_4.5rem] gap-2 bg-ensura-canvas/80 px-3 py-2 text-[10px] font-medium tracking-wide text-ensura-navy/45">
            <span>תיק</span>
            <span>שותף</span>
            <span>שלב</span>
            <span>התקדמות</span>
          </div>
          <ul className="divide-y divide-ensura-navy/6">
            {rows.map((row) => (
              <li
                key={row.id}
                className="grid grid-cols-[5.5rem_1fr_5.5rem_4.5rem] items-center gap-2 px-3 py-2.5"
              >
                <span className="font-manrope text-[11px] font-semibold text-ensura-ink">
                  {row.id}
                </span>
                <span className="truncate text-[11px] text-ensura-navy/70">{row.garage}</span>
                <span className="truncate text-[11px] text-ensura-navy/55">{row.stage}</span>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ensura-navy/8">
                    <div
                      className="h-full rounded-full bg-ensura-teal"
                      style={{ width: `${row.progress}%` }}
                    />
                  </div>
                  <span className="font-manrope text-[10px] tabular-nums text-ensura-navy/45">
                    {row.progress}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
