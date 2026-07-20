import { EnsuraLogo } from "@/components/brand/ensura-logo"

export function SiteFooter() {
  return (
    <footer className="border-t border-ensura-navy/8 bg-ensura-canvas py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 md:flex-row md:px-8">
        <EnsuraLogo compact />
        <p className="text-sm text-ensura-navy/55">
          © {new Date().getFullYear()} אינשורה | ENSURA · כל הזכויות שמורות
        </p>
      </div>
    </footer>
  )
}
