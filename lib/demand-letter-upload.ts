import { get } from "@vercel/blob"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { claimDocument } from "@/lib/db/schema"
import { recordClaimEvent } from "@/lib/claim-events"
import {
  DEMAND_CONTENT_MISMATCH,
  DEMAND_CONTENT_MISMATCH_HE,
} from "@/lib/demand-letter-hash"
import { verifySignedDemandLetterUpload } from "@/lib/demand-letter-verify"
import { DEMAND_LETTER_KIND, SIGNATURE_PENDING, SIGNATURE_VERIFIED } from "@/lib/demand-letter"

type DemandUploadGateInput = {
  claimId: string
  documentId: string
  partnerId: string
  blobPathname: string
  contentType: string
  fileName: string
  actorUserId?: string | null
}

export class DemandLetterVersionMismatchError extends Error {
  readonly code = DEMAND_CONTENT_MISMATCH

  constructor(message = DEMAND_CONTENT_MISMATCH_HE) {
    super(message)
    this.name = "DemandLetterVersionMismatchError"
  }
}

async function readDraftBody(pathname: string | null): Promise<string | null> {
  if (!pathname) return null
  try {
    const result = await get(pathname, { access: "private" })
    if (!result || result.statusCode !== 200 || !result.stream) return null
    const ab = await new Response(result.stream).arrayBuffer()
    return Buffer.from(ab).toString("utf8")
  } catch {
    return null
  }
}

/**
 * Verify signed demand letter against stored draft version hash.
 * Requires a generated draft (draftVersionHash). Throws on mismatch.
 */
export async function gateDemandLetterSignedUpload(input: DemandUploadGateInput): Promise<void> {
  const [row] = await db
    .select({
      id: claimDocument.id,
      draftVersionHash: claimDocument.draftVersionHash,
      draftBlobPathname: claimDocument.draftBlobPathname,
      signatureStatus: claimDocument.signatureStatus,
    })
    .from(claimDocument)
    .where(and(eq(claimDocument.id, input.documentId), eq(claimDocument.kind, DEMAND_LETTER_KIND)))
    .limit(1)

  if (!row) {
    throw new Error("שורת מכתב דרישה לא נמצאה.")
  }

  // ZT-1c: demand letter uploads always require a generated draft version hash.
  if (!row.draftVersionHash) {
    throw new Error(
      "לא ניתן להעלות מכתב דרישה לפני הפקת טיוטה לחתימה. יש להפיק מכתב דרישה תחילה.",
    )
  }

  // Re-uploads after reset must re-enter pending_signature; force verify whenever draft exists
  // and signature is not yet verified.
  if (row.signatureStatus === SIGNATURE_VERIFIED) {
    // Allow re-upload of a new signed scan — re-verify against the same draft hash.
  }

  const draftBody = await readDraftBody(row.draftBlobPathname)
  const verify = await verifySignedDemandLetterUpload({
    blobPathname: input.blobPathname,
    contentType: input.contentType,
    fileName: input.fileName,
    expectedVersionHash: row.draftVersionHash,
    draftBody,
  })

  if (verify.ok) return

  const now = new Date()
  await db
    .update(claimDocument)
    .set({
      blobPathname: input.blobPathname,
      fileName: input.fileName,
      contentType: input.contentType,
      status: "uploaded",
      signatureStatus: SIGNATURE_PENDING,
      stpStatus: "exception",
      stpReason: DEMAND_CONTENT_MISMATCH,
      stpDecidedAt: now,
      note: DEMAND_CONTENT_MISMATCH_HE,
      extractionStatus: "failed",
      extractionError: verify.detail,
      updatedAt: now,
    })
    .where(eq(claimDocument.id, input.documentId))

  await recordClaimEvent({
    claimId: input.claimId,
    partnerId: input.partnerId,
    type: "demand_version_mismatch",
    actorUserId: input.actorUserId ?? null,
    documentId: input.documentId,
    documentKind: DEMAND_LETTER_KIND,
    meta: { expectedHash: row.draftVersionHash, detail: verify.detail },
  })

  throw new DemandLetterVersionMismatchError()
}
