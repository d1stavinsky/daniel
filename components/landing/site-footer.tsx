import { EnsuraLogo } from "@/components/brand/ensura-logo"

export function SiteFooter() {
  return (
    <footer
      className="border-t border-ensura-navy/8 bg-ensura-canvas py-8 sm:py-10"
      style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-4 text-center md:flex-row md:px-8 md:text-start">
        <EnsuraLogo compact />
        <p className="max-w-sm text-sm leading-relaxed text-ensura-navy/55 text-pretty md:max-w-none">
          © {new Date().getFullYear()} אינשורה | ENSURA · כל הזכויות שמורות
        </p>
      </div>
    </footer>
  )
}
