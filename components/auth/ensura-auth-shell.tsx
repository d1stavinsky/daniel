import type { ReactNode } from "react"
import Link from "next/link"
import { EnsuraLogo } from "@/components/brand/ensura-logo"
import { cn } from "@/lib/utils"

export function EnsuraAuthShell({
  children,
  wide = false,
}: {
  children: ReactNode
  wide?: boolean
}) {
  return (
    <main
      id="main-content"
      className="ensura-landing relative flex min-h-svh items-start justify-center overflow-x-clip px-4 py-8 sm:items-center sm:py-12"
      style={{
        paddingTop: "max(2rem, env(safe-area-inset-top))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
      }}
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

      <div
        className={cn(
          "relative z-10 flex w-full flex-col items-center",
          wide ? "max-w-xl" : "max-w-md",
        )}
      >
        <Link
          href="/"
          aria-label="חזרה לדף הבית"
          className="mb-6 inline-flex min-h-11 items-center touch-manipulation sm:mb-8"
        >
          <EnsuraLogo />
        </Link>
        {children}
      </div>
    </main>
  )
}
