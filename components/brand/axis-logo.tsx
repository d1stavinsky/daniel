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
      <div className="flex flex-col items-start leading-none" dir="rtl">
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
        <span
          className={
            inverted
              ? "mt-1 inline-flex items-center gap-1 whitespace-nowrap text-[9px] font-medium tracking-wide text-primary-foreground/60"
              : "mt-1 inline-flex items-center gap-1 whitespace-nowrap text-[9px] font-medium tracking-wide text-muted-foreground"
          }
        >
          <span>המרכז לניהול תביעות מול חברות הביטוח</span>
          <span aria-hidden="true">|</span>
          <bdi dir="ltr">Claims Management</bdi>
        </span>
      </div>
    </div>
  )
}
