"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Check, Loader2, Sparkles, RotateCcw } from "lucide-react"
import {
  IDP_FIELD_CONFIDENCE_THRESHOLD,
  isIdpPilotKind,
  type ClaimDoc,
  type ExtractedDataPayload,
} from "@/lib/documents"
import {
  confirmDocumentExtraction,
  rerunDocumentExtraction,
  type ExtractionFieldEdit,
} from "@/app/actions/documents"
import { cn } from "@/lib/utils"

const statusLabel: Record<string, string> = {
  none: "ללא חילוץ",
  processing: "מחלץ…",
  ready: "מוכן לאימות",
  needs_review: "דורש בדיקה",
  failed: "חילוץ נכשל",
  reviewed: "אומת",
}

function formatFieldValue(value: string | number | null): string {
  if (value === null || value === undefined) return ""
  return String(value)
}

/**
 * Admin-only HITL panel for IDP pilot extractions.
 * Partners never render this component.
 */
export function ExtractionReview({
  doc,
  onUpdated,
}: {
  doc: ClaimDoc
  onUpdated: (docs: ClaimDoc[]) => void
}) {
  if (!isIdpPilotKind(doc.kind) || !doc.hasFile) return null

  const status = doc.extractionStatus ?? "none"
  if (status === "none" && !doc.extractedData) return null

  return <ExtractionReviewInner doc={doc} onUpdated={onUpdated} />
}

function ExtractionReviewInner({
  doc,
  onUpdated,
}: {
  doc: ClaimDoc
  onUpdated: (docs: ClaimDoc[]) => void
}) {
  const status = doc.extractionStatus ?? "none"
  const payload = doc.extractedData
  const [draft, setDraft] = useState<Record<string, string>>(() => fieldsToDraft(payload))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(fieldsToDraft(doc.extractedData))
  }, [doc.id, doc.extractedData, doc.updatedAt])

  const lowConfidence = status === "needs_review"
  const confidencePct =
    doc.extractionConfidence != null
      ? doc.extractionConfidence
      : payload
        ? Math.round(payload.overallConfidence * 100)
        : null

  async function save(reviewed: boolean) {
    setBusy(true)
    setError(null)
    try {
      if (!reviewed) {
        const next = await rerunDocumentExtraction(doc.id)
        onUpdated(next)
        return
      }
      const edits: ExtractionFieldEdit[] = Object.entries(draft).map(([key, raw]) => {
        const trimmed = raw.trim()
        if (!trimmed) return { key, value: null }
        const asNum = Number(trimmed.replace(/,/g, ""))
        const numericKeys = ["totalAmount", "vatAmount", "estimatedDamage", "demandedAmount"]
        if (numericKeys.includes(key) && Number.isFinite(asNum)) {
          return { key, value: asNum }
        }
        return { key, value: trimmed }
      })
      const next = await confirmDocumentExtraction(doc.id, edits)
      onUpdated(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        "mt-3 rounded-lg border p-3",
        lowConfidence || status === "failed"
          ? "border-amber-500/40 bg-amber-500/5"
          : status === "reviewed"
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-border bg-secondary/20",
      )}
      dir="rtl"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Sparkles className="size-3.5 shrink-0 text-gold" aria-hidden="true" />
        <span className="font-medium text-foreground">חילוץ AI</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
            lowConfidence || status === "failed"
              ? "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300"
              : status === "reviewed"
                ? "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30"
                : "bg-secondary text-muted-foreground ring-border",
          )}
        >
          {doc.stpStatus === "auto_verified" || doc.extractionReviewedBy === "system:stp"
            ? "אומת אוטומטית (STP)"
            : (statusLabel[status] ?? status)}
        </span>
        {confidencePct != null && status !== "processing" && (
          <span className="text-muted-foreground">ביטחון {confidencePct}%</span>
        )}
        {lowConfidence && (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-3" aria-hidden="true" />
            דורש אימות ידני
          </span>
        )}
        {(doc.stpStatus === "exception" || doc.stpStatus === "chased") && doc.stpReason && (
          <span className="w-full text-[11px] text-amber-800 dark:text-amber-200/90">{doc.stpReason}</span>
        )}
      </div>

      {status === "processing" && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          מחלץ נתונים מהמסמך…
        </p>
      )}

      {status === "failed" && doc.extractionError && (
        <p className="mt-2 text-xs text-destructive">{doc.extractionError}</p>
      )}

      {payload?.notes && status !== "processing" && (
        <p className="mt-2 text-[11px] text-muted-foreground">{payload.notes}</p>
      )}

      {payload && status !== "processing" && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {payload.fields.map((field) => {
            const weak = field.confidence < IDP_FIELD_CONFIDENCE_THRESHOLD
            return (
              <li key={field.key} className="min-w-0">
                <label className="mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  {field.label}
                  {weak && status !== "reviewed" && (
                    <AlertTriangle className="size-2.5 text-amber-600" aria-hidden="true" />
                  )}
                </label>
                <input
                  type="text"
                  dir="rtl"
                  disabled={busy || status === "reviewed"}
                  value={draft[field.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                  className={cn(
                    "w-full rounded-md border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-70",
                    weak && status !== "reviewed" ? "border-amber-500/50" : "border-border",
                  )}
                />
              </li>
            )
          })}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {status !== "reviewed" && status !== "processing" && payload && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-600/90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-3.5" aria-hidden="true" />
            )}
            אימות חילוץ
          </button>
        )}
        {(status === "failed" || status === "ready" || status === "needs_review" || status === "reviewed") && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="size-3.5" aria-hidden="true" />
            )}
            הרץ חילוץ מחדש
          </button>
        )}
      </div>
    </div>
  )
}

function fieldsToDraft(payload: ExtractedDataPayload | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of payload?.fields ?? []) {
    out[f.key] = formatFieldValue(f.value)
  }
  return out
}
