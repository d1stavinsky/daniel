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

      <div className="flex items-center justify-between gap-3 border-b border-ensura-navy/8 px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="min-w-0">
          <p className="font-manrope text-[10px] font-semibold tracking-[0.18em] text-ensura-navy/45 uppercase">
            ENSURA Console
          </p>
          <p className="mt-1 text-sm font-semibold text-ensura-ink">תיבת משימות</p>
        </div>
        <span className="shrink-0 rounded-full bg-ensura-teal/10 px-2.5 py-1 text-[11px] font-medium text-ensura-teal">
          LIVE
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 p-3 sm:gap-3 sm:p-5">
        {statusCards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className="min-w-0 rounded-xl border border-ensura-navy/8 bg-ensura-canvas/70 px-2 py-2.5 sm:px-3.5 sm:py-3"
            >
              <div className="flex items-start justify-between gap-1">
                <p className="text-[10px] font-medium leading-snug text-ensura-navy/55 sm:text-[11px]">
                  {card.label}
                </p>
                <span className={cn("hidden rounded-md p-1 sm:inline-flex", card.tone)}>
                  <Icon className="size-3.5" strokeWidth={1.75} />
                </span>
              </div>
              <p className="mt-1.5 font-manrope text-xl font-semibold tracking-tight text-ensura-ink sm:mt-2 sm:text-2xl">
                {card.value}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-ensura-navy/45 sm:text-[11px]">
                {card.hint}
              </p>
            </div>
          )
        })}
      </div>

      <div className="border-t border-ensura-navy/8 px-3 pb-3 sm:px-5 sm:pb-5">
        <div className="mb-3 flex items-center justify-between pt-3 sm:pt-4">
          <p className="text-xs font-semibold text-ensura-ink">מעקב תביעות</p>
          <p className="font-manrope text-[10px] tracking-wide text-ensura-navy/40 uppercase">
            Live
          </p>
        </div>

        {/* Mobile: stacked claim cards — no clipped 4-col table */}
        <ul className="space-y-2 sm:hidden">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-ensura-navy/8 bg-ensura-canvas/50 px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-manrope text-[11px] font-semibold text-ensura-ink">
                  {row.id}
                </span>
                <span className="font-manrope text-[10px] tabular-nums text-ensura-navy/45">
                  {row.progress}%
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-ensura-navy/70">{row.garage}</span>
                <span className="shrink-0 text-ensura-navy/55">{row.stage}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ensura-navy/8">
                <div
                  className="h-full rounded-full bg-ensura-teal"
                  style={{ width: `${row.progress}%` }}
                />
              </div>
            </li>
          ))}
        </ul>

        {/* sm+: compact table */}
        <div className="hidden overflow-hidden rounded-xl border border-ensura-navy/8 sm:block">
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_5rem_4.5rem] gap-2 bg-ensura-canvas/80 px-3 py-2 text-[10px] font-medium tracking-wide text-ensura-navy/45 md:grid-cols-[5.5rem_1fr_5.5rem_4.5rem]">
            <span>תיק</span>
            <span>שותף</span>
            <span>שלב</span>
            <span>התקדמות</span>
          </div>
          <ul className="divide-y divide-ensura-navy/6">
            {rows.map((row) => (
              <li
                key={row.id}
                className="grid grid-cols-[5.5rem_minmax(0,1fr)_5rem_4.5rem] items-center gap-2 px-3 py-2.5 md:grid-cols-[5.5rem_1fr_5.5rem_4.5rem]"
              >
                <span className="font-manrope text-[11px] font-semibold text-ensura-ink">
                  {row.id}
                </span>
                <span className="truncate text-[11px] text-ensura-navy/70">{row.garage}</span>
                <span className="truncate text-[11px] text-ensura-navy/55">{row.stage}</span>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ensura-navy/8">
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
