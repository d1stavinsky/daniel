"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Check, Loader2, RefreshCw, Inbox } from "lucide-react"
import {
  approveExceptionDocument,
  clearStpException,
  getStpExceptionQueue,
  runStpChaseScan,
} from "@/app/actions/stp"
import type { ExceptionQueueItem } from "@/lib/stp/engine"
import { cn } from "@/lib/utils"

type ExceptionQueueProps = {
  onOpenClaim: (claimId: string) => void
}

const stpStatusLabel: Record<string, string> = {
  exception: "חריג",
  chased: "נשלחה דרישה",
  none: "—",
  auto_verified: "אומת אוטומטית",
}

/**
 * Admin manage-by-exception surface: only items STP did not auto-verify.
 */
export function ExceptionQueue({ onOpenClaim }: ExceptionQueueProps) {
  const [items, setItems] = useState<ExceptionQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [chasing, setChasing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await getStpExceptionQueue())
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינת תור החריגים נכשלה")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function chase() {
    setChasing(true)
    setMsg(null)
    try {
      const r = await runStpChaseScan()
      setMsg(
        r.chased > 0
          ? `נשלחו ${r.chased} דרישות לשותפים${r.emailed > 0 ? ` (${r.emailed} במייל)` : ""}.`
          : "אין מסמכים חסרים חדשים לדרישה.",
      )
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "סריקת דרישות נכשלה")
    } finally {
      setChasing(false)
      setTimeout(() => setMsg(null), 6000)
    }
  }

  async function approve(docId: string) {
    setBusyId(docId)
    try {
      await approveExceptionDocument(docId)
      setItems((prev) => prev.filter((i) => i.documentId !== docId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "אישור נכשל")
    } finally {
      setBusyId(null)
    }
  }

  async function dismiss(docId: string) {
    setBusyId(docId)
    try {
      await clearStpException(docId)
      setItems((prev) => prev.filter((i) => i.documentId !== docId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "סגירה נכשלה")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">תיקים בטיפול ידני (STP)</h2>
          <p className="text-sm text-muted-foreground">
            רק פריטים שלא אומתו אוטומטית (ביטחון ≤95% או אי-התאמת נתונים)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void chase()}
            disabled={chasing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {chasing ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden="true" />
            )}
            הרץ דרישות חסרים
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden="true" />
            רענון
          </button>
        </div>
      </div>

      {msg && (
        <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-foreground">{msg}</p>
      )}
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          טוען תיקים בטיפול ידני…
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-muted-foreground">
          <Inbox className="size-8 opacity-50" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">אין תיקים בטיפול ידני</p>
          <p className="text-xs">אין חריגים — עובדים במצב STP מלא</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const busy = busyId === item.documentId
            return (
              <li
                key={item.documentId}
                className="rounded-xl border border-border bg-card p-3 sm:p-4"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-amber-500/15 p-2 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenClaim(item.claimId)}
                        className="text-sm font-semibold text-foreground hover:underline"
                      >
                        {item.claimId}
                      </button>
                      <span className="text-xs text-muted-foreground">
                        {item.clientName} · {item.plate}
                      </span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
                        {stpStatusLabel[item.stpStatus] ?? item.stpStatus}
                      </span>
                      {item.extractionConfidence != null && (
                        <span className="text-[10px] text-muted-foreground">
                          ביטחון {item.extractionConfidence}%
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-foreground">
                      {item.kindLabel}
                      {item.fileName ? ` · ${item.fileName}` : ""}
                    </p>
                    {item.stpReason && (
                      <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/90">{item.stpReason}</p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      שותף: {item.partnerName} · חילוץ: {item.extractionStatus}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onOpenClaim(item.claimId)}
                      className="rounded-lg border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      פתיחה
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void approve(item.documentId)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-600/90 disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="size-3" aria-hidden="true" />
                      )}
                      אישור
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void dismiss(item.documentId)}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      הסרה מהתור
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
