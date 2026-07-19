import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/session"
import { listClaimsPaginated, type ClaimsListFilters } from "@/app/actions/claims"
import { recordSloMetric } from "@/lib/audit"
import type { ClaimProgressStatus } from "@/lib/claim-progress"

/**
 * Paginated claims list (P4).
 * Staff: all tenants. Partners: own org only.
 */
export async function GET(request: NextRequest) {
  const started = Date.now()
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const sp = request.nextUrl.searchParams
    const filters: ClaimsListFilters = {
      page: Number(sp.get("page") ?? "1"),
      pageSize: Number(sp.get("pageSize") ?? "24"),
      query: sp.get("q") ?? undefined,
      partnerId: sp.get("partnerId") ?? undefined,
      progressStatus: (sp.get("status") as ClaimProgressStatus | "all" | null) ?? "all",
    }

    const result = await listClaimsPaginated(filters)
    const ms = Date.now() - started
    void recordSloMetric("api_claims_list", ms, { page: result.page, total: result.total })

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
