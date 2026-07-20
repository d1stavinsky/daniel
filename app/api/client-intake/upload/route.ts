/**
 * Client-intake wizard submit — token-authenticated (no session).
 * Step 1 (my details) + Step 2 (third party / liability) files + form fields.
 * Files land as status "uploaded" = awaiting staff review (no gate bypass).
 */

import { type NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { put, del } from "@vercel/blob"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { claim, claimDocument, claimStage } from "@/lib/db/schema"
import { ACCEPTED_DOC_TYPES, MAX_DOC_BYTES, type DocKind } from "@/lib/documents"
import { recordClaimEvent } from "@/lib/claim-events"
import { syncClaimProgressFromDocuments } from "@/lib/sync-claim-progress"
import { verifyClientIntakeToken } from "@/lib/whatsapp/client-intake-link"

export const runtime = "nodejs"
export const maxDuration = 120

const CLIENT_ACTOR = "client:intake"

/** Uploadable kinds from the client wizard. */
export const CLIENT_INTAKE_FILE_KINDS = [
  "vehicle_license_client",
  "driver_license_client",
  "owner_id",
  "insurance_policy",
  "power_of_attorney",
  "insurance_to_trust_consent",
  "vehicle_license_third_party",
  "driver_license_third_party",
] as const satisfies readonly DocKind[]

export type ClientIntakeFileKind = (typeof CLIENT_INTAKE_FILE_KINDS)[number]

const STEP1_REQUIRED: ClientIntakeFileKind[] = [
  "vehicle_license_client",
  "driver_license_client",
  "owner_id",
  "insurance_policy",
  "power_of_attorney",
  "insurance_to_trust_consent",
]

async function saveOneFile(input: {
  claimId: string
  kind: ClientIntakeFileKind
  file: File
}): Promise<{ kind: ClientIntakeFileKind; documentId: string; fileName: string }> {
  const { claimId, kind, file } = input

  if (file.size > MAX_DOC_BYTES) {
    throw new Error(`הקובץ גדול מדי (מקסימום 10MB)`)
  }
  if (!file.type || !ACCEPTED_DOC_TYPES.includes(file.type)) {
    throw new Error(`סוג קובץ לא נתמך (PDF או תמונה)`)
  }

  const existing = await db
    .select()
    .from(claimDocument)
    .where(and(eq(claimDocument.claimId, claimId), eq(claimDocument.kind, kind)))

  if (existing.length === 0) {
    throw new Error("התיק לא נמצא או שסוג המסמך חסר")
  }

  const target = existing.find((r) => !r.blobPathname) ?? existing[0]!
  const partnerId = target.partnerId
  const now = new Date()

  const safeName = file.name.replace(/[^\w.\-\u0590-\u05FF]/g, "_")
  const pathname = `documents/${partnerId}/${claimId}/${kind}-client-${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`

  const blob = await put(pathname, file, {
    access: "private",
    abortSignal: AbortSignal.timeout(90_000),
  })

  if (target.blobPathname && target.blobPathname !== blob.pathname) {
    try {
      await del(target.blobPathname)
    } catch {
      /* best-effort */
    }
  }

  await db
    .update(claimDocument)
    .set({
      status: "uploaded",
      blobPathname: blob.pathname,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
      uploadedBy: CLIENT_ACTOR,
      note: "awaiting staff review · received via client intake",
      updatedAt: now,
      extractedData: null,
      extractionStatus: "none",
      extractionConfidence: null,
      extractionModel: null,
      extractionError: null,
      extractionReviewedAt: null,
      extractionReviewedBy: null,
      stpStatus: "none",
      stpReason: null,
      stpDecidedAt: null,
    })
    .where(and(eq(claimDocument.id, target.id), eq(claimDocument.partnerId, partnerId)))

  await recordClaimEvent({
    claimId,
    partnerId,
    type: "doc_uploaded",
    actorUserId: null,
    actorRole: "client",
    documentId: target.id,
    documentKind: kind,
    meta: {
      fileName: file.name,
      fileSize: file.size,
      via: "client_intake_wizard",
      awaitingStaffReview: true,
    },
  })

  try {
    const { enqueueDocumentExtraction } = await import("@/lib/idp/pipeline")
    enqueueDocumentExtraction(target.id, kind)
  } catch {
    /* IDP optional */
  }

  return { kind, documentId: target.id, fileName: file.name }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const token = String(formData.get("token") ?? "")
    const payload = token ? verifyClientIntakeToken(token) : null
    if (!payload) {
      return NextResponse.json({ error: "קישור לא תקין או שפג תוקפו" }, { status: 401 })
    }

    const liabilityRaw = String(formData.get("liability") ?? "").trim().toLowerCase()
    if (liabilityRaw !== "yes" && liabilityRaw !== "no") {
      return NextResponse.json({ error: "יש לבחור האם צד ג׳ מודה באחריות" }, { status: 400 })
    }
    const liability = liabilityRaw === "yes"
    const thirdPartyInsurer = String(formData.get("thirdPartyInsurer") ?? "").trim()
    const missingContact = String(formData.get("missingContact") ?? "").trim()
    if (thirdPartyInsurer.length > 120 || missingContact.length > 250) {
      return NextResponse.json({ error: "אחד מפרטי צד ג׳ ארוך מדי" }, { status: 400 })
    }

    const filesByKind = new Map<ClientIntakeFileKind, File>()
    for (const kind of CLIENT_INTAKE_FILE_KINDS) {
      const entry = formData.get(kind)
      if (entry instanceof File && entry.size > 0) filesByKind.set(kind, entry)
    }

    const claimId = payload.claimId
    const [claimRow] = await db
      .select({
        id: claim.id,
        partnerId: claim.partnerId,
        plate: claim.plate,
        clientPhone: claim.clientPhone,
      })
      .from(claim)
      .where(eq(claim.id, claimId))
      .limit(1)
    if (!claimRow) {
      return NextResponse.json({ error: "התיק לא נמצא" }, { status: 404 })
    }
    if (claimRow.plate !== payload.plate || claimRow.clientPhone !== payload.phoneE164) {
      return NextResponse.json({ error: "הקישור אינו תואם לפרטי התיק" }, { status: 403 })
    }

    const existingDocs = await db
      .select({ kind: claimDocument.kind, blobPathname: claimDocument.blobPathname })
      .from(claimDocument)
      .where(eq(claimDocument.claimId, claimId))
    const alreadyUploaded = new Set(
      existingDocs.filter((d) => Boolean(d.blobPathname)).map((d) => d.kind),
    )

    for (const kind of STEP1_REQUIRED) {
      if (!filesByKind.has(kind) && !alreadyUploaded.has(kind)) {
        return NextResponse.json(
          { error: "חסר מסמך חובה בשלב פרטי הלקוח — יש לצרף את כל ששת המסמכים" },
          { status: 400 },
        )
      }
    }

    if (liability) {
      if (!thirdPartyInsurer) {
        return NextResponse.json(
          { error: "יש למלא את שם חברת הביטוח של צד ג׳" },
          { status: 400 },
        )
      }
      const hasTpVehicle =
        filesByKind.has("vehicle_license_third_party") ||
        alreadyUploaded.has("vehicle_license_third_party")
      const hasTpDriver =
        filesByKind.has("driver_license_third_party") ||
        alreadyUploaded.has("driver_license_third_party")
      if ((!hasTpVehicle || !hasTpDriver) && !missingContact) {
        return NextResponse.json(
          {
            error:
              "יש לצרף רישיון רכב ורישיון נהיגה של צד ג׳, או למלא טלפון/מספר רכב בהיעדר מסמכים",
          },
          { status: 400 },
        )
      }
    } else {
      filesByKind.delete("vehicle_license_third_party")
      filesByKind.delete("driver_license_third_party")
    }

    // Validate every file before the first Blob/database mutation.
    for (const file of filesByKind.values()) {
      if (file.size > MAX_DOC_BYTES) {
        return NextResponse.json({ error: "הקובץ גדול מדי (מקסימום 10MB)" }, { status: 400 })
      }
      if (!file.type || !ACCEPTED_DOC_TYPES.includes(file.type)) {
        return NextResponse.json({ error: "סוג קובץ לא נתמך (PDF או תמונה)" }, { status: 400 })
      }
    }

    const uploaded: { kind: string; documentId: string; fileName: string }[] = []
    for (const kind of CLIENT_INTAKE_FILE_KINDS) {
      const file = filesByKind.get(kind)
      if (!file) continue
      uploaded.push(await saveOneFile({ claimId, kind, file }))
    }

    const summaryLines = [
      "קליטת לקוח (אשף WhatsApp):",
      `אחריות צד ג׳: ${liability ? "כן" : "לא"}`,
      liability && thirdPartyInsurer ? `חברת ביטוח צד ג׳: ${thirdPartyInsurer}` : null,
      liability && missingContact ? `פרטי השלמה בהיעדר מסמכים: ${missingContact}` : null,
      `קבצים שהתקבלו: ${uploaded.map((u) => u.kind).join(", ") || "אין"}`,
      "סטטוס: ממתין לבדיקת צוות",
    ]
      .filter(Boolean)
      .join("\n")

    await db
      .update(claimStage)
      .set({ notes: summaryLines, updatedAt: new Date() })
      .where(and(eq(claimStage.claimId, claimId), eq(claimStage.stage, 1)))

    await recordClaimEvent({
      claimId,
      partnerId: claimRow.partnerId,
      type: "client_intake_submitted",
      actorUserId: null,
      actorRole: "client",
      meta: {
        liability,
        thirdPartyInsurer: liability ? thirdPartyInsurer : null,
        missingContact: liability ? missingContact || null : null,
        uploadedKinds: uploaded.map((u) => u.kind),
        awaitingStaffReview: true,
      },
    })

    try {
      await syncClaimProgressFromDocuments(claimId)
      revalidatePath("/admin")
      revalidatePath("/dashboard")
    } catch {
      /* best-effort */
    }

    return NextResponse.json({
      ok: true,
      received: true,
      awaitingStaffReview: true,
      claimId,
      uploaded: uploaded.length,
      kinds: uploaded.map((u) => u.kind),
    })
  } catch (err) {
    console.error("[client-intake-upload] failed:", err instanceof Error ? err.message : String(err))
    const message = err instanceof Error ? err.message : "העלאה נכשלה, נסו שוב"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
