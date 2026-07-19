import { NextResponse, type NextRequest } from "next/server"
import { getOpsInbox } from "@/app/actions/stats"
import type { NextActionKind } from "@/lib/ops/next-action"
import { getSessionUser } from "@/lib/session"
import { hasPermission } from "@/lib/rbac"

const ACTIONS = new Set<NextActionKind | "all">([
  "all",
  "internal_audit",
  "stp_exception",
  "pending_approval",
  "pending_signature",
  "missing_docs",
  "stuck",
  "pending_resolution",
  "finance_gap",
  "none",
])

/** Paginated ops inbox (staff). */
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!hasPermission(user, "claims:read_all") && !hasPermission(user, "exceptions:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const actionRaw = sp.get("action") ?? "all"
  const action = ACTIONS.has(actionRaw as NextActionKind | "all")
    ? (actionRaw as NextActionKind | "all")
    : "all"

  const page = Number(sp.get("page") ?? "1")
  const pageSize = Number(sp.get("pageSize") ?? "24")
  const partnerId = sp.get("partnerId") ?? undefined
  const query = sp.get("query") ?? undefined
  const minUrgencyRaw = Number(sp.get("minUrgency") ?? "0")
  const minUrgency = Number.isFinite(minUrgencyRaw) && minUrgencyRaw > 0 ? minUrgencyRaw : undefined
  const slaOnly = sp.get("slaOnly") === "1" || sp.get("slaOnly") === "true"

  try {
    const result = await getOpsInbox({ page, pageSize, action, minUrgency, slaOnly, partnerId, query })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    console.error("[api/admin/inbox]", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
