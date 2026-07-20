"use client"

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import useSWR from "swr"
import {
  FileText,
  Check,
  AlertTriangle,
  Upload,
  Eye,
  RotateCcw,
  Loader2,
  Trash2,
  ImageIcon,
  Download,
  X,
} from "lucide-react"
import {
  REQUIRED_DOCS,
  docStatusLabels,
  MAX_DOC_BYTES,
  ACCEPTED_DOC_TYPES,
  isIdpPilotKind,
  type ClaimDoc,
  type DocKind,
  type DocStatus,
} from "@/lib/documents"
import {
  approveDoc,
  markDocMissing,
  resetDoc,
  removeDocumentFile,
} from "@/app/actions/documents"
import { runAsyncIntake, retryFailedJob, type LocalJobProgress } from "@/components/documents/async-upload"
import { ExtractionReview } from "@/components/documents/extraction-review"
import type { DocumentJobView } from "@/lib/document-job-types"
import { cn } from "@/lib/utils"

type DocumentsPanelProps = {
  claimId: string
  /** "admin" gets approve/reset/missing; both roles can upload (P1). */
  mode: "admin" | "partner"
  /** Invoked after upload / approve / reset / missing so parents can refresh claim progress. */
  onDocumentsChanged?: () => void
  /** Optional controlled selection used by explicit manual communication. */
  selectedDocumentIds?: ReadonlySet<string>
  onDocumentSelectionChange?: (documentId: string, selected: boolean) => void
}

const DEFAULT_UPLOAD_ERROR = "ההעלאה נכשלה, נסה שוב"

const statusStyles: Record<DocStatus, string> = {
  pending: "bg-secondary text-muted-foreground ring-border",
  missing: "bg-destructive/15 text-destructive ring-destructive/30",
  uploaded: "bg-gold/15 text-gold ring-gold/30",
  approved: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
}

const statusIcon: Record<DocStatus, typeof FileText> = {
  pending: FileText,
  missing: AlertTriangle,
  uploaded: Upload,
  approved: Check,
}

function isImageDoc(doc: ClaimDoc): boolean {
  if (doc.contentType?.startsWith("image/")) return true
  const name = doc.fileName?.toLowerCase() ?? ""
  return /\.(jpe?g|png|webp|gif)$/.test(name)
}

function aggregateStatus(files: ClaimDoc[]): DocStatus {
  if (files.length === 0) return "pending"
  if (files.some((d) => d.status === "missing")) return "missing"
  if (files.some((d) => d.hasFile && d.status === "approved")) {
    const withFile = files.filter((d) => d.hasFile)
    if (withFile.length > 0 && withFile.every((d) => d.status === "approved")) return "approved"
  }
  if (files.some((d) => d.hasFile)) return "uploaded"
  return files[0]?.status ?? "pending"
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Catch render crashes so upload failures never blank the whole modal. */
class DocsErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { error: string | null }
> {
  state: { error: string | null } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error ? error.message : "שגיאה לא צפויה בתצוגת המסמכים",
    }
  }

  componentDidCatch(error: unknown) {
    console.error("[upload-ui] DocumentsPanel crashed:", error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm" role="alert">
          <p className="font-medium text-destructive">משהו השתבש בתצוגת המסמכים</p>
          <p className="mt-1 text-xs text-destructive/80">{this.state.error}</p>
          <button
            type="button"
            className="mt-3 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            onClick={() => {
              this.setState({ error: null })
              this.props.onReset?.()
            }}
          >
            נסה שוב
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * Gallery thumb — uses a pre-batched signed URL from the parent (P0).
 * No per-thumb server actions.
 */
function DocThumb({
  doc,
  previewUrl,
  onView,
}: {
  doc: ClaimDoc
  previewUrl?: string
  onView: () => void
}) {
  const [failed, setFailed] = useState(false)
  const showImage = isImageDoc(doc)
  const src = previewUrl && !failed ? previewUrl : null

  return (
    <button
      type="button"
      onClick={onView}
      className="group relative flex aspect-square w-full overflow-hidden rounded-lg border border-border bg-secondary/80"
      title={doc.fileName ?? "צפייה"}
    >
      {src && showImage ? (
        // Signed blob URL — not a static Next.js image asset.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={doc.fileName ?? ""}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
          {showImage ? (
            <ImageIcon className="size-5 opacity-70" aria-hidden="true" />
          ) : (
            <FileText className="size-5 opacity-70" aria-hidden="true" />
          )}
          <span className="line-clamp-2 text-[10px] leading-tight">{doc.fileName}</span>
        </span>
      )}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
        <Eye className="size-4 text-white" aria-hidden="true" />
      </span>
    </button>
  )
}

async function fetchClaimDocuments(claimId: string): Promise<ClaimDoc[]> {
  console.log("[upload-ui] docs.api.start", claimId)
  const res = await fetch(`/api/claims/${encodeURIComponent(claimId)}/documents`, {
    credentials: "same-origin",
  })
  if (!res.ok) {
    console.log("[upload-ui] docs.api.fail", res.status)
    throw new Error(`Failed to load documents (${res.status})`)
  }
  const data = (await res.json()) as { docs: ClaimDoc[] }
  console.log("[upload-ui] docs.api.ok", { claimId, count: data.docs?.length ?? 0 })
  return data.docs ?? []
}

async function signDocUrlsBatch(docIds: string[]): Promise<Record<string, string>> {
  if (docIds.length === 0) return {}
  const urls: Record<string, string> = {}
  const chunkSize = 40
  for (let i = 0; i < docIds.length; i += chunkSize) {
    const chunk = docIds.slice(i, i + chunkSize)
    console.log("[upload-ui] sign-batch.start", { count: chunk.length })
    const res = await fetch("/api/documents/sign-batch", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docIds: chunk }),
    })
    if (!res.ok) {
      console.log("[upload-ui] sign-batch.fail", res.status)
      continue
    }
    const data = (await res.json()) as { urls?: Record<string, string> }
    Object.assign(urls, data.urls ?? {})
  }
  console.log("[upload-ui] sign-batch.ok", { signed: Object.keys(urls).length })
  return urls
}

function DocumentsPanelInner({
  claimId,
  mode,
  onDocumentsChanged,
  selectedDocumentIds,
  onDocumentSelectionChange,
}: DocumentsPanelProps) {
  const canUpload = mode === "admin" || mode === "partner"
  const isAdmin = mode === "admin"

  const { data: docs, isLoading, error: loadError, mutate } = useSWR<ClaimDoc[]>(
    ["claim-docs", claimId],
    () => fetchClaimDocuments(claimId),
    {
      shouldRetryOnError: false,
      refreshInterval: (latest) => {
        if (!isAdmin) return 0
        const processing = (latest ?? []).some((d) => d.extractionStatus === "processing")
        return processing ? 2000 : 0
      },
      onError(err) {
        console.error("[upload-ui] getClaimDocuments failed:", err)
      },
    },
  )

  const {
    data: serverJobs,
    mutate: mutateJobs,
  } = useSWR<DocumentJobView[]>(
    ["claim-jobs", claimId],
    async () => {
      const res = await fetch(`/api/claims/${encodeURIComponent(claimId)}/jobs`, {
        credentials: "same-origin",
      })
      if (!res.ok) return []
      const data = (await res.json()) as { jobs: DocumentJobView[] }
      return data.jobs ?? []
    },
    {
      refreshInterval: (latest) => {
        const active = (latest ?? []).some((j) =>
          j.status === "pending" || j.status === "uploading" || j.status === "finalizing",
        )
        return active ? 1500 : 8000
      },
    },
  )

  const [busyKind, setBusyKind] = useState<DocKind | null>(null)
  const [busyDocId, setBusyDocId] = useState<string | null>(null)
  const [flagging, setFlagging] = useState<DocKind | null>(null)
  const [flagNote, setFlagNote] = useState("")
  const [uploadError, setUploadError] = useState<Partial<Record<DocKind, string>>>({})
  const [localJobs, setLocalJobs] = useState<LocalJobProgress[]>([])
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const retryInputRef = useRef<HTMLInputElement | null>(null)
  const [retryTarget, setRetryTarget] = useState<DocumentJobView | null>(null)

  const byKind = useMemo(() => {
    const map = new Map<DocKind, ClaimDoc[]>()
    for (const d of docs ?? []) {
      const list = map.get(d.kind) ?? []
      list.push(d)
      map.set(d.kind, list)
    }
    return map
  }, [docs])

  const jobsByKind = useMemo(() => {
    const map = new Map<DocKind, DocumentJobView[]>()
    for (const j of serverJobs ?? []) {
      const list = map.get(j.kind) ?? []
      list.push(j)
      map.set(j.kind, list)
    }
    return map
  }, [serverJobs])

  // P0: one batch sign for all files with blobs — no N server-action stampede.
  useEffect(() => {
    const ids = (docs ?? []).filter((d) => d.hasFile).map((d) => d.id)
    if (ids.length === 0) {
      setSignedUrls({})
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const urls = await signDocUrlsBatch(ids)
        if (!cancelled) setSignedUrls(urls)
      } catch (err) {
        console.log("[upload-ui] sign-batch.effect.fail", err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [docs])

  function clearError(kind: DocKind) {
    setUploadError((prev) => {
      if (!prev[kind]) return prev
      const next = { ...prev }
      delete next[kind]
      return next
    })
  }

  function setKindError(kind: DocKind, message: string) {
    setUploadError((prev) => ({ ...prev, [kind]: message }))
  }

  async function safeNotifyParent() {
    try {
      console.log("[upload-ui] parent.refresh.start")
      await onDocumentsChanged?.()
      console.log("[upload-ui] parent.refresh.ok")
    } catch (err) {
      console.log("[upload-ui] parent.refresh.fail", err)
    }
  }

  async function runAdmin(kind: DocKind, fn: () => Promise<ClaimDoc[]>) {
    clearError(kind)
    setBusyKind(kind)
    try {
      const next = await fn()
      await mutate(next, { revalidate: false })
      await safeNotifyParent()
    } catch (err) {
      console.log("[upload-ui] doc action failed:", err instanceof Error ? err.message : String(err))
      setKindError(kind, "הפעולה נכשלה, נסה שוב")
    } finally {
      setBusyKind(null)
    }
  }

  async function viewFile(docId: string) {
    try {
      let url = signedUrls[docId]
      if (!url) {
        const batch = await signDocUrlsBatch([docId])
        url = batch[docId]
        if (url) setSignedUrls((prev) => ({ ...prev, ...batch }))
      }
      if (!url) throw new Error("No signed URL")
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (err) {
      console.log("[upload-ui] sign url failed:", err instanceof Error ? err.message : String(err))
    }
  }

  async function downloadFile(doc: ClaimDoc) {
    try {
      let url = signedUrls[doc.id]
      if (!url) {
        const batch = await signDocUrlsBatch([doc.id])
        url = batch[doc.id]
        if (url) setSignedUrls((prev) => ({ ...prev, ...batch }))
      }
      if (!url) throw new Error("No signed URL")
      const downloadUrl = new URL(url, window.location.origin)
      downloadUrl.searchParams.set("download", "1")
      const link = document.createElement("a")
      link.href = downloadUrl.toString()
      link.download = doc.fileName || "document"
      link.rel = "noopener"
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      console.log("[upload-ui] download failed:", err instanceof Error ? err.message : String(err))
    }
  }

  async function uploadFiles(kind: DocKind, fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((f) => f.size > 0)
    console.log("[upload-ui] async.batch.start", {
      claimId,
      kind,
      count: files.length,
      totalBytes: files.reduce((s, f) => s + f.size, 0),
    })
    if (files.length === 0) return

    for (const file of files) {
      if (file.size > MAX_DOC_BYTES) {
        setKindError(kind, `הקובץ ${file.name} גדול מדי (מקסימום ${formatBytes(MAX_DOC_BYTES)})`)
        return
      }
      if (!ACCEPTED_DOC_TYPES.includes(file.type)) {
        setKindError(kind, `סוג קובץ לא נתמך: ${file.name}`)
        return
      }
    }

    clearError(kind)
    // Kick off background intake — UI stays interactive (P1 "instant" feel).
    setBusyKind(null)
    void (async () => {
      try {
        console.log("[upload-ui] async.batch.bg.start", kind)
        const { errors } = await runAsyncIntake({
          claimId,
          kind,
          files,
          onLocalProgress: setLocalJobs,
        })
        await mutateJobs()
        await mutate()
        await safeNotifyParent()
        if (errors.length > 0) {
          setKindError(
            kind,
            errors.length === 1 ? errors[0]! : `${errors.length} קבצים נכשלו — ניתן לנסות שוב`,
          )
        } else {
          clearError(kind)
        }
      } catch (err) {
        console.error("[upload-ui] async.batch.fatal", err)
        setKindError(kind, err instanceof Error ? err.message : DEFAULT_UPLOAD_ERROR)
      } finally {
        window.setTimeout(() => setLocalJobs((prev) => prev.filter((j) => j.kind !== kind)), 2500)
        console.log("[upload-ui] async.batch.end")
      }
    })()
  }

  async function handleRetryPick(job: DocumentJobView) {
    setRetryTarget(job)
    setBusyKind(job.kind)
    try {
      // Prefer re-finalize when blob already landed.
      if (job.blobPathname) {
        await retryFailedJob(job, null, (p) => {
          setLocalJobs((prev) => {
            const rest = prev.filter((x) => x.jobId !== p.jobId)
            return [...rest, p]
          })
        })
        await mutateJobs()
        await mutate()
        await safeNotifyParent()
        clearError(job.kind)
        return
      }
    } catch (err) {
      console.log("[upload-ui] retry.finalize.fail", err)
    } finally {
      setBusyKind(null)
    }
    // Need a fresh file pick for re-upload.
    retryInputRef.current?.click()
  }

  async function onRetryFileChosen(fileList: FileList | null) {
    const job = retryTarget
    setRetryTarget(null)
    const file = fileList?.[0]
    if (!job || !file) return
    try {
      setBusyKind(job.kind)
      clearError(job.kind)
      await retryFailedJob(job, file, (p) => {
        setLocalJobs((prev) => {
          const rest = prev.filter((x) => x.jobId !== p.jobId)
          return [...rest, p]
        })
      })
      await mutateJobs()
      await mutate()
      await safeNotifyParent()
    } catch (err) {
      setKindError(job.kind, err instanceof Error ? err.message : DEFAULT_UPLOAD_ERROR)
    } finally {
      setBusyKind(null)
    }
  }

  async function removeFile(docId: string, kind: DocKind) {
    clearError(kind)
    setBusyDocId(docId)
    setBusyKind(kind)
    try {
      console.log("[upload-ui] remove.start", docId)
      const next = await removeDocumentFile(docId)
      await mutate(next, { revalidate: false })
      await safeNotifyParent()
      console.log("[upload-ui] remove.ok", docId)
    } catch (err) {
      console.log("[upload-ui] remove.fail", err instanceof Error ? err.message : String(err))
      setKindError(kind, "מחיקת הקובץ נכשלה, נסה שוב")
    } finally {
      setBusyDocId(null)
      setBusyKind(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        טוען מסמכים…
      </div>
    )
  }

  if (loadError && !docs) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm" role="alert">
        <p className="font-medium text-destructive">טעינת המסמכים נכשלה</p>
        <button
          type="button"
          className="mt-3 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-muted"
          onClick={() => void mutate()}
        >
          נסה שוב
        </button>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      <input
        ref={retryInputRef}
        type="file"
        className="sr-only"
        accept={ACCEPTED_DOC_TYPES.join(",")}
        onChange={(e) => {
          void onRetryFileChosen(e.target.files)
          e.target.value = ""
        }}
      />
      {REQUIRED_DOCS.map((req) => {
        const rows = byKind.get(req.kind) ?? []
        const files = rows.filter((d) => d.hasFile)
        const status = aggregateStatus(rows)
        const note = rows.find((d) => d.note)?.note ?? ""
        const Icon = statusIcon[status]
        const busy = busyKind === req.kind
        const multi = req.allowsMultiple
        const errMsg = uploadError[req.kind]
        const kindJobs = [
          ...(jobsByKind.get(req.kind) ?? []),
        ]
        const localForKind = localJobs.filter((j) => j.kind === req.kind)
        const showJobs = kindJobs.length > 0 || localForKind.length > 0

        return (
          <li
            key={req.kind}
            className={cn(
              "rounded-xl border border-border bg-card/60 p-3",
              status === "missing" && "border-destructive/40",
              errMsg && "border-destructive/50",
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1",
                  statusStyles[status],
                )}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Icon className="size-4" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{req.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {localForKind.length > 0
                    ? `מעלה ברקע ${localForKind.filter((j) => j.status !== "failed").length}/${localForKind.length}`
                    : files.length > 1
                      ? `${files.length} קבצים`
                      : files[0]?.fileName
                        ? files[0].fileName
                        : req.hint}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                  statusStyles[status],
                )}
              >
                {docStatusLabels[status]}
              </span>
            </div>

            {showJobs && (
              <ul className="mt-2 flex flex-col gap-1.5" aria-live="polite">
                {kindJobs.map((job) => {
                  const local = localForKind.find((l) => l.jobId === job.id)
                  const percent = local?.percent ?? job.percent
                  const st = local?.status === "failed" ? "failed" : job.status
                  return (
                    <li
                      key={job.id}
                      className="rounded-lg border border-border/70 bg-secondary/30 px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="min-w-0 flex-1 truncate text-foreground">{job.fileName}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {st === "failed"
                            ? "נכשל"
                            : st === "completed"
                              ? "הושלם"
                              : st === "finalizing"
                                ? "מעבד…"
                                : `${percent}%`}
                        </span>
                        {st === "failed" && (
                          <button
                            type="button"
                            className="shrink-0 rounded-md bg-destructive/15 px-2 py-0.5 font-medium text-destructive hover:bg-destructive/25"
                            onClick={() => void handleRetryPick(job)}
                          >
                            נסה שוב
                          </button>
                        )}
                      </div>
                      {st !== "completed" && st !== "failed" && (
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-gold transition-all duration-300"
                            style={{ width: `${Math.max(4, percent)}%` }}
                          />
                        </div>
                      )}
                      {st === "failed" && (job.lastError || local?.error) && (
                        <p className="mt-1 text-[10px] text-destructive">{job.lastError || local?.error}</p>
                      )}
                    </li>
                  )
                })}
                {localForKind
                  .filter((l) => !kindJobs.some((j) => j.id === l.jobId))
                  .map((job) => (
                    <li
                      key={job.jobId}
                      className="rounded-lg border border-border/70 bg-secondary/30 px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="min-w-0 flex-1 truncate">{job.fileName}</span>
                        <span className="text-muted-foreground">{job.percent}%</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-gold transition-all"
                          style={{ width: `${Math.max(4, job.percent)}%` }}
                        />
                      </div>
                    </li>
                  ))}
              </ul>
            )}

            {errMsg && (
              <div
                className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <p className="min-w-0 flex-1">{errMsg}</p>
                <button
                  type="button"
                  onClick={() => clearError(req.kind)}
                  className="shrink-0 rounded p-0.5 hover:bg-destructive/20"
                  aria-label="סגירת שגיאה"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}

            {status === "missing" && note && (
              <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{note}</p>
            )}

            {files.length > 0 && (
              <div className="mt-3">
                {multi || files.every(isImageDoc) ? (
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {files.map((file) => (
                      <li key={file.id} className="relative">
                        <DocThumb
                          doc={file}
                          previewUrl={signedUrls[file.id]}
                          onView={() => viewFile(file.id)}
                        />
                        <button
                          type="button"
                          onClick={() => void downloadFile(file)}
                          className="absolute end-1 top-1 rounded-md bg-background/90 p-1 text-foreground shadow-sm ring-1 ring-border hover:bg-muted"
                          title="הורדת קובץ"
                          aria-label={`הורדת ${file.fileName ?? "המסמך"}`}
                        >
                          <Download className="size-3" aria-hidden="true" />
                        </button>
                        {onDocumentSelectionChange && (
                          <label
                            className="absolute bottom-1 start-1 flex cursor-pointer items-center gap-1 rounded-md bg-background/90 px-1.5 py-1 text-[10px] font-medium text-foreground shadow-sm ring-1 ring-border"
                            title="בחירה לצירוף למייל"
                          >
                            <input
                              type="checkbox"
                              checked={selectedDocumentIds?.has(file.id) ?? false}
                              onChange={(event) =>
                                onDocumentSelectionChange(file.id, event.target.checked)
                              }
                              className="size-3.5 accent-gold"
                              aria-label={`בחירת ${file.fileName ?? "המסמך"} לצירוף למייל`}
                            />
                            למייל
                          </label>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            disabled={busyDocId === file.id || busy}
                            onClick={() => removeFile(file.id, req.kind)}
                            className="absolute start-1 top-1 rounded-md bg-background/90 p-1 text-destructive shadow-sm ring-1 ring-border hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                            title="הסרת קובץ"
                          >
                            {busyDocId === file.id ? (
                              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                            ) : (
                              <Trash2 className="size-3" aria-hidden="true" />
                            )}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {files.map((file) => (
                      <li
                        key={file.id}
                        className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5"
                      >
                        {onDocumentSelectionChange && (
                          <input
                            type="checkbox"
                            checked={selectedDocumentIds?.has(file.id) ?? false}
                            onChange={(event) =>
                              onDocumentSelectionChange(file.id, event.target.checked)
                            }
                            className="size-4 shrink-0 accent-gold"
                            aria-label={`בחירת ${file.fileName ?? "המסמך"} לצירוף למייל`}
                          />
                        )}
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                          {file.fileName ?? "קובץ"}
                        </span>
                        <button
                          type="button"
                          onClick={() => viewFile(file.id)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
                        >
                          <Eye className="size-3" aria-hidden="true" />
                          צפייה
                        </button>
                        <button
                          type="button"
                          onClick={() => void downloadFile(file)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
                        >
                          <Download className="size-3" aria-hidden="true" />
                          הורדה
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            disabled={busyDocId === file.id || busy}
                            onClick={() => removeFile(file.id, req.kind)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          >
                            {busyDocId === file.id ? (
                              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                            ) : (
                              <Trash2 className="size-3" aria-hidden="true" />
                            )}
                            הסרה
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {isAdmin &&
                  isIdpPilotKind(req.kind) &&
                  files.map((file) => (
                    <ExtractionReview
                      key={`idp-${file.id}`}
                      doc={file}
                      onUpdated={(next) => {
                        void mutate(next, { revalidate: false })
                        onDocumentsChanged?.()
                      }}
                    />
                  ))}
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {canUpload && (
                <label
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
                    busy && "pointer-events-none opacity-60",
                    status === "missing"
                      ? "bg-gold text-gold-foreground hover:bg-gold/90"
                      : "border border-border bg-secondary text-foreground hover:bg-muted",
                  )}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="size-3.5" aria-hidden="true" />
                  )}
                  {busy
                    ? "מעלה ברקע…"
                    : errMsg
                      ? "נסה שוב"
                      : multi
                        ? files.length > 0
                          ? "הוספת קבצים"
                          : "העלאת קבצים"
                        : files.length > 0
                          ? "החלפת קובץ"
                          : "העלאת קובץ"}
                  <input
                    type="file"
                    className="sr-only"
                    accept={ACCEPTED_DOC_TYPES.join(",")}
                    multiple={multi}
                    disabled={busy}
                    onChange={(e) => {
                      try {
                        if (e.target.files?.length) {
                          void uploadFiles(req.kind, e.target.files)
                        }
                      } catch (err) {
                        console.error("[upload-ui] file.input.fatal", err)
                        setKindError(req.kind, DEFAULT_UPLOAD_ERROR)
                      } finally {
                        e.target.value = ""
                      }
                    }}
                  />
                </label>
              )}

              {isAdmin && errMsg && !busy && (
                <button
                  type="button"
                  onClick={() => clearError(req.kind)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  איפוס שגיאה
                </button>
              )}

              {isAdmin && (
                <>
                  {status !== "approved" && files.length > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runAdmin(req.kind, () => approveDoc(claimId, req.kind))}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-600/90 disabled:opacity-50"
                    >
                      <Check className="size-3.5" aria-hidden="true" />
                      אישור
                    </button>
                  )}
                  {status !== "missing" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setFlagging(req.kind)
                        setFlagNote(note)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
                    >
                      <AlertTriangle className="size-3.5" aria-hidden="true" />
                      סימון כחסר
                    </button>
                  )}
                  {(files.length > 0 || status !== "pending") && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runAdmin(req.kind, () => resetDoc(claimId, req.kind))}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                      איפוס
                    </button>
                  )}
                </>
              )}

              {mode === "partner" && files.length === 1 && !multi && (
                <button
                  type="button"
                  onClick={() => viewFile(files[0]!.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <Eye className="size-3.5" aria-hidden="true" />
                  צפייה במסמך
                </button>
              )}
            </div>

            {isAdmin && flagging === req.kind && (
              <div className="mt-2 flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                <textarea
                  value={flagNote}
                  onChange={(e) => setFlagNote(e.target.value)}
                  rows={2}
                  dir="rtl"
                  placeholder="הסבר לשותף מה חסר או לא תקין…"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      runAdmin(req.kind, () => markDocMissing(claimId, req.kind, flagNote.trim())).then(() =>
                        setFlagging(null),
                      )
                    }
                    className="rounded-lg bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
                  >
                    שליחת דרישה לשותף
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlagging(null)}
                    className="rounded-lg border border-border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function DocumentsPanel(props: DocumentsPanelProps) {
  return (
    <DocsErrorBoundary>
      <DocumentsPanelInner {...props} />
    </DocsErrorBoundary>
  )
}
