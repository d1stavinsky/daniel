import { NextResponse } from "next/server"
import { getOpsHealth } from "@/app/actions/stats"
import { getSessionUser } from "@/lib/session"
import { hasPermission } from "@/lib/rbac"

/** Ops health KPIs for admin dashboard header (staff). */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!hasPermission(user, "claims:read_all") && !hasPermission(user, "slo:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const stats = await getOpsHealth()
    return NextResponse.json(stats)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    console.error("[api/admin/ops-health]", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
