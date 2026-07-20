"use client"

import { upload } from "@vercel/blob/client"
import type { DocKind } from "@/lib/documents"
import type { DocumentJobView } from "@/lib/document-job-types"

const CONCURRENCY = 4

export type LocalJobProgress = {
  jobId: string
  kind: DocKind
  fileName: string
  percent: number
  status: DocumentJobView["status"] | "starting"
  error?: string
}

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-\u0590-\u05FF]/g, "_")
}

function clientKeyFor(claimId: string, kind: DocKind, file: File): string {
  return `${claimId}:${kind}:${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2, 8)}`
}

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      await worker(items[idx]!)
    }
  })
  await Promise.all(runners)
}

async function uploadOneToJob(
  job: DocumentJobView,
  file: File,
  onTick: (percent: number, status: LocalJobProgress["status"]) => void,
): Promise<void> {
  onTick(0, "uploading")
  const pathname = `documents/${job.partnerId}/${job.claimId}/${job.kind}-${job.id}-${safeFileName(file.name)}`
  console.log("[async-upload] blob.start", { jobId: job.id, pathname, size: file.size })

  const blob = await upload(pathname, file, {
    access: "private",
    handleUploadUrl: "/api/documents/blob",
    clientPayload: JSON.stringify({ jobId: job.id }),
    contentType: file.type || "application/octet-stream",
    multipart: file.size > 4 * 1024 * 1024,
    onUploadProgress: ({ percentage }) => {
      onTick(Math.min(95, Math.round(percentage)), "uploading")
    },
  })

  console.log("[async-upload] blob.ok", { jobId: job.id, pathname: blob.pathname })
  onTick(99, "finalizing")

  const completeRes = await fetch(`/api/documents/jobs/${job.id}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blobPathname: blob.pathname,
      contentType: blob.contentType || file.type,
      fileSize: file.size,
    }),
  })

  if (!completeRes.ok && completeRes.status !== 202) {
    let msg = "השלמת ההעלאה נכשלה"
    try {
      const data = (await completeRes.json()) as { error?: string }
      if (data.error) msg = data.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  onTick(100, "finalizing")
}

/**
 * Direct-to-Blob async intake: create jobs → parallel client uploads → 202 finalize.
 */
export async function runAsyncIntake(opts: {
  claimId: string
  kind: DocKind
  files: File[]
  onLocalProgress: (jobs: LocalJobProgress[]) => void
}): Promise<{ jobs: DocumentJobView[]; errors: string[] }> {
  const { claimId, kind, files, onLocalProgress } = opts
  const errors: string[] = []

  const createRes = await fetch("/api/documents/jobs", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      claimId,
      kind,
      files: files.map((f) => ({
        fileName: f.name,
        fileSize: f.size,
        contentType: f.type,
        clientKey: clientKeyFor(claimId, kind, f),
      })),
    }),
  })

  if (!createRes.ok) {
    let msg = "יצירת משימות העלאה נכשלה"
    try {
      const data = (await createRes.json()) as { error?: string }
      if (data.error) msg = data.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }

  const created = (await createRes.json()) as { jobs: DocumentJobView[] }
  const jobs = created.jobs

  const local: LocalJobProgress[] = jobs.map((j, idx) => ({
    jobId: j.id,
    kind,
    fileName: files[idx]?.name ?? j.fileName,
    percent: 0,
    status: "starting",
  }))
  onLocalProgress([...local])

  const pairs = jobs.map((job, idx) => ({ job, file: files[idx]! })).filter((p) => Boolean(p.file))

  await runPool(pairs, CONCURRENCY, async ({ job, file }) => {
    const entry = local.find((l) => l.jobId === job.id)
    if (!entry) return

    try {
      await uploadOneToJob(job, file, (percent, status) => {
        entry.percent = percent
        entry.status = status
        onLocalProgress([...local])
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("[async-upload] file.fail", job.id, message)
      entry.status = "failed"
      entry.error = message
      errors.push(`${file.name}: ${message}`)
      onLocalProgress([...local])
      void fetch(`/api/documents/jobs/${job.id}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fail", error: message }),
      })
    }
  })

  return { jobs, errors }
}

/** Retry a failed job: re-finalize if blob exists, otherwise re-upload the chosen file. */
export async function retryFailedJob(
  job: DocumentJobView,
  file: File | null,
  onLocalProgress: (p: LocalJobProgress) => void,
): Promise<void> {
  const retryRes = await fetch(`/api/documents/jobs/${job.id}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "retry" }),
  })
  if (!retryRes.ok) throw new Error("ניסיון חוזר נכשל")

  const data = (await retryRes.json()) as { job: DocumentJobView }
  const next = data.job

  if (next.status === "completed") return
  if (next.status === "finalizing") {
    onLocalProgress({
      jobId: next.id,
      kind: next.kind,
      fileName: next.fileName,
      percent: 99,
      status: "finalizing",
    })
    return
  }

  if (!file) throw new Error("יש לבחור מחדש את הקובץ")

  const local: LocalJobProgress = {
    jobId: next.id,
    kind: next.kind,
    fileName: file.name,
    percent: 0,
    status: "starting",
  }
  onLocalProgress(local)

  try {
    await uploadOneToJob(next, file, (percent, status) => {
      local.percent = percent
      local.status = status
      onLocalProgress({ ...local })
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    void fetch(`/api/documents/jobs/${job.id}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "fail", error: message }),
    })
    throw err
  }
}
