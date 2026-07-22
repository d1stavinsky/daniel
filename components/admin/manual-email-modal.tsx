"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Loader2, Mail, Paperclip, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { sendManualClaimEmail } from "@/app/actions/manual-communication"
import { docKindLabels, type ClaimDoc } from "@/lib/documents"

type ManualEmailModalProps = {
  claimId: string
  open: boolean
  onClose: () => void
  initialSelectedDocumentIds: readonly string[]
}

async function fetchDocuments(claimId: string): Promise<ClaimDoc[]> {
  const response = await fetch(`/api/claims/${encodeURIComponent(claimId)}/documents`, {
    credentials: "same-origin",
  })
  if (!response.ok) throw new Error("טעינת המסמכים נכשלה.")
  const data = (await response.json()) as { docs?: ClaimDoc[] }
  return data.docs ?? []
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ManualEmailModal({
  claimId,
  open,
  onClose,
  initialSelectedDocumentIds,
}: ManualEmailModalProps) {
  const { data: docs, isLoading, error } = useSWR<ClaimDoc[]>(
    open ? ["manual-email-docs", claimId] : null,
    () => fetchDocuments(claimId),
    { shouldRetryOnError: false },
  )
  const [recipient, setRecipient] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!open) return
    setRecipient("")
    setSubject("")
    setBody("")
    setSelected(new Set(initialSelectedDocumentIds))
    setSendError(null)
    setSent(false)
  }, [open, claimId, initialSelectedDocumentIds])

  const files = useMemo(() => (docs ?? []).filter((doc) => doc.hasFile), [docs])
  const selectedBytes = useMemo(
    () =>
      files
        .filter((doc) => selected.has(doc.id))
        .reduce((sum, doc) => sum + (doc.fileSize ?? 0), 0),
    [files, selected],
  )

  if (!open) return null

  function toggleDocument(id: string) {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    if (sending) return
    setSending(true)
    setSendError(null)
    try {
      const result = await sendManualClaimEmail({
        claimId,
        recipient,
        subject,
        body,
        documentIds: Array.from(selected),
      })
      if (!result.ok) {
        setSendError(result.error)
        return
      }
      setSent(true)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "שליחת הדוא״ל נכשלה.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        aria-label="סגירה"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-email-title"
        dir="rtl"
        className="glass-strong relative z-10 flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-border shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 id="manual-email-title" className="flex items-center gap-2 text-base font-semibold">
              <Mail className="size-4 text-primary" aria-hidden="true" />
              שליחת דוא״ל ידני
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">תיק {claimId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="סגירה"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {sent ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="font-medium text-emerald-700">הדוא״ל נשלח בהצלחה</p>
              <p className="mt-1 text-xs text-muted-foreground">
                השליחה נרשמה ביומן הפעילות של התיק.
              </p>
              <Button type="button" className="mt-4" onClick={onClose}>
                סגירה
              </Button>
            </div>
          ) : (
            <>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">דוא״ל הנמען</span>
                <input
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="name@example.com"
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">נושא</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={180}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">תוכן ההודעה</span>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={7}
                  maxLength={20_000}
                  className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </label>

              <fieldset className="rounded-xl border border-border bg-card/50 p-3">
                <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold">
                  <Paperclip className="size-3.5" aria-hidden="true" />
                  צירוף מסמכים
                </legend>
                <p className="mt-1 text-xs text-muted-foreground">
                  אופציונלי · עד 10 קבצים ובסך הכול עד 25MB
                </p>

                {isLoading ? (
                  <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    טוען קבצים…
                  </div>
                ) : error ? (
                  <p className="py-3 text-xs text-destructive">טעינת המסמכים נכשלה.</p>
                ) : files.length === 0 ? (
                  <p className="py-3 text-xs text-muted-foreground">אין קבצים זמינים בתיק.</p>
                ) : (
                  <ul className="mt-3 max-h-52 space-y-1.5 overflow-y-auto">
                    {files.map((doc) => (
                      <li key={doc.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 px-2.5 py-2 hover:bg-muted/50">
                          <input
                            type="checkbox"
                            checked={selected.has(doc.id)}
                            onChange={() => toggleDocument(doc.id)}
                            disabled={!selected.has(doc.id) && selected.size >= 10}
                            className="size-4 accent-primary"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">
                              {doc.fileName || docKindLabels[doc.kind]}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {docKindLabels[doc.kind]}
                              {doc.fileSize ? ` · ${formatBytes(doc.fileSize)}` : ""}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}

                {selected.size > 0 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    נבחרו {selected.size} קבצים · {formatBytes(selectedBytes)}
                  </p>
                )}
              </fieldset>

              {sendError && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {sendError}
                </p>
              )}
            </>
          )}
        </div>

        {!sent && (
          <div className="flex items-center justify-end gap-2 border-t border-border p-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={sending}>
              ביטול
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={
                sending ||
                !recipient.trim() ||
                !subject.trim() ||
                !body.trim() ||
                selectedBytes > 25 * 1024 * 1024
              }
            >
              {sending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  שולח…
                </>
              ) : (
                <>
                  <Mail className="size-4" />
                  שליחה
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
