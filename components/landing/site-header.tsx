import Link from "next/link"
import { EnsuraLogo } from "@/components/brand/ensura-logo"

const navLinks = [
  { href: "#how-it-works", label: "איך זה עובד" },
  { href: "#services", label: "השירותים" },
  { href: "#audience", label: "לשותפים" },
] as const

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ensura-navy/8 bg-ensura-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-8">
        <Link href="/" aria-label="אינשורה | ENSURA – דף הבית" className="shrink-0">
          <EnsuraLogo compact />
        </Link>

        <nav
          className="flex items-center gap-1 sm:gap-2 md:gap-6"
          aria-label="ניווט ראשי"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hidden rounded-md px-2 py-1.5 text-sm font-medium text-ensura-navy/60 transition-colors hover:text-ensura-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ensura-teal/40 sm:inline-flex"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/login"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-ensura-navy px-3.5 text-sm font-medium text-white transition-colors hover:bg-ensura-navy/90"
          >
            כניסת שותפים
          </Link>
        </nav>
      </div>
    </header>
  )
}
