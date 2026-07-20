import { type NextRequest, NextResponse } from "next/server"
import { findClaimAccess } from "@/lib/tenant"
import { listClaimDocumentJobs } from "@/lib/document-jobs"

type RouteContext = { params: Promise<{ id: string }> }

/** Active (and failed) intake jobs for a claim — polled by the documents panel. */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: claimId } = await context.params
    const access = await findClaimAccess(claimId)
    if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const all = request.nextUrl.searchParams.get("all") === "1"
    const jobs = await listClaimDocumentJobs(access.claimId, access.partnerId, {
      activeOnly: !all,
    })
    return NextResponse.json({ jobs })
  } catch (err) {
    console.error("[api/jobs] list failed:", err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: "Failed to load jobs" }, { status: 500 })
  }
}
