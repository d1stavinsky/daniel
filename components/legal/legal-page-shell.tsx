import type { ReactNode } from "react"
import Link from "next/link"
import { SiteHeader } from "@/components/landing/site-header"
import { SiteFooter } from "@/components/landing/site-footer"
import { cn } from "@/lib/utils"

export function LegalPageShell({
  title,
  subtitle,
  updatedAt,
  children,
}: {
  title: string
  subtitle?: string
  updatedAt?: string
  children: ReactNode
}) {
  return (
    <div className="ensura-landing min-h-screen">
      <SiteHeader />
      <main
        id="main-content"
        className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--ensura-header-offset)+1.5rem)] sm:px-6 sm:pb-20 sm:pt-[calc(var(--ensura-header-offset)+2.5rem)]"
      >
        <p className="font-manrope text-[0.7rem] font-medium tracking-[0.16em] text-ensura-teal uppercase">
          Legal · משפטי
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-ensura-ink text-balance sm:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-3 text-base leading-relaxed text-ensura-navy/65 text-pretty">{subtitle}</p>
        ) : null}
        {updatedAt ? (
          <p className="mt-4 text-sm text-ensura-navy/45">עודכן לאחרונה: {updatedAt}</p>
        ) : null}

        <div className="mt-10 space-y-8 text-[0.95rem] leading-7 text-ensura-navy/80 sm:mt-12 sm:space-y-10">
          {children}
        </div>

        <nav
          aria-label="מסמכים משפטיים נוספים"
          className="mt-14 flex flex-wrap gap-x-5 gap-y-2 border-t border-ensura-navy/10 pt-8 text-sm"
        >
          <LegalNavLink href="/privacy">מדיניות פרטיות</LegalNavLink>
          <LegalNavLink href="/terms">תנאי שימוש</LegalNavLink>
          <LegalNavLink href="/accessibility">הצהרת נגישות</LegalNavLink>
          <LegalNavLink href="/">חזרה לדף הבית</LegalNavLink>
        </nav>
      </main>
      <SiteFooter />
    </div>
  )
}

function LegalNavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="min-h-11 inline-flex items-center text-ensura-teal touch-manipulation hover:underline"
    >
      {children}
    </Link>
  )
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="text-lg font-semibold tracking-tight text-ensura-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-pretty">{children}</div>
    </section>
  )
}

export function LegalList({ items, ordered = false }: { items: ReactNode[]; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul"
  return (
    <Tag
      className={cn(
        "ms-5 space-y-2",
        ordered ? "list-decimal" : "list-disc marker:text-ensura-teal/70",
      )}
    >
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </Tag>
  )
}
