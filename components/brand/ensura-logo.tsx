import { cn } from "@/lib/utils"

type EnsuraLogoProps = {
  className?: string
  compact?: boolean
  /** light = marketing canvas; dark = ops dashboard */
  tone?: "light" | "dark"
}

export function EnsuraLogo({
  className,
  compact = false,
  tone = "light",
}: EnsuraLogoProps) {
  const dark = tone === "dark"

  return (
    <div className={cn("flex max-w-full items-center gap-2.5 sm:gap-3", className)} dir="rtl">
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg text-white sm:size-10",
          dark ? "bg-ensura-teal" : "bg-ensura-navy",
        )}
      >
        <span className="font-manrope text-sm font-bold tracking-[0.12em]">E</span>
      </div>
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
