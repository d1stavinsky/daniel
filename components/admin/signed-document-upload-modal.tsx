"use client"

import { useEffect, useRef, useState } from "react"
import { FileUp, Loader2, Lock, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { runAsyncIntake, type LocalJobProgress } from "@/components/documents/async-upload"
import { docKindLabels } from "@/lib/documents"
import { DEMAND_LETTER_KIND } from "@/lib/demand-letter-shared"
import { cn } from "@/lib/utils"

type SignedDocumentUploadModalProps = {
  open: boolean
  claimId: string
  clientName: string
  onClose: () => void
  onComplete: () => void
}

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp"

export function SignedDocumentUploadModal({
  open,
  claimId,
  clientName,
  onClose,
  onComplete,
}: SignedDocumentUploadModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<LocalJobProgress[]>([])

  useEffect(() => {
    if (open) {
      setFile(null)
      setError(null)
      setUploading(false)
      setProgress([])
    }
  }, [open])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !uploading) onClose()
    }
    if (open) document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose, uploading])

  if (!open) return null

  async function submit() {
    if (!file) {
      setError("יש לבחור קובץ חתום להעלאה.")
      return
    }
    setUploading(true)
    setError(null)
    try {
      const { errors } = await runAsyncIntake({
        claimId,
        kind: DEMAND_LETTER_KIND,
        files: [file],
        onLocalProgress: setProgress,
      })
      if (errors.length > 0) {
        setError(errors.join(" · "))
        return
      }
      onComplete()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "ההעלאה נכשלה")
    } finally {
      setUploading(false)
    }
  }

  const active = progress[0]
  const pct = active?.percent ?? 0

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signed-upload-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        aria-label="סגירה"
        onClick={() => !uploading && onClose()}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Lock className="size-4" aria-hidden="true" />
              <span className="text-xs font-medium">העלאה מאובטחת</span>
            </div>
            <h2 id="signed-upload-title" className="mt-1 text-base font-semibold text-foreground">
              סומן כחתום והעלה
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {docKindLabels.demand_letter} · תיק {claimId} · {clientName}
            </p>
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
            aria-label="סגור"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-sm text-muted-foreground">
            העלה את סריקת מכתב הדרישה החתום על ידי עו״ד. הקובץ יעבור אימות לפני המשך התיק.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setError(null)
            }}
          />

          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5",
              file && "border-primary/40 bg-primary/5",
            )}
          >
            <FileUp className="size-8 text-muted-foreground" aria-hidden="true" />
            {file ? (
              <>
                <span className="text-sm font-medium text-foreground">{file.name}</span>
                <span className="text-xs text-muted-foreground">לחץ להחלפת קובץ</span>
              </>
            ) : (
              <>
                <span className="text-sm font-medium text-foreground">בחר קובץ PDF או תמונה</span>
                <span className="text-xs text-muted-foreground">מקסימום 10MB</span>
              </>
            )}
          </button>

          {uploading && active && (
            <div className="space-y-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">מעלה… {pct}%</p>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button type="button" variant="outline" disabled={uploading} onClick={onClose}>
            ביטול
          </Button>
          <Button type="button" disabled={uploading || !file} onClick={() => void submit()}>
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                מעלה…
              </>
            ) : (
              "העלה מסמך חתום"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
