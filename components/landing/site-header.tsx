import Link from "next/link"
import { Button } from "@/components/ui/button"
import { AxisLogo } from "@/components/brand/axis-logo"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-8">
        <Link href="/" aria-label="אקסיס | AXIS – דף הבית">
          <AxisLogo />
        </Link>

        <nav className="flex items-center gap-2 md:gap-6">
          <Link
            href="#about"
            className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            אודות
          </Link>
          <Link
            href="#advantage"
            className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            היתרון שלנו
          </Link>
          <Button
            render={<Link href="/login" />}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            כניסת שותפים
          </Button>
        </nav>
      </div>
    </header>
  )
}
