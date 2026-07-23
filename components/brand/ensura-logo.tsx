import { cn } from "@/lib/utils"

export const ENSURA_MARK_COLORS = {
  navy: "#10263F",
  gold: "#C8A55A",
  teal: "#21B6A8",
} as const

type EnsuraMarkProps = {
  className?: string
  /**
   * `color` — full brand mark (navy / gold / teal).
   * `mono` — single-color silhouette via `currentColor` (dark UI chrome).
   */
  variant?: "color" | "mono"
  title?: string
}

/**
 * ENSURA logomark — abstract geometric E (symbol only, no wordmark).
 * Traced from the locked Midjourney Quiet Luxury direction.
 */
export function EnsuraMark({
  className,
  variant = "color",
  title,
}: EnsuraMarkProps) {
  const mono = variant === "mono"

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 80 80"
      fill="none"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}

      {mono ? (
        <path fill="currentColor" fillRule="evenodd" d={MARK_BODY} />
      ) : (
        <>
          <path fill={ENSURA_MARK_COLORS.navy} fillRule="evenodd" d={MARK_BODY} />
          <path fill={ENSURA_MARK_COLORS.gold} d={MARK_GOLD} />
          <path fill={ENSURA_MARK_COLORS.teal} d={MARK_TEAL} />
        </>
      )}
    </svg>
  )
}

type EnsuraLogoProps = {
  className?: string
  compact?: boolean
  /** light = marketing canvas; dark = ops dashboard */
  tone?: "light" | "dark"
  /** Icon-only mark (no wordmark). */
  markOnly?: boolean
}

export function EnsuraLogo({
  className,
  compact = false,
  tone = "light",
  markOnly = false,
}: EnsuraLogoProps) {
  const dark = tone === "dark"

  if (markOnly) {
    return (
      <EnsuraMark
        variant={dark ? "mono" : "color"}
        className={cn("size-8", dark && "text-foreground", className)}
        title="ENSURA"
      />
    )
  }

  return (
    <div className={cn("flex max-w-full items-center gap-2.5 sm:gap-3", className)} dir="rtl">
      {dark ? (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ensura-teal text-white sm:size-10">
          <EnsuraMark variant="mono" className="size-[1.4rem] sm:size-6" />
        </div>
      ) : (
        <EnsuraMark className="size-9 sm:size-10" title="ENSURA" />
      )}
      <div className="flex min-w-0 flex-col items-start leading-none">
        <span
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 text-[0.9375rem] font-semibold tracking-wide sm:text-base",
            dark ? "text-foreground" : "text-ensura-ink",
          )}
        >
          <span className="truncate">אינשורה</span>
          <span
            aria-hidden="true"
            className={cn("shrink-0", dark ? "text-foreground/30" : "text-ensura-navy/30")}
          >
            |
          </span>
          <bdi dir="ltr" className="font-manrope shrink-0 tracking-[0.14em]">
            ENSURA
          </bdi>
        </span>
        {!compact && (
          <span
            className={cn(
              "mt-1.5 text-[10px] font-medium tracking-wide",
              dark ? "text-muted-foreground" : "text-ensura-navy/55",
            )}
          >
            תביעות. פשוט יותר.
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Geometric E (viewBox 0 0 80 80)
 * - Outer path + counters via evenodd
 * - Large top-left radius, hard bottom-left corner
 * - Short middle bar (ends at x=52); top/bottom align at x=70
 */
const MARK_BODY = [
  "M12 72",
  "V38",
  "A28 28 0 0 1 40 10",
  "H70",
  "V72",
  "Z",
  // Upper counter (full width under top bar)
  "M30 24",
  "H70",
  "V36",
  "H30",
  "Z",
  // Bay to the right of the short middle bar
  "M52 36",
  "H70",
  "V56",
  "H52",
  "Z",
  // Lower counter under the middle bar
  "M30 50",
  "H52",
  "V56",
  "H30",
  "Z",
].join("")

/** Warm gold — left spine wedge (straight outer edge, curves into the form) */
const MARK_GOLD =
  "M12 40C12 32.2 15.6 25.4 21 20.8 24.2 27.6 26 33.8 26 40V54H12V40Z"

/** Turquoise — outer crescent on the top-left flow */
const MARK_TEAL =
  "M17.5 19.8C22.6 14.2 30.4 10.8 38.5 10.25 30.2 11.8 23.2 15.4 18.2 20.9 17.95 20.5 17.7 20.15 17.5 19.8Z"
