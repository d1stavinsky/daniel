"use client"

import { useState } from "react"
import useSWR from "swr"
import { UserPlus, Users, Trash2, Copy, Check, Loader2, ShieldCheck } from "lucide-react"
import {
  listTeamMembers,
  createTeamMember,
  removeTeamMember,
  type TeamMember,
} from "@/app/actions/team"
import { cn } from "@/lib/utils"

export function TeamPanel() {
  const { data: members, isLoading, mutate } = useSWR<TeamMember[]>(["team"], () => listTeamMembers())
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const fd = new FormData(e.currentTarget)
      const res = await createTeamMember(fd)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setIssued(res.credentials)
      setAdding(false)
      await mutate()
    } catch {
      setError("אירעה שגיאה. נסו שוב.")
    } finally {
      setBusy(false)
    }
  }

  async function onRemove(id: string) {
    setBusy(true)
    try {
      await removeTeamMember(id)
      await mutate()
    } catch (err) {
      console.log("[v0] remove member failed:", err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function copyCreds() {
    if (!issued) return
    await navigator.clipboard.writeText(`שם משתמש: ${issued.username}\nסיסמה זמנית: ${issued.password}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4 md:p-5">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-gold" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-foreground">צוות המוסך</h2>
            <p className="text-sm text-muted-foreground">ניהול משתמשים בחשבון שלכם</p>
          </div>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true)
              setIssued(null)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <UserPlus className="size-3.5" aria-hidden="true" />
            הוספת משתמש
          </button>
        )}
      </div>

      {/* Freshly-issued credentials (shown once). */}
      {issued && (
        <div className="m-4 rounded-xl border border-gold/40 bg-gold/10 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheck className="size-4 text-gold" aria-hidden="true" />
            המשתמש נוצר. יש למסור את הפרטים הבאים למשתמש:
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" dir="ltr">
            <dt className="text-muted-foreground">Username</dt>
            <dd className="font-mono text-foreground">{issued.username}</dd>
            <dt className="text-muted-foreground">Password</dt>
            <dd className="font-mono text-foreground">{issued.password}</dd>
          </dl>
          <button
            type="button"
            onClick={copyCreds}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
          >
            {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
            {copied ? "הועתק" : "העתקת פרטים"}
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            הסיסמה מוצגת פעם אחת בלבד. המשתמש יתבקש להחליף אותה בכניסה הראשונה.
          </p>
        </div>
      )}

      {/* Add form */}
      {adding && (
        <form onSubmit={onSubmit} className="m-4 flex flex-col gap-3 rounded-xl border border-border bg-secondary/40 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="member-name" className="text-xs font-medium text-foreground">
                שם מלא
              </label>
              <input
                id="member-name"
                name="name"
                required
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="member-email" className="text-xs font-medium text-foreground">
                דוא&quot;ל
              </label>
              <input
                id="member-email"
                name="email"
                type="email"
                required
                dir="ltr"
                className="h-9 rounded-lg border border-border bg-background px-3 text-left text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              יצירת משתמש
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setError(null)
              }}
              className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              ביטול
            </button>
          </div>
        </form>
      )}

      {/* Member list */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          טוען…
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {(members ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 p-4 md:px-5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                  {m.name}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                      m.partnerRole === "owner"
                        ? "bg-gold/15 text-gold ring-gold/30"
                        : "bg-secondary text-muted-foreground ring-border",
                    )}
                  >
                    {m.partnerRole === "owner" ? "בעלים" : "משתמש"}
                  </span>
                  {m.mustResetPassword && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border">
                      ממתין לכניסה ראשונה
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">
                  {m.email}
                </p>
              </div>
              {m.partnerRole !== "owner" && !m.isSelf && (
                <button
                  type="button"
                  onClick={() => onRemove(m.id)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
                  aria-label={`הסרת ${m.name}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  הסרה
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
