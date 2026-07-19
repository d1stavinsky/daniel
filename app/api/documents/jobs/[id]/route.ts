import { type NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { documentJob } from "@/lib/db/schema"
import { getSessionUser } from "@/lib/session"
import {
  getDocumentJobForUser,
  mapDocumentJob,
  processFinalizeJob,
  retryDocumentJob,
  updateJobProgress,
} from "@/lib/document-jobs"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Job control:
 * - POST { action: "progress", percent }
 * - POST { action: "retry" }
 * - POST { blobPathname, contentType?, fileSize? } → 202 finalize in background
 * - GET → current job
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: jobId } = await context.params
  const job = await getDocumentJobForUser(jobId, {
    userId: user.id,
    role: user.role,
    partnerId: user.partnerId,
  })
  if (!job) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json({ job: mapDocumentJob(job) })
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: jobId } = await context.params
  const job = await getDocumentJobForUser(jobId, {
    userId: user.id,
    role: user.role,
    partnerId: user.partnerId,
  })
  if (!job) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const body = (await request.json()) as {
      blobPathname?: string
      contentType?: string
      fileSize?: number
      action?: "complete" | "retry" | "progress" | "fail"
      percent?: number
      error?: string
    }

    if (body.action === "retry") {
      const view = await retryDocumentJob(job.id)
      return NextResponse.json({ ok: true, job: view })
    }

    if (body.action === "fail") {
      const { markJobFailed } = await import("@/lib/document-jobs")
      const view = await markJobFailed(job.id, String(body.error ?? "העלאה נכשלה"))
      return NextResponse.json({ ok: true, job: view })
    }

    if (body.action === "progress" && typeof body.percent === "number") {
      await updateJobProgress(job.id, body.percent)
      return NextResponse.json({ ok: true })
    }

    const pathname = String(body.blobPathname ?? job.blobPathname ?? "")
    if (!pathname) {
      return NextResponse.json({ error: "blobPathname חסר" }, { status: 400 })
    }

    const now = new Date()
    const [queued] = await db
      .update(documentJob)
      .set({
        status: "finalizing",
        percent: 99,
        blobPathname: pathname,
        contentType: body.contentType ?? job.contentType,
        fileSize: body.fileSize ?? job.fileSize,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(documentJob.id, job.id))
      .returning()

    after(async () => {
      try {
        await processFinalizeJob(job.id)
      } catch (err) {
        console.error("[jobs.complete] after failed", job.id, err)
      }
    })

    return NextResponse.json(
      { ok: true, accepted: true, job: mapDocumentJob(queued!) },
      { status: 202 },
    )
  } catch (err) {
    console.error("[jobs.complete] fail", err)
    return NextResponse.json({ error: "השלמת ההעלאה נכשלה" }, { status: 500 })
  }
}
