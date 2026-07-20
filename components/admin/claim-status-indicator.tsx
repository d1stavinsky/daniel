import { cn } from "@/lib/utils"
import {
  verificationToneStyles,
  type ClaimVerificationState,
} from "@/lib/claim-verification"

type ClaimStatusIndicatorProps = {
  verification: ClaimVerificationState
  className?: string
}

/**
 * Thin verification progress bar for claim list cards.
 * Color = operational state; width = verified kinds / required.
 */
export function ClaimStatusIndicator({ verification, className }: ClaimStatusIndicatorProps) {
  const styles = verificationToneStyles[verification.tone]
  const width = Math.max(0, Math.min(100, verification.percent))

  return (
    <div
      className={cn("pointer-events-none w-full", className)}
      title={styles.label}
      role="progressbar"
      aria-valuenow={width}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={styles.label}
    >
      <div className={cn("h-0.5 w-full overflow-hidden rounded-full", styles.track)}>
        <div
          className={cn("h-full rounded-full transition-[width] duration-300 ease-out", styles.bar)}
          style={{ width: `${width === 0 && verification.tone === "red" ? 8 : width}%` }}
        />
      </div>
    </div>
  )
}
