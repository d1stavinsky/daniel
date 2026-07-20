"use client"

import { useCallback, useEffect, useId, useRef, useState, type HTMLAttributes } from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { EnsuraLogo } from "@/components/brand/ensura-logo"
import { cn } from "@/lib/utils"

const navLinks = [
  { href: "#how-it-works", label: "איך זה עובד" },
  { href: "#services", label: "השירותים" },
  { href: "#audience", label: "לשותפים" },
  { href: "#join", label: "הצטרפות" },
] as const

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const openBtnRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeBtnRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("keydown", onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
      openBtnRef.current?.focus()
    }
  }, [open, close])

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-ensura-navy/8 bg-ensura-canvas/90 backdrop-blur-md",
        "pt-[env(safe-area-inset-top)]",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:py-4 md:px-8">
        <Link
          href="/"
          aria-label="אינשורה | ENSURA – דף הבית"
          className="min-h-11 shrink-0 touch-manipulation py-0.5"
          onClick={close}
        >
          <EnsuraLogo compact />
        </Link>

        {/* Desktop / tablet landscape nav */}
        <nav
          className="hidden items-center gap-1 md:flex md:gap-2 lg:gap-5"
          aria-label="ניווט ראשי"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex min-h-11 items-center rounded-md px-2.5 text-sm font-medium text-ensura-navy/60 transition-colors hover:text-ensura-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ensura-teal/40"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ensura-navy px-4 text-sm font-medium text-white transition-colors hover:bg-ensura-navy/90 touch-manipulation"
          >
            כניסת שותפים
          </Link>
        </nav>

        {/* Mobile controls */}
        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ensura-navy px-3.5 text-sm font-medium text-white transition-colors hover:bg-ensura-navy/90 touch-manipulation"
          >
            כניסה
          </Link>
          <button
            ref={openBtnRef}
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-lg border border-ensura-navy/12 bg-white/80 text-ensura-ink transition-colors hover:bg-white touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ensura-teal/40"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "סגירת תפריט" : "פתיחת תפריט"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-5" strokeWidth={1.75} /> : <Menu className="size-5" strokeWidth={1.75} />}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      <div
        className={cn(
          "md:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div
          aria-hidden="true"
          className={cn(
            "fixed inset-0 z-40 bg-ensura-ink/35 backdrop-blur-[2px] transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0",
          )}
          onClick={close}
        />

        <div
          id={menuId}
          role="dialog"
          aria-modal="true"
          aria-label="תפריט ניווט"
          aria-hidden={!open}
          {...(!open ? ({ inert: true } as HTMLAttributes<HTMLDivElement>) : {})}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-[min(100%,20rem)] flex-col border-l border-ensura-navy/10 bg-ensura-canvas shadow-[-24px_0_60px_-28px_rgba(16,38,63,0.45)] transition-transform duration-300 ease-out",
            "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
            open ? "translate-x-0" : "pointer-events-none translate-x-full",
          )}
        >
          <div className="flex items-center justify-between border-b border-ensura-navy/8 px-4 py-3">
            <EnsuraLogo compact />
            <button
              ref={closeBtnRef}
              type="button"
              className="inline-flex size-11 items-center justify-center rounded-lg text-ensura-ink transition-colors hover:bg-ensura-navy/5 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ensura-teal/40"
              aria-label="סגירת תפריט"
              onClick={close}
            >
              <X className="size-5" strokeWidth={1.75} />
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-3" aria-label="ניווט נייד">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="flex min-h-12 items-center rounded-xl px-4 text-base font-medium text-ensura-ink transition-colors hover:bg-ensura-navy/5 touch-manipulation active:bg-ensura-navy/8"
                onClick={close}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex flex-col gap-2 border-t border-ensura-navy/8 p-4">
            <a
              href="#join"
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-ensura-teal px-4 text-base font-semibold text-white transition-colors hover:bg-ensura-teal/90 touch-manipulation"
              onClick={close}
            >
              הצטרפות לאינשורה
            </a>
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-ensura-navy/12 bg-white px-4 text-base font-medium text-ensura-ink transition-colors hover:bg-ensura-navy/5 touch-manipulation"
              onClick={close}
            >
              כניסת שותפים
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
