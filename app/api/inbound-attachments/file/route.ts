import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { inboundEmail, inboundEmailAttachment } from "@/lib/db/schema"
import { getSessionUser } from "@/lib/session"

export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const attachmentId = request.nextUrl.searchParams.get("id")
  const download = request.nextUrl.searchParams.get("download") === "1"
  if (!attachmentId) return NextResponse.json({ error: "Attachment id required" }, { status: 400 })

  try {
    const [row] = await db
      .select({
        blobPathname: inboundEmailAttachment.blobPathname,
        fileName: inboundEmailAttachment.fileName,
        contentType: inboundEmailAttachment.contentType,
      })
      .from(inboundEmailAttachment)
      .innerJoin(inboundEmail, eq(inboundEmail.id, inboundEmailAttachment.inboundEmailId))
      .where(
        and(
          eq(inboundEmailAttachment.id, attachmentId),
          inArray(inboundEmailAttachment.status, ["pending", "saved"]),
        ),
      )
      .limit(1)
    if (!row?.blobPathname) return new NextResponse("Not found", { status: 404 })

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
    const fileName = row.fileName.replace(/[\r\n]/g, "")
    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": row.contentType || result.blob.contentType,
        "Content-Disposition": `${mode}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        ETag: result.blob.etag,
        "Cache-Control": "private, no-cache",
      },
    })
  } catch (error) {
    console.error("[inbound-email] file failed:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "Failed to serve attachment" }, { status: 500 })
  }
}
