type AxisLogoProps = {
  inverted?: boolean
}

export function AxisLogo({ inverted = false }: AxisLogoProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={
          inverted
            ? "flex h-10 w-10 items-center justify-center rounded-lg bg-gold text-gold-foreground"
            : "flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        }
      >
        <span className="text-lg font-bold tracking-tight">A</span>
      </div>
      <div className="flex flex-col leading-none">
        <span
          className={
            inverted
              ? "text-base font-semibold tracking-wide text-primary-foreground"
              : "text-base font-semibold tracking-wide text-foreground"
          }
        >
          AXIS | אקסיס
        </span>
        <span
          className={
            inverted
              ? "text-[9px] font-medium tracking-wide text-primary-foreground/60"
              : "text-[9px] font-medium tracking-wide text-muted-foreground"
          }
        >
          CLAIMS MANAGEMENT | ניהול תביעות
        </span>
      </div>
    </div>
  )
}
