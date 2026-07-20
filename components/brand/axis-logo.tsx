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
      <div className="flex items-center leading-none" dir="rtl">
        <span
          className={
            inverted
              ? "inline-flex items-center gap-1.5 whitespace-nowrap text-base font-semibold tracking-wide text-primary-foreground"
              : "inline-flex items-center gap-1.5 whitespace-nowrap text-base font-semibold tracking-wide text-foreground"
          }
        >
          <span>אקסיס</span>
          <span aria-hidden="true">|</span>
          <bdi dir="ltr">AXIS</bdi>
        </span>
      </div>
    </div>
  )
}
