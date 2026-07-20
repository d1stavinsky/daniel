import { cn } from "@/lib/utils"

type EnsuraLogoProps = {
  className?: string
  compact?: boolean
}

export function EnsuraLogo({ className, compact = false }: EnsuraLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)} dir="rtl">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ensura-navy text-white">
        <span className="font-manrope text-sm font-bold tracking-[0.12em]">E</span>
      </div>
      <div className="flex min-w-0 flex-col items-start leading-none">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-base font-semibold tracking-wide text-ensura-ink">
          <span>אינשורה</span>
          <span aria-hidden="true" className="text-ensura-navy/30">
            |
          </span>
          <bdi dir="ltr" className="font-manrope tracking-[0.14em]">
            ENSURA
          </bdi>
        </span>
        {!compact && (
          <span className="mt-1.5 text-[10px] font-medium tracking-wide text-ensura-navy/55">
            תביעות. פשוט יותר.
          </span>
        )}
      </div>
    </div>
  )
}
