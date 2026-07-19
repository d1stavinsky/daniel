import { eq } from "drizzle-orm"
import { get } from "@vercel/blob"
import { db } from "@/lib/db"
import { claimDocument } from "@/lib/db/schema"
import { recordClaimEvent } from "@/lib/claim-events"
import { extractStub, extractWithOpenAI } from "@/lib/idp/extract"
import {
  IDP_CONFIDENCE_THRESHOLD,
  isIdpPilotKind,
  type ExtractionStatus,
  type IdpPilotKind,
} from "@/lib/idp/types"

async function readBlobBytes(pathname: string): Promise<{ bytes: Buffer; contentType: string }> {
  const result = await get(pathname, { access: "private" })
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error("Blob not found")
  const ab = await new Response(result.stream).arrayBuffer()
  return {
    bytes: Buffer.from(ab),
    contentType: result.blob.contentType || "application/octet-stream",
  }
}

/**
 * Run IDP extraction for a claim document (pilot kinds only).
 * Safe to call repeatedly — overwrites previous extraction result.
 */
export async function runDocumentExtraction(documentId: string): Promise<{
  status: ExtractionStatus
  confidence: number | null
}> {
  const [doc] = await db.select().from(claimDocument).where(eq(claimDocument.id, documentId)).limit(1)
  if (!doc) throw new Error("Document not found")
  if (!doc.blobPathname) throw new Error("Document has no file")
  if (!isIdpPilotKind(doc.kind)) {
    return { status: "none", confidence: null }
  }

  const kind = doc.kind as IdpPilotKind
  const now = new Date()

  await db
    .update(claimDocument)
    .set({
      extractionStatus: "processing",
      extractionError: null,
      updatedAt: now,
    })
    .where(eq(claimDocument.id, documentId))

  try {
    const { bytes, contentType } = await readBlobBytes(doc.blobPathname)
    const effectiveType = doc.contentType || contentType

    let payload
    let model: string
    if (process.env.OPENAI_API_KEY) {
      const result = await extractWithOpenAI({
        kind,
        bytes,
        contentType: effectiveType,
        fileName: doc.fileName || `${kind}.bin`,
      })
      payload = result.payload
      model = result.model
    } else {
      console.warn("[idp] OPENAI_API_KEY missing — using stub extraction")
      const result = extractStub(kind)
      payload = result.payload
      model = result.model
    }

    const status: ExtractionStatus =
      payload.overallConfidence >= IDP_CONFIDENCE_THRESHOLD ? "ready" : "needs_review"

    await db
      .update(claimDocument)
      .set({
        extractedData: JSON.stringify(payload),
        extractionStatus: status,
        extractionConfidence: Math.round(payload.overallConfidence * 100),
        extractionModel: model,
        extractionError: null,
        extractionReviewedAt: null,
        extractionReviewedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(claimDocument.id, documentId))

    await recordClaimEvent({
      claimId: doc.claimId,
      partnerId: doc.partnerId,
      type: "idp_extracted",
      documentId,
      documentKind: doc.kind,
      meta: {
        extractionStatus: status,
        confidence: payload.overallConfidence,
        model,
      },
    })

    // P3: STP auto-verify / exception / chase after extraction.
    try {
      const { applyStpAfterExtraction } = await import("@/lib/stp/engine")
      await applyStpAfterExtraction(documentId)
    } catch (stpErr) {
      console.error("[idp] stp after extract failed", documentId, stpErr)
    }

    // P3 fail-safe: cross-field audit (demand letter vs appraiser report).
    if (kind === "demand_letter" || kind === "appraiser_report") {
      try {
        const { runDemandAppraisalAudit } = await import("@/lib/stp/cross-field")
        await runDemandAppraisalAudit(doc.claimId)
      } catch (auditErr) {
        console.error("[idp] cross-field audit failed", documentId, auditErr)
      }
    }

    console.log("[idp] extraction.ok", { documentId, kind, status, confidence: payload.overallConfidence })
    return { status, confidence: payload.overallConfidence }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[idp] extraction.fail", documentId, message)
    await db
      .update(claimDocument)
      .set({
        extractionStatus: "failed",
        extractionError: message.slice(0, 800),
        updatedAt: new Date(),
      })
      .where(eq(claimDocument.id, documentId))

    try {
      const { applyStpAfterExtraction } = await import("@/lib/stp/engine")
      await applyStpAfterExtraction(documentId)
    } catch (stpErr) {
      console.error("[idp] stp after fail failed", documentId, stpErr)
    }

    return { status: "failed", confidence: null }
  }
}

/** Fire-and-forget wrapper used after upload finalize. */
export function enqueueDocumentExtraction(documentId: string, kind: string): void {
  if (!isIdpPilotKind(kind)) return
  void runDocumentExtraction(documentId).catch((err) => {
    console.error("[idp] enqueue failed", documentId, err)
  })
}
