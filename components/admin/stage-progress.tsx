import { TOTAL_STAGES, stageLabel } from "@/lib/workflow-data"
import { cn } from "@/lib/utils"

type StageProgressProps = {
  currentStage: number
  className?: string
  showLabel?: boolean
}

export function StageProgress({ currentStage, className, showLabel = true }: StageProgressProps) {
  const doneCount = Math.max(0, currentStage - 1)
  const isClosed = currentStage >= TOTAL_STAGES

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {showLabel && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-foreground">{stageLabel(currentStage)}</span>
          <span className="text-muted-foreground tabular-nums">
            {Math.min(currentStage, TOTAL_STAGES)}/{TOTAL_STAGES}
          </span>
        </div>
      )}
      <div className="flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: TOTAL_STAGES }).map((_, i) => {
          const stageNum = i + 1
          const done = stageNum <= doneCount
          const current = stageNum === currentStage
          return (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                done && "bg-trust",
                current && !isClosed && "bg-gold",
                current && isClosed && "bg-trust",
                !done && !current && "bg-secondary",
              )}
            />
          )
        })}
      </div>
    </div>
  )
}
