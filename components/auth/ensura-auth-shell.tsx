import type { ReactNode } from "react"
import Link from "next/link"
import { EnsuraLogo } from "@/components/brand/ensura-logo"

export function EnsuraAuthShell({ children }: { children: ReactNode }) {
  return (
    <main
      className="ensura-landing relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-12"
      dir="rtl"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, color-mix(in srgb, #20B6A6 10%, transparent), transparent 65%), radial-gradient(ellipse 50% 40% at 15% 100%, color-mix(in srgb, #10263F 6%, transparent), transparent 55%)",
        }}
      />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        <Link href="/" aria-label="חזרה לדף הבית" className="mb-8">
          <EnsuraLogo />
        </Link>
        {children}
      </div>
    </main>
  )
}
