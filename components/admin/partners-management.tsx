"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Building2, Copy, Check, KeyRound, Power, X, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  createPartner,
  togglePartnerStatus,
  type PartnerRow,
  type CreatePartnerResult,
} from "@/app/actions/partners"
import { isValidEmail, normalizeEmail } from "@/lib/validation"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function PartnersManagement({ initialPartners }: { initialPartners: PartnerRow[] }) {
  const router = useRouter()
  const [partners, setPartners] = useState<PartnerRow[]>(initialPartners)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState({ businessName: "", contactEmail: "" })
  const [error, setError] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [creating, startCreate] = useTransition()
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [newCreds, setNewCreds] = useState<{ businessName: string; username: string; password: string } | null>(null)

  // Keep local list in sync when the server revalidates / refreshes props.
  useEffect(() => {
    setPartners(initialPartners)
  }, [initialPartners])

  function toggleForm() {
    setShowForm((s) => !s)
    setError(null)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const businessName = draft.businessName.trim()
    const contactEmail = normalizeEmail(draft.contactEmail)

    if (!businessName) {
      setError("יש למלא שם עסק.")
      return
    }
    if (!isValidEmail(contactEmail)) {
      setError('יש למלא כתובת דוא"ל תקינה.')
      return
    }

    const fd = new FormData()
    fd.set("businessName", businessName)
    fd.set("contactEmail", contactEmail)

    startCreate(async () => {
      try {
        const result: CreatePartnerResult = await createPartner(fd)
        if (!result.ok) {
          setError(result.error)
          return
        }
        setPartners((prev) => [result.partner, ...prev.filter((p) => p.id !== result.partner.id)])
        setNewCreds({
          businessName: result.partner.businessName,
          username: result.credentials.username,
          password: result.credentials.password,
        })
        setDraft({ businessName: "", contactEmail: "" })
        setShowForm(false)
        router.refresh()
      } catch {
        setError("יצירת השותף נכשלה. נסו שוב.")
      }
    })
  }

  function toggle(id: string) {
    const current = partners.find((p) => p.id === id)
    if (!current || togglingId) return

    const previousStatus = current.status
    const nextStatus = previousStatus === "active" ? "suspended" : "active"

    setToggleError(null)
    setTogglingId(id)
    setPartners((prev) => prev.map((p) => (p.id === id ? { ...p, status: nextStatus } : p)))

    void (async () => {
      try {
        const result = await togglePartnerStatus(id)
        if (!result.ok) {
          setPartners((prev) => prev.map((p) => (p.id === id ? { ...p, status: previousStatus } : p)))
          setToggleError(result.error)
          return
        }
        setPartners((prev) => prev.map((p) => (p.id === id ? { ...p, status: result.status } : p)))
        router.refresh()
      } catch {
        setPartners((prev) => prev.map((p) => (p.id === id ? { ...p, status: previousStatus } : p)))
        setToggleError("עדכון הסטטוס נכשל. נסו שוב.")
      } finally {
        setTogglingId(null)
      }
    })()
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">חשבונות שותפים</h2>
            <p className="text-sm text-muted-foreground">
              מוסכים וסוכנויות עם גישה מאובטחת לפורטל. כל שותף מקבל פרטי התחברות ייחודיים.
            </p>
          </div>
          <Button type="button" onClick={toggleForm} aria-expanded={showForm}>
            <Plus className="size-4" aria-hidden="true" />
            שותף חדש
          </Button>
        </div>

        {showForm && (
          <form
            onSubmit={submit}
            noValidate
            className="grid grid-cols-1 gap-3 border-b border-border bg-muted/30 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="businessName" className="text-xs font-medium text-muted-foreground">
                שם העסק
              </label>
              <input
                id="businessName"
                name="businessName"
                required
                disabled={creating}
                value={draft.businessName}
                onChange={(e) => setDraft((d) => ({ ...d, businessName: e.target.value }))}
                placeholder="מוסך הצפון בע״מ"
                autoComplete="organization"
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="contactEmail" className="text-xs font-medium text-muted-foreground">
                דוא&quot;ל ליצירת קשר / התחברות
              </label>
              <input
                id="contactEmail"
                name="contactEmail"
                type="text"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                disabled={creating}
                dir="ltr"
                value={draft.contactEmail}
                onChange={(e) => setDraft((d) => ({ ...d, contactEmail: e.target.value }))}
                onBlur={() =>
                  setDraft((d) => ({ ...d, contactEmail: normalizeEmail(d.contactEmail) }))
                }
                placeholder="contact@garage.co.il"
                autoComplete="email"
                className="h-10 rounded-lg border border-border bg-background px-3 text-left text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
              />
            </div>
            <Button type="submit" disabled={creating} className="h-10">
              {creating && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              יצירת חשבון
            </Button>

            {error && (
              <p
                className="sm:col-span-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}
          </form>
        )}

        {toggleError && (
          <p
            className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
            role="alert"
          >
            {toggleError}
          </p>
        )}

        {partners.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Building2 className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">עדיין לא נוצרו שותפים. צרו את החשבון הראשון.</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">
                      עסק
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      דוא&quot;ל התחברות
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      מזהה פנימי
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      נוצר
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      סטטוס
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      פעולות
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p.id} className="border-b border-border/70 last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium text-foreground">{p.businessName}</td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {p.contactEmail}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {p.loginUsername}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(p.createdAt)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggle(p.id)}
                          disabled={togglingId === p.id}
                          aria-pressed={p.status === "active"}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
                        >
                          {togglingId === p.id ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Power className="size-3.5" aria-hidden="true" />
                          )}
                          {p.status === "active" ? "השבתה" : "הפעלה"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="divide-y divide-border md:hidden">
              {partners.map((p) => (
                <div key={p.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{p.businessName}</p>
                      <p className="truncate text-xs text-muted-foreground" dir="ltr">
                        {p.contactEmail}
                      </p>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {p.loginUsername}
                  </p>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    disabled={togglingId === p.id}
                    aria-pressed={p.status === "active"}
                    className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
                  >
                    {togglingId === p.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Power className="size-3.5" aria-hidden="true" />
                    )}
                    {p.status === "active" ? "השבתה" : "הפעלה"}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {newCreds && <CredentialsDialog creds={newCreds} onClose={() => setNewCreds(null)} />}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "active"
  return (
    <span
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full bg-trust-muted px-2.5 py-1 text-xs font-medium text-trust-foreground"
          : "inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground"
      }
    >
      <span
        className={active ? "size-1.5 rounded-full bg-trust" : "size-1.5 rounded-full bg-muted-foreground"}
        aria-hidden="true"
      />
      {active ? "פעיל" : "מושבת"}
    </span>
  )
}

function CredentialsDialog({
  creds,
  onClose,
}: {
  creds: { businessName: string; username: string; password: string }
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  async function copyAll() {
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(`דוא"ל: ${creds.username}\nסיסמה: ${creds.password}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError("ההעתקה נכשלה. העתיקו ידנית.")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="glass-strong relative z-10 w-full max-w-md rounded-2xl border border-primary/30 p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute left-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="סגירה"
        >
          <X className="size-5" />
        </button>

        <div className="mb-4 flex items-center gap-2 text-primary">
          <ShieldCheck className="size-5" aria-hidden="true" />
          <h3 className="text-base font-semibold">פרטי ההתחברות נוצרו</h3>
        </div>
        <p className="mb-4 text-sm text-muted-foreground text-pretty">
          העבירו את הפרטים ל<span className="font-medium text-foreground">{creds.businessName}</span>. הסיסמה מוצגת
          פעם אחת בלבד ולא ניתן לשחזר אותה.
        </p>

        <div className="flex flex-col gap-2">
          <CredRow label="דוא&quot;ל" value={creds.username} />
          <CredRow label="סיסמה" value={creds.password} icon />
        </div>

        {copyError && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {copyError}
          </p>
        )}

        <Button onClick={copyAll} variant="outline" className="mt-4 w-full">
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied ? "הועתק" : "העתקת הפרטים"}
        </Button>
      </div>
    </div>
  )
}

function CredRow({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon && <KeyRound className="size-3.5" aria-hidden="true" />}
        {label}
      </span>
      <span className="font-mono text-sm text-foreground" dir="ltr">
        {value}
      </span>
    </div>
  )
}
