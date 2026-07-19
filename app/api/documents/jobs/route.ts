import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/session"
import { requireClaimAccess } from "@/lib/tenant"
import {
  ACCEPTED_DOC_TYPES,
  DOC_KINDS,
  MAX_DOC_BYTES,
  type DocKind,
} from "@/lib/documents"
import { createDocumentJobs } from "@/lib/document-jobs"
import { ensureDocRows } from "@/lib/claim-documents"
import { assertPreviousWorkflowStagesValidated } from "@/lib/document-workflow-gates"
import { assertDemandStageClear } from "@/lib/demand-letter"

/**
 * Create async intake jobs. Returns immediately — client then direct-uploads to Blob.
 * Allowed for admin and the claim's partner (P1 partner self-service).
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = (await request.json()) as {
      claimId?: string
      kind?: string
      files?: {
        fileName: string
        fileSize: number
        contentType: string
        clientKey: string
        contentHash?: string
      }[]
    }

    const claimId = String(body.claimId ?? "")
    const kind = String(body.kind ?? "") as DocKind
    const files = Array.isArray(body.files) ? body.files : []

    if (!claimId || !DOC_KINDS.includes(kind)) {
      return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 })
    }
    if (files.length === 0) {
      return NextResponse.json({ error: "לא נבחרו קבצים" }, { status: 400 })
    }
    if (files.length > 20) {
      return NextResponse.json({ error: "מקסימום 20 קבצים בבת אחת" }, { status: 400 })
    }

    for (const f of files) {
      if (!f.fileName || !f.clientKey) {
        return NextResponse.json({ error: "פרטי קובץ חסרים" }, { status: 400 })
      }
      if (typeof f.fileSize !== "number" || f.fileSize <= 0 || f.fileSize > MAX_DOC_BYTES) {
        return NextResponse.json({ error: `הקובץ ${f.fileName} גדול מדי או ריק` }, { status: 400 })
      }
      if (!ACCEPTED_DOC_TYPES.includes(f.contentType)) {
        return NextResponse.json({ error: `סוג קובץ לא נתמך: ${f.fileName}` }, { status: 400 })
      }
    }

    const access = await requireClaimAccess(claimId)
    if (access.user.role === "admin") {
      await ensureDocRows(access.claimId, access.partnerId)
    }

    await assertDemandStageClear(access.claimId, kind)
    await assertPreviousWorkflowStagesValidated(access.claimId, kind)

    const jobs = await createDocumentJobs({
      claimId: access.claimId,
      partnerId: access.partnerId,
      kind,
      createdBy: user.id,
      files,
    })

    return NextResponse.json({ ok: true, jobs }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[jobs.create] fail", message)
    const status =
      message === "Forbidden"
        ? 403
        : message === "Claim not found"
          ? 404
          : message.includes("שלבים קודמים")
            ? 409
            : 500
    return NextResponse.json({ error: status === 500 ? "יצירת משימת העלאה נכשלה" : message }, { status })
  }
}
