import { NextResponse, type NextRequest } from "next/server"
import { scanSlaBreaches, scanStuckClaims } from "@/lib/notifications"
import { runStpMissingDocChase } from "@/lib/stp/engine"

/**
 * Stuck-claim scan + SLA monitor + STP missing-doc auto-chase for Vercel Cron.
 * Always requires CRON_SECRET — fails closed.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[cron] CRON_SECRET is not configured")
    return NextResponse.json({ error: "Cron is not configured" }, { status: 503 })
  }

  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const [stuck, sla, chase] = await Promise.all([
      scanStuckClaims(),
      scanSlaBreaches(),
      runStpMissingDocChase(),
    ])
    return NextResponse.json({ ok: true, stuck, sla, chase })
  } catch (err) {
    console.error("[cron] stuck/stp scan failed:", err instanceof Error ? err.message : String(err))
    return NextResponse.json({ ok: false, error: "scan failed" }, { status: 500 })
  }
}
