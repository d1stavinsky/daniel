import { type NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { getSessionUser } from "@/lib/session"
import { ACCEPTED_DOC_TYPES, MAX_DOC_BYTES, type DocKind } from "@/lib/documents"
import { getDocumentJobForUser, markJobUploading } from "@/lib/document-jobs"
import { assertPreviousWorkflowStagesValidated } from "@/lib/document-workflow-gates"
import { assertDemandStageClear } from "@/lib/demand-letter"

/**
 * Vercel Blob client-upload token exchange (direct-to-Blob).
 * Auth + job ownership checked before issuing a short-lived token.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        let jobId = ""
        try {
          const parsed = JSON.parse(clientPayload || "{}") as { jobId?: string }
          jobId = String(parsed.jobId ?? "")
        } catch {
          throw new Error("clientPayload לא תקין")
        }
        if (!jobId) throw new Error("jobId חסר")

        const job = await getDocumentJobForUser(jobId, {
          userId: user.id,
          role: user.role,
          partnerId: user.partnerId,
        })
        if (!job) throw new Error("Forbidden")
        if (job.status === "completed") throw new Error("הקובץ כבר הועלה")
        await assertDemandStageClear(job.claimId, job.kind as DocKind)
        await assertPreviousWorkflowStagesValidated(job.claimId, job.kind as DocKind)

        await markJobUploading(jobId)

        return {
          allowedContentTypes: [...ACCEPTED_DOC_TYPES],
          maximumSizeInBytes: MAX_DOC_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            jobId,
            claimId: job.claimId,
            kind: job.kind,
            userId: user.id,
          }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // May not fire on localhost — client also calls /complete explicitly.
        console.log("[blob-upload] onUploadCompleted", blob.pathname, tokenPayload)
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[blob-upload] token error:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
