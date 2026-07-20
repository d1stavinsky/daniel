import { type NextRequest, NextResponse } from "next/server"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { claimDocument } from "@/lib/db/schema"
import { getSessionUser } from "@/lib/session"
import { signDocToken } from "@/lib/doc-signing"
import { recordClaimEvent } from "@/lib/claim-events"

const MAX_BATCH = 40

/**
 * Batch-sign document download URLs so galleries do not stampede with N
 * server-action round trips (P0).
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = (await request.json()) as { docIds?: unknown }
    const rawIds = Array.isArray(body.docIds) ? body.docIds : []
    const docIds = [...new Set(rawIds.filter((id): id is string => typeof id === "string" && id.length > 0))]

    if (docIds.length === 0) {
      return NextResponse.json({ urls: {} as Record<string, string> })
    }
    if (docIds.length > MAX_BATCH) {
      return NextResponse.json({ error: `Max ${MAX_BATCH} documents per batch` }, { status: 400 })
    }

    const filters =
      user.role === "partner" && user.partnerId
        ? and(inArray(claimDocument.id, docIds), eq(claimDocument.partnerId, user.partnerId))
        : inArray(claimDocument.id, docIds)

    const rows = await db
      .select({
        id: claimDocument.id,
        blobPathname: claimDocument.blobPathname,
        claimId: claimDocument.claimId,
        partnerId: claimDocument.partnerId,
        kind: claimDocument.kind,
      })
      .from(claimDocument)
      .where(filters)

    const urls: Record<string, string> = {}
    for (const row of rows) {
      if (!row.blobPathname) continue
      const token = signDocToken(row.id)
      urls[row.id] = `/api/documents/file?t=${encodeURIComponent(token)}`
    }

    // Best-effort audit for first view batch (avoid N inserts).
    if (rows.length > 0 && rows[0]) {
      await recordClaimEvent({
        claimId: rows[0].claimId,
        partnerId: rows[0].partnerId,
        type: "doc_viewed",
        actorUserId: user.id,
        actorRole: user.role,
        meta: { batchSize: Object.keys(urls).length, docIds: Object.keys(urls) },
      })
    }

    return NextResponse.json({ urls })
  } catch (err) {
    console.error("[api/sign-batch] failed:", err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: "Signing failed" }, { status: 500 })
  }
}
