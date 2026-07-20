import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { claimDocument } from "@/lib/db/schema"
import { getSessionUser } from "@/lib/session"
import { verifyDocToken } from "@/lib/doc-signing"

// Serves a private document behind a time-limited signed token. Defense in
// depth: we verify the signed token AND re-check the live session + tenant in
// SQL, so an expired/forged link or a foreign tenant can never read the file.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t")
  const download = request.nextUrl.searchParams.get("download") === "1"
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 })

  const verified = verifyDocToken(token)
  if (!verified) return NextResponse.json({ error: "Link expired" }, { status: 403 })

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const filters =
      user.role === "partner" && user.partnerId
        ? and(eq(claimDocument.id, verified.docId), eq(claimDocument.partnerId, user.partnerId))
        : eq(claimDocument.id, verified.docId)

    const [row] = await db.select().from(claimDocument).where(filters).limit(1)
    if (!row || !row.blobPathname) {
      if (user.role === "partner") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      return new NextResponse("Not found", { status: 404 })
    }

    const result = await get(row.blobPathname, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    })
    if (!result) return new NextResponse("Not found", { status: 404 })

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: result.blob.etag, "Cache-Control": "private, no-cache" },
      })
    }

    const mode = download ? "attachment" : "inline"
    const disposition = row.fileName
      ? `${mode}; filename*=UTF-8''${encodeURIComponent(row.fileName.replace(/[\r\n]/g, ""))}`
      : mode
    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        "Content-Disposition": disposition,
        ETag: result.blob.etag,
        "Cache-Control": "private, no-cache",
      },
    })
  } catch (err) {
    console.log("[v0] serve document error:", err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 })
  }
}
