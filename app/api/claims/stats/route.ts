import { NextResponse } from "next/server"
import { getClaimsDashboardStats } from "@/app/actions/claims"
import { getSessionUser } from "@/lib/session"
import { isStaff } from "@/lib/rbac"

/** Aggregate claim stats for staff dashboards (P4). */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const stats = await getClaimsDashboardStats()
    return NextResponse.json(stats)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load stats" },
      { status: 500 },
    )
  }
}
