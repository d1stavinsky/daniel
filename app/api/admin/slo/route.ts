import { NextResponse } from "next/server"
import { getSloSummary } from "@/lib/audit"
import { getSessionUser } from "@/lib/session"
import { hasPermission } from "@/lib/rbac"

/** SLO summary for staff monitoring (P4). */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!hasPermission(user, "slo:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const slos = await getSloSummary()
  const ok = slos.every((s) => s.ok || s.sampleCount === 0)
  return NextResponse.json({ ok, slos }, { status: ok ? 200 : 503 })
}
