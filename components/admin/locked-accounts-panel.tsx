"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { LockKeyhole, Loader2, Unlock } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  listLockedUserAccounts,
  unlockUserAccountAction,
  type LockedAccountRow,
} from "@/app/actions/account-lockout"

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function LockedAccountsPanel({ initialAccounts }: { initialAccounts: LockedAccountRow[] }) {
  const router = useRouter()
  const [accounts, setAccounts] = useState(initialAccounts)
  const [error, setError] = useState<string | null>(null)
  const [unlockingId, setUnlockingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    setAccounts(initialAccounts)
  }, [initialAccounts])

  function unlock(userId: string) {
    if (unlockingId) return
    setError(null)
    setUnlockingId(userId)

    startTransition(async () => {
      try {
        const result = await unlockUserAccountAction(userId)
        if (!result.ok) {
          setError(result.error)
          return
        }
        setAccounts((prev) => prev.filter((row) => row.id !== userId))
        // Refresh server list in case of concurrent locks.
        const next = await listLockedUserAccounts()
        setAccounts(next)
        router.refresh()
      } catch {
        setError("שחרור החשבון נכשל. נסו שוב.")
      } finally {
        setUnlockingId(null)
      }
    })
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <div className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LockKeyhole className="size-4" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">חשבונות נעולים</h2>
          <p className="text-sm text-muted-foreground">
            נעילה אוטומטית לאחר 10 ניסיונות סיסמה כושלים. שחרור מאפס את מונה הניסיונות.
          </p>
        </div>
      </div>

      {error ? (
        <p className="border-b border-border px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {accounts.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          אין חשבונות נעולים כרגע.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {accounts.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                <p className="truncate text-sm text-muted-foreground" dir="ltr">
                  {row.email}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  ננעל ב־{formatDateTime(row.lockedAt)} · {row.failedLoginAttempts} ניסיונות ·{" "}
                  {row.role}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={unlockingId === row.id}
                onClick={() => unlock(row.id)}
                className="shrink-0"
              >
                {unlockingId === row.id ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Unlock className="size-4" aria-hidden="true" />
                )}
                שחרור חשבון
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
