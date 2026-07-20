import { get } from "@vercel/blob"
import { extractStub, extractWithOpenAI } from "@/lib/idp/extract"
import {
  DEMAND_CONTENT_MISMATCH,
  extractVersionHashFromBytes,
  extractVersionHashFromText,
  hashDemandDraftBody,
  normalizeDraftBodyForHash,
  versionHashesMatch,
} from "@/lib/demand-letter-hash"

export type DemandLetterVerifyResult =
  | { ok: true; method: "marker" | "body_hash" | "idp" }
  | { ok: false; reason: typeof DEMAND_CONTENT_MISMATCH; detail: string }

async function readBlobBytes(pathname: string): Promise<{ bytes: Buffer; contentType: string }> {
  const result = await get(pathname, { access: "private" })
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error("Blob not found")
  const ab = await new Response(result.stream).arrayBuffer()
  return {
    bytes: Buffer.from(ab),
    contentType: result.blob.contentType || "application/octet-stream",
  }
}

async function verifyViaIdpMarker(input: {
  bytes: Buffer
  contentType: string
  fileName: string
  expectedHash: string
}): Promise<boolean> {
  let notes = ""
  if (process.env.OPENAI_API_KEY) {
    const result = await extractWithOpenAI({
      kind: "demand_letter",
      bytes: input.bytes,
      contentType: input.contentType,
      fileName: input.fileName,
    })
    notes = result.payload.notes ?? ""
    for (const field of result.payload.fields) {
      if (typeof field.value === "string" && field.value.includes("AXIS-Version-Hash")) {
        notes = `${notes}\n${field.value}`
      }
    }
  } else {
    const result = extractStub("demand_letter")
    notes = result.payload.notes ?? ""
  }

  const fromNotes = extractVersionHashFromText(notes)
  if (versionHashesMatch(input.expectedHash, fromNotes)) return true

  const fromBytes = extractVersionHashFromBytes(input.bytes)
  return versionHashesMatch(input.expectedHash, fromBytes)
}

/**
 * Verify a signed demand-letter upload against the draft version hash.
 * Compares embedded marker and/or normalized body hash; falls back to IDP scan.
 */
export async function verifySignedDemandLetterUpload(input: {
  blobPathname: string
  contentType: string
  fileName: string
  expectedVersionHash: string
  draftBody?: string | null
}): Promise<DemandLetterVerifyResult> {
  const { bytes, contentType } = await readBlobBytes(input.blobPathname)
  const effectiveType = input.contentType || contentType

  const markerInFile = extractVersionHashFromBytes(bytes)
  if (versionHashesMatch(input.expectedVersionHash, markerInFile)) {
    return { ok: true, method: "marker" }
  }

  const isPlainText =
    effectiveType.startsWith("text/") || input.fileName.toLowerCase().endsWith(".txt")

  if (isPlainText) {
    const text = normalizeDraftBodyForHash(bytes.toString("utf8"))
    const bodyHash = hashDemandDraftBody(text)
    if (bodyHash === input.expectedVersionHash.toLowerCase()) {
      return { ok: true, method: "body_hash" }
    }
    if (input.draftBody) {
      const draftHash = hashDemandDraftBody(input.draftBody)
      if (draftHash === bodyHash) {
        return { ok: true, method: "body_hash" }
      }
    }
  }

  if (input.draftBody) {
    const draftHash = hashDemandDraftBody(input.draftBody)
    if (draftHash === input.expectedVersionHash.toLowerCase() && isPlainText) {
      const uploadHash = hashDemandDraftBody(bytes.toString("utf8"))
      if (uploadHash === draftHash) {
        return { ok: true, method: "body_hash" }
      }
    }
  }

  try {
    const idpOk = await verifyViaIdpMarker({
      bytes,
      contentType: effectiveType,
      fileName: input.fileName,
      expectedHash: input.expectedVersionHash,
    })
    if (idpOk) return { ok: true, method: "idp" }
  } catch (err) {
    console.error("[demand-verify] idp fallback failed", err)
  }

  return {
    ok: false,
    reason: DEMAND_CONTENT_MISMATCH,
    detail: "Signed document fingerprint does not match the generated draft version hash.",
  }
}
