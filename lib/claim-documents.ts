import { randomUUID } from "crypto"
import { and, asc, eq, inArray, notInArray } from "drizzle-orm"
import { del } from "@vercel/blob"
import { db } from "@/lib/db"
import { claimDocument } from "@/lib/db/schema"
import { DOC_KINDS, REQUIRED_DOCS, type ClaimDoc, type DocKind, type DocStatus } from "@/lib/documents"
import { parseExtractedData } from "@/lib/idp/types"

type DocRow = typeof claimDocument.$inferSelect

export function mapClaimDoc(row: DocRow, opts?: { includeExtraction?: boolean }): ClaimDoc {
  const base: ClaimDoc = {
    id: row.id,
    claimId: row.claimId,
    partnerId: row.partnerId,
    kind: row.kind as DocKind,
    status: row.status as DocStatus,
    fileName: row.fileName,
    fileSize: row.fileSize,
    contentType: row.contentType,
    note: row.note,
    hasFile: Boolean(row.blobPathname),
    updatedAt: row.updatedAt.toISOString(),
  }
  if (!opts?.includeExtraction) return base
  return {
    ...base,
    extractionStatus: (row.extractionStatus as ClaimDoc["extractionStatus"]) || "none",
    extractionConfidence: row.extractionConfidence,
    extractedData: parseExtractedData(row.extractedData),
    extractionError: row.extractionError,
    extractionModel: row.extractionModel,
    extractionReviewedBy: row.extractionReviewedBy,
    stpStatus: (row.stpStatus as ClaimDoc["stpStatus"]) || "none",
    stpReason: row.stpReason,
  }
}

/** Ensure every canonical required-doc row exists; drop obsolete kinds. */
export async function ensureDocRows(claimId: string, partnerId: string): Promise<void> {
  const scope = and(eq(claimDocument.claimId, claimId), eq(claimDocument.partnerId, partnerId))

  const obsolete = await db
    .select({ id: claimDocument.id, blobPathname: claimDocument.blobPathname })
    .from(claimDocument)
    .where(and(scope, notInArray(claimDocument.kind, DOC_KINDS)))
  for (const row of obsolete) {
    if (row.blobPathname) {
      try {
        await del(row.blobPathname)
      } catch (err) {
        console.log("[docs] obsolete blob delete failed:", err instanceof Error ? err.message : String(err))
      }
    }
  }
  if (obsolete.length > 0) {
    await db.delete(claimDocument).where(and(scope, notInArray(claimDocument.kind, DOC_KINDS)))
  }

  const existing = await db.select({ kind: claimDocument.kind }).from(claimDocument).where(scope)
  const have = new Set(existing.map((r) => r.kind))
  const missing = REQUIRED_DOCS.filter((d) => !have.has(d.kind))
  if (missing.length === 0) return
  const now = new Date()
  await db.insert(claimDocument).values(
    missing.map((d) => ({
      id: randomUUID(),
      claimId,
      partnerId,
      kind: d.kind,
      status: "pending" as const,
      note: "",
      updatedAt: now,
      createdAt: now,
    })),
  )
}

/** List documents for a claim (tenant already enforced by caller). */
export async function listClaimDocuments(
  claimId: string,
  partnerId: string,
  opts?: { includeExtraction?: boolean },
): Promise<ClaimDoc[]> {
  const rows = await db
    .select()
    .from(claimDocument)
    .where(
      and(
        eq(claimDocument.claimId, claimId),
        eq(claimDocument.partnerId, partnerId),
        inArray(claimDocument.kind, DOC_KINDS),
      ),
    )
    .orderBy(asc(claimDocument.createdAt))
  const order = new Map(DOC_KINDS.map((k, i) => [k, i]))
  return rows
    .map((row) => mapClaimDoc(row, opts))
    .filter((d) => DOC_KINDS.includes(d.kind))
    .sort((a, b) => (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0))
}
