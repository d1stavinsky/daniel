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
              ? "text-lg font-bold tracking-[0.2em] text-primary-foreground"
              : "text-lg font-bold tracking-[0.2em] text-foreground"
          }
        >
          AXIS
        </span>
        <span
          className={
            inverted
              ? "text-[10px] font-medium tracking-[0.15em] text-primary-foreground/60"
              : "text-[10px] font-medium tracking-[0.15em] text-muted-foreground"
          }
        >
          CLAIMS MANAGEMENT
        </span>
      </div>
    </div>
  )
}
