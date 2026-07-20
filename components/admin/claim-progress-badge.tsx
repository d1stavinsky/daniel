import { cn } from "@/lib/utils"
import {
  claimProgressLabels,
  claimProgressPercent,
  type ClaimProgressStatus,
  REQUIRED_DOC_COUNT,
} from "@/lib/claim-progress"

const statusStyles: Record<ClaimProgressStatus, string> = {
  pending: "bg-secondary text-muted-foreground ring-border",
  in_progress: "bg-gold/15 text-gold ring-gold/30",
  pending_resolution: "bg-amber-400/15 text-amber-700 ring-amber-400/30",
  completed: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
}

const barStyles: Record<ClaimProgressStatus, string> = {
  pending: "bg-secondary",
  in_progress: "bg-gold",
  pending_resolution: "bg-amber-400",
  completed: "bg-emerald-500",
}

type ClaimProgressBadgeProps = {
  status: ClaimProgressStatus
  uploadedCount: number
  className?: string
  /** Compact: badge only. Default shows badge + bar + count. */
  compact?: boolean
}

export function ClaimProgressBadge({
  status,
  uploadedCount,
  className,
  compact = false,
}: ClaimProgressBadgeProps) {
  const pct = claimProgressPercent(uploadedCount)
  const label = claimProgressLabels[status]

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ring-1",
            statusStyles[status],
          )}
        >
          {label}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {uploadedCount}/{REQUIRED_DOC_COUNT} מאומתים
        </span>
      </div>
      {!compact && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
          <div
            className={cn("h-full rounded-full transition-all", barStyles[status])}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}
