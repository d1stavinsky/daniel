import { randomUUID } from "crypto"
import { and, asc, eq, inArray } from "drizzle-orm"
import { del } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { claimDocument, documentJob } from "@/lib/db/schema"
import { docAllowsMultiple, type DocKind } from "@/lib/documents"
import { recordClaimEvent } from "@/lib/claim-events"
import { syncClaimProgressFromDocuments } from "@/lib/sync-claim-progress"
import { assertPreviousWorkflowStagesValidated } from "@/lib/document-workflow-gates"
import { assertDemandStageClear, DEMAND_LETTER_KIND, SIGNATURE_VERIFIED } from "@/lib/demand-letter"
import {
  DemandLetterVersionMismatchError,
  gateDemandLetterSignedUpload,
} from "@/lib/demand-letter-upload"
import type { DocumentJobStatus, DocumentJobView } from "@/lib/document-job-types"

export type { DocumentJobStatus, DocumentJobView } from "@/lib/document-job-types"

type JobRow = typeof documentJob.$inferSelect

export function mapDocumentJob(row: JobRow): DocumentJobView {
  const status = row.status as DocumentJobStatus
  return {
    id: row.id,
    claimId: row.claimId,
    partnerId: row.partnerId,
    kind: row.kind as DocKind,
    documentId: row.documentId,
    status,
    percent: row.percent,
    fileName: row.fileName,
    fileSize: row.fileSize,
    contentType: row.contentType,
    blobPathname: row.blobPathname,
    lastError: row.lastError,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    canRetry: status === "failed",
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }
}

const ACTIVE_STATUSES: DocumentJobStatus[] = ["pending", "uploading", "finalizing", "failed"]

export async function listClaimDocumentJobs(
  claimId: string,
  partnerId: string,
  opts?: { activeOnly?: boolean },
): Promise<DocumentJobView[]> {
  const filters = [eq(documentJob.claimId, claimId), eq(documentJob.partnerId, partnerId)]
  if (opts?.activeOnly !== false) {
    filters.push(inArray(documentJob.status, ACTIVE_STATUSES))
  }
  const rows = await db
    .select()
    .from(documentJob)
    .where(and(...filters))
    .orderBy(asc(documentJob.createdAt))
  return rows.map(mapDocumentJob)
}

export async function createDocumentJobs(input: {
  claimId: string
  partnerId: string
  kind: DocKind
  createdBy: string
  files: {
    fileName: string
    fileSize: number
    contentType: string
    clientKey: string
    contentHash?: string
  }[]
}): Promise<DocumentJobView[]> {
  await assertDemandStageClear(input.claimId, input.kind)
  await assertPreviousWorkflowStagesValidated(input.claimId, input.kind)

  const now = new Date()
  const out: DocumentJobView[] = []

  for (const file of input.files) {
    // Idempotent: reuse existing non-completed job with same clientKey.
    const [existing] = await db
      .select()
      .from(documentJob)
      .where(eq(documentJob.clientKey, file.clientKey))
      .limit(1)

    if (existing) {
      if (existing.status === "completed") {
        out.push(mapDocumentJob(existing))
        continue
      }
      const [updated] = await db
        .update(documentJob)
        .set({
          status: "pending",
          percent: 0,
          lastError: null,
          fileName: file.fileName,
          fileSize: file.fileSize,
          contentType: file.contentType,
          contentHash: file.contentHash ?? existing.contentHash,
          blobPathname: null,
          updatedAt: now,
        })
        .where(eq(documentJob.id, existing.id))
        .returning()
      out.push(mapDocumentJob(updated!))
      continue
    }

    const id = randomUUID()
    const [row] = await db
      .insert(documentJob)
      .values({
        id,
        claimId: input.claimId,
        partnerId: input.partnerId,
        kind: input.kind,
        status: "pending",
        percent: 0,
        fileName: file.fileName,
        fileSize: file.fileSize,
        contentType: file.contentType,
        contentHash: file.contentHash ?? null,
        clientKey: file.clientKey,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    out.push(mapDocumentJob(row!))
  }

  return out
}

export async function markJobUploading(jobId: string): Promise<void> {
  await db
    .update(documentJob)
    .set({ status: "uploading", percent: Math.max(1, 5), lastError: null, updatedAt: new Date() })
    .where(eq(documentJob.id, jobId))
}

export async function updateJobProgress(jobId: string, percent: number): Promise<void> {
  const p = Math.max(0, Math.min(99, Math.round(percent)))
  await db
    .update(documentJob)
    .set({ percent: p, status: "uploading", updatedAt: new Date() })
    .where(and(eq(documentJob.id, jobId), inArray(documentJob.status, ["pending", "uploading"])))
}

/**
 * Attach a completed Blob pathname and run DB finalize (with auto-retry).
 */
export async function completeDocumentJob(input: {
  jobId: string
  blobPathname: string
  contentType?: string | null
  fileSize?: number | null
}): Promise<DocumentJobView> {
  const now = new Date()
  const [row] = await db
    .update(documentJob)
    .set({
      status: "finalizing",
      percent: 99,
      blobPathname: input.blobPathname,
      contentType: input.contentType ?? undefined,
      fileSize: input.fileSize ?? undefined,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(documentJob.id, input.jobId))
    .returning()

  if (!row) throw new Error("Job not found")

  return processFinalizeJob(row.id)
}

function resolveAttachTargetId(
  existing: { id: string; blobPathname: string | null }[],
  allowsMultiple: boolean,
): string {
  if (existing.length === 0) return randomUUID()
  const emptySlots = existing.filter((r) => !r.blobPathname)
  if (!allowsMultiple) return (emptySlots[0] ?? existing[0]!).id
  if (emptySlots.length > 0) return emptySlots[0]!.id
  return randomUUID()
}

async function attachBlobToClaimDocument(job: JobRow): Promise<string> {
  if (!job.blobPathname) throw new Error("Missing blob pathname")

  const kind = job.kind as DocKind
  await assertDemandStageClear(job.claimId, kind)
  await assertPreviousWorkflowStagesValidated(job.claimId, kind)

  const existing = await db
    .select()
    .from(claimDocument)
    .where(and(eq(claimDocument.claimId, job.claimId), eq(claimDocument.kind, kind)))

  const allowsMultiple = docAllowsMultiple(kind)
  const emptySlots = existing.filter((r) => !r.blobPathname)
  const targetDocumentId = resolveAttachTargetId(existing, allowsMultiple)

  if (kind === DEMAND_LETTER_KIND && existing.length > 0) {
    try {
      await gateDemandLetterSignedUpload({
        claimId: job.claimId,
        documentId: targetDocumentId,
        partnerId: job.partnerId,
        blobPathname: job.blobPathname,
        contentType: job.contentType || "application/octet-stream",
        fileName: job.fileName,
        actorUserId: job.createdBy,
      })
    } catch (err) {
      if (err instanceof DemandLetterVersionMismatchError) throw err
      throw err
    }
  }

  const now = new Date()
  const payload = {
    status: "uploaded" as const,
    blobPathname: job.blobPathname,
    fileName: job.fileName,
    fileSize: job.fileSize,
    contentType: job.contentType || "application/octet-stream",
    uploadedBy: job.createdBy,
    note: "",
    updatedAt: now,
    // Clear prior IDP so re-upload re-triggers a fresh extraction.
    extractedData: null,
    extractionStatus: "none",
    extractionConfidence: null,
    extractionModel: null,
    extractionError: null,
    extractionReviewedAt: null,
    extractionReviewedBy: null,
    stpStatus: "none",
    stpReason: null,
    stpDecidedAt: null,
    ...(kind === DEMAND_LETTER_KIND ? { signatureStatus: SIGNATURE_VERIFIED } : {}),
  }

  if (existing.length === 0) {
    await db.insert(claimDocument).values({
      id: targetDocumentId,
      claimId: job.claimId,
      partnerId: job.partnerId,
      kind,
      ...payload,
      createdAt: now,
    })
    return targetDocumentId
  }

  if (!allowsMultiple) {
    const target = existing.find((r) => r.id === targetDocumentId) ?? existing[0]!
    if (target.blobPathname && target.blobPathname !== job.blobPathname) {
      try {
        await del(target.blobPathname)
      } catch {
        /* best-effort */
      }
    }
    await db.update(claimDocument).set(payload).where(eq(claimDocument.id, target.id))
    const extras = existing.filter((r) => r.id !== target.id)
    for (const extra of extras) {
      if (extra.blobPathname) {
        try {
          await del(extra.blobPathname)
        } catch {
          /* best-effort */
        }
      }
      await db.delete(claimDocument).where(eq(claimDocument.id, extra.id))
    }
    return target.id
  }

  if (emptySlots.length > 0) {
    const slot = existing.find((r) => r.id === targetDocumentId) ?? emptySlots[0]!
    await db.update(claimDocument).set(payload).where(eq(claimDocument.id, slot.id))
    return slot.id
  }

  await db.insert(claimDocument).values({
    id: targetDocumentId,
    claimId: job.claimId,
    partnerId: job.partnerId,
    kind,
    ...payload,
    createdAt: now,
  })
  return targetDocumentId
}

/** Finalize a job that already has blobPathname. Auto-retries until maxAttempts. */
export async function processFinalizeJob(jobId: string): Promise<DocumentJobView> {
  const [job] = await db.select().from(documentJob).where(eq(documentJob.id, jobId)).limit(1)
  if (!job) throw new Error("Job not found")
  if (job.status === "completed") return mapDocumentJob(job)
  if (!job.blobPathname) {
    const [failed] = await db
      .update(documentJob)
      .set({
        status: "failed",
        lastError: "חסר נתיב קובץ להשלמה",
        updatedAt: new Date(),
      })
      .where(eq(documentJob.id, jobId))
      .returning()
    return mapDocumentJob(failed!)
  }

  const attempts = job.attempts + 1
  await db
    .update(documentJob)
    .set({ status: "finalizing", attempts, percent: 99, updatedAt: new Date() })
    .where(eq(documentJob.id, jobId))

  try {
    const documentId = await attachBlobToClaimDocument({ ...job, attempts })
    await syncClaimProgressFromDocuments(job.claimId)
    await recordClaimEvent({
      claimId: job.claimId,
      partnerId: job.partnerId,
      type: "doc_uploaded",
      actorUserId: job.createdBy,
      documentId,
      documentKind: job.kind,
      meta: { jobId, fileName: job.fileName, via: "async_intake" },
    })

    // P2: kick off IDP for pilot kinds (non-blocking).
    try {
      const { enqueueDocumentExtraction } = await import("@/lib/idp/pipeline")
      enqueueDocumentExtraction(documentId, job.kind)
    } catch (idpErr) {
      console.log("[document-job] idp enqueue skip", idpErr)
    }

    const [done] = await db
      .update(documentJob)
      .set({
        status: "completed",
        percent: 100,
        documentId,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(documentJob.id, jobId))
      .returning()

    try {
      revalidatePath("/admin")
      revalidatePath("/dashboard")
    } catch {
      /* ignore */
    }

    return mapDocumentJob(done!)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[document-job] finalize failed", jobId, message)

    if (err instanceof DemandLetterVersionMismatchError) {
      const [failed] = await db
        .update(documentJob)
        .set({
          status: "failed",
          lastError: message.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(documentJob.id, jobId))
        .returning()
      try {
        revalidatePath("/admin")
        revalidatePath("/dashboard")
      } catch {
        /* ignore */
      }
      return mapDocumentJob(failed!)
    }

    if (attempts < job.maxAttempts) {
      // Auto-retry finalize without re-uploading the blob.
      console.log("[document-job] auto-retry finalize", { jobId, attempts, max: job.maxAttempts })
      await db
        .update(documentJob)
        .set({
          status: "finalizing",
          lastError: `ניסיון ${attempts} נכשל, מנסה שוב…`,
          updatedAt: new Date(),
        })
        .where(eq(documentJob.id, jobId))
      // Small delay then recurse (bounded by maxAttempts).
      await new Promise((r) => setTimeout(r, 400 * attempts))
      return processFinalizeJob(jobId)
    }

    const [failed] = await db
      .update(documentJob)
      .set({
        status: "failed",
        lastError: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(documentJob.id, jobId))
      .returning()
    return mapDocumentJob(failed!)
  }
}

export async function markJobFailed(jobId: string, lastError: string): Promise<DocumentJobView> {
  const [row] = await db
    .update(documentJob)
    .set({
      status: "failed",
      lastError: lastError.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(documentJob.id, jobId))
    .returning()
  if (!row) throw new Error("Job not found")
  return mapDocumentJob(row)
}

/** Reset a failed job so the client can re-upload (or re-finalize if blob remains). */
export async function retryDocumentJob(jobId: string): Promise<DocumentJobView> {
  const [job] = await db.select().from(documentJob).where(eq(documentJob.id, jobId)).limit(1)
  if (!job) throw new Error("Job not found")
  if (job.status !== "failed") return mapDocumentJob(job)

  // If blob already landed, just re-run finalize.
  if (job.blobPathname) {
    await db
      .update(documentJob)
      .set({
        status: "finalizing",
        attempts: 0,
        lastError: null,
        percent: 99,
        updatedAt: new Date(),
      })
      .where(eq(documentJob.id, jobId))
    return processFinalizeJob(jobId)
  }

  const [reset] = await db
    .update(documentJob)
    .set({
      status: "pending",
      percent: 0,
      attempts: 0,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(documentJob.id, jobId))
    .returning()
  return mapDocumentJob(reset!)
}

export async function getDocumentJobForUser(
  jobId: string,
  opts: { userId: string; role: string; partnerId: string | null },
): Promise<JobRow | null> {
  const [job] = await db.select().from(documentJob).where(eq(documentJob.id, jobId)).limit(1)
  if (!job) return null
  if (opts.role === "partner") {
    if (!opts.partnerId || job.partnerId !== opts.partnerId) return null
  }
  return job
}

/** Drain stuck finalizing jobs (optional cron/manual). */
export async function processStuckFinalizingJobs(limit = 10): Promise<number> {
  const stuck = await db
    .select()
    .from(documentJob)
    .where(eq(documentJob.status, "finalizing"))
    .limit(limit)

  let n = 0
  for (const row of stuck) {
    if (!row.blobPathname) continue
    await processFinalizeJob(row.id)
    n += 1
  }
  return n
}
