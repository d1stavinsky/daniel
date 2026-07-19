import { randomUUID } from "crypto"
import { NextResponse, type NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { webhookEndpoint } from "@/lib/db/schema"
import { requireAdmin } from "@/lib/session"
import type { WebhookEventName } from "@/lib/webhooks/dispatch"

const ALL_EVENTS: WebhookEventName[] = [
  "claim.document_approved",
  "claim.stp_verified",
  "claim.completed",
]

export async function GET() {
  await requireAdmin()
  const rows = await db.select().from(webhookEndpoint).orderBy(webhookEndpoint.createdAt)
  return NextResponse.json({
    endpoints: rows.map((r) => ({
      id: r.id,
      url: r.url,
      events: JSON.parse(r.events || "[]") as string[],
      active: r.active,
      createdAt: r.createdAt.toISOString(),
    })),
    availableEvents: ALL_EVENTS,
  })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  const body = (await request.json()) as {
    url?: string
    events?: string[]
    secret?: string
  }
  if (!body.url?.startsWith("https://")) {
    return NextResponse.json({ error: "URL must be https://" }, { status: 400 })
  }
  const events = (body.events ?? ALL_EVENTS).filter((e) => ALL_EVENTS.includes(e as WebhookEventName))
  const now = new Date()
  const id = randomUUID()
  await db.insert(webhookEndpoint).values({
    id,
    url: body.url,
    secret: body.secret || randomUUID(),
    events: JSON.stringify(events.length > 0 ? events : ALL_EVENTS),
    active: true,
    createdBy: admin.id,
    createdAt: now,
    updatedAt: now,
  })
  return NextResponse.json({ id })
}

export async function DELETE(request: NextRequest) {
  await requireAdmin()
  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  await db.delete(webhookEndpoint).where(eq(webhookEndpoint.id, id))
  return NextResponse.json({ ok: true })
}
