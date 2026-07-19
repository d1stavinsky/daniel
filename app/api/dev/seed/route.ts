import { NextResponse } from "next/server"
import { seedDemoData } from "@/lib/seed"

/**
 * Idempotent demo-data seeder. Development / preview only.
 * Never expose in production — returns demo credentials.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const secret = process.env.SEED_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const result = await seedDemoData()
    return NextResponse.json(result)
  } catch (err) {
    console.error("[seed] failed:", err instanceof Error ? err.message : String(err))
    return NextResponse.json({ seeded: false, error: "Seed failed" }, { status: 500 })
  }
}
