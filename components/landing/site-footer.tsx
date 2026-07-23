import Link from "next/link"
import { EnsuraLogo } from "@/components/brand/ensura-logo"
import { CookieSettingsButton } from "@/components/legal/cookie-settings-button"

const LEGAL_LINKS = [
  { href: "/privacy", label: "מדיניות פרטיות" },
  { href: "/terms", label: "תנאי שימוש" },
  { href: "/accessibility", label: "הצהרת נגישות" },
] as const

export function SiteFooter() {
  return (
    <footer
      className="border-t border-ensura-navy/8 bg-ensura-canvas py-8 sm:py-10"
      style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 md:px-8">
        <div className="flex flex-col items-center justify-between gap-6 text-center md:flex-row md:items-start md:text-start">
          <div className="flex flex-col items-center gap-3 md:items-start">
            <EnsuraLogo compact />
            <p className="max-w-sm text-sm leading-relaxed text-ensura-navy/55 text-pretty">
              © {new Date().getFullYear()} אינשורה | ENSURA · כל הזכויות שמורות
            </p>
          </div>

          <nav
            aria-label="מידע משפטי ונגישות"
            className="flex flex-col items-center gap-1 sm:items-stretch"
          >
            <p className="mb-1 font-manrope text-[0.65rem] font-medium tracking-[0.16em] text-ensura-navy/40 uppercase">
              Legal
            </p>
            <ul className="flex flex-col items-center gap-1 sm:items-start">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-10 items-center text-sm text-ensura-navy/65 touch-manipulation transition-colors hover:text-ensura-teal"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <CookieSettingsButton />
              </li>
            </ul>
          </nav>
        </div>

        <p className="border-t border-ensura-navy/8 pt-5 text-center text-xs leading-relaxed text-ensura-navy/40 text-pretty md:text-start">
          השימוש באתר כפוף למדיניות הפרטיות ולתנאי השימוש. פניות פרטיות:{" "}
          <a
            href="mailto:privacy@ensura.co.il"
            className="text-ensura-navy/55 underline-offset-2 hover:text-ensura-teal hover:underline"
            dir="ltr"
          >
            privacy@ensura.co.il
          </a>
          {" · "}
          נגישות:{" "}
          <a
            href="mailto:accessibility@ensura.co.il"
            className="text-ensura-navy/55 underline-offset-2 hover:text-ensura-teal hover:underline"
            dir="ltr"
          >
            accessibility@ensura.co.il
          </a>
        </p>
      </div>
    </footer>
  )
}
