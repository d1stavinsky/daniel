import { cn } from "@/lib/utils"

type SparklineProps = {
  requested: number
  received: number
  /* show a thin numeric ratio label after the bars */
  showRatio?: boolean
  className?: string
}

/**
 * A compact at-a-glance balance indicator comparing the requested amount
 * against what was actually received. Two mini bars scaled to the larger
 * value: the track (requested) and the fill (received). The fill turns
 * champagne gold once fully matched, amber while partial, and muted when
 * nothing has arrived yet.
 */
export function Sparkline({ requested, received, showRatio = false, className }: SparklineProps) {
  const max = Math.max(requested, received, 1)
  const reqPct = Math.round((requested / max) * 100)
  const recPct = Math.round((received / max) * 100)
  const ratio = requested > 0 ? Math.min(100, Math.round((received / requested) * 100)) : 0

  const fillTone =
    received <= 0
      ? "bg-muted-foreground/30"
      : received >= requested
        ? "bg-primary"
        : "bg-legal"

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} aria-hidden="true">
      <span className="flex h-6 items-end gap-[3px]">
        <span
          className="w-1.5 rounded-full bg-muted-foreground/25"
          style={{ height: `${Math.max(reqPct, 8)}%` }}
        />
        <span
          className={cn("w-1.5 rounded-full transition-all", fillTone)}
          style={{ height: `${Math.max(recPct, 8)}%` }}
        />
      </span>
      {showRatio && (
        <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{ratio}%</span>
      )}
    </span>
  )
}
