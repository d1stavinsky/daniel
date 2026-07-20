import { AxisLogo } from "@/components/brand/axis-logo"

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 md:flex-row md:px-8">
        <AxisLogo />
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} AXIS Claims Management · כל הזכויות שמורות
        </p>
      </div>
    </footer>
  )
}
