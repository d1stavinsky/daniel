import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { unlockUserAccount, listLockedAccounts } from "@/lib/auth/lockout"

export const dynamic = "force-dynamic"

/** GET /api/admin/account-lockout — list locked accounts (admin only). */
export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const rows = await listLockedAccounts()
  return NextResponse.json({
    accounts: rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      failedLoginAttempts: row.failedLoginAttempts,
      lockedAt: row.lockedAt?.toISOString() ?? null,
    })),
  })
}

/** POST /api/admin/account-lockout — unlock a user { userId }. */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { userId?: unknown }
  try {
    body = (await request.json()) as { userId?: unknown }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : ""
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 })
  }

  const ok = await unlockUserAccount(userId)
  if (!ok) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true, userId })
}
