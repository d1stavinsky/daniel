import { type NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { put, del } from "@vercel/blob"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { claimDocument } from "@/lib/db/schema"
import { getSessionUser } from "@/lib/session"
import {
  ACCEPTED_DOC_TYPES,
  DOC_KINDS,
  MAX_DOC_BYTES,
  docAllowsMultiple,
  type DocKind,
} from "@/lib/documents"
import { recordClaimEvent } from "@/lib/claim-events"
import { syncClaimProgressFromDocuments } from "@/lib/sync-claim-progress"
import { assertPreviousWorkflowStagesValidated } from "@/lib/document-workflow-gates"
import { assertDemandStageClear, DEMAND_LETTER_KIND, SIGNATURE_VERIFIED } from "@/lib/demand-letter"
import {
  DemandLetterVersionMismatchError,
  gateDemandLetterSignedUpload,
} from "@/lib/demand-letter-upload"

/** Allow multi-file Blob uploads to finish on Vercel (default is often too short). */
export const maxDuration = 120

const BLOB_PUT_TIMEOUT_MS = 90_000

function log(step: string, detail?: unknown) {
  if (detail !== undefined) {
    console.log(`[upload] ${step}`, detail)
  } else {
    console.log(`[upload] ${step}`)
  }
}

/**
 * Admin-only document upload. Accepts one or many files (`file` and/or `files`).
 * Multi-file kinds (e.g. accident photos) append rows; single-file kinds replace.
 */
export async function POST(request: NextRequest) {
  log("1.request.start")
  try {
    const user = await getSessionUser()
    log("2.auth.checked", { hasUser: Boolean(user), role: user?.role ?? null })
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    log("3.formData.parsing")
    const formData = await request.formData()
    const claimId = String(formData.get("claimId") ?? "")
    const kind = String(formData.get("kind") ?? "") as DocKind

    const rawFiles: File[] = []
    for (const entry of formData.getAll("files")) {
      if (entry instanceof File && entry.size > 0) rawFiles.push(entry)
    }
    const single = formData.get("file")
    if (single instanceof File && single.size > 0) rawFiles.push(single)

    log("4.files.received", {
      claimId,
      kind,
      count: rawFiles.length,
      sizes: rawFiles.map((f) => ({ name: f.name, size: f.size, type: f.type })),
    })

    if (rawFiles.length === 0) {
      return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 })
    }
    if (!claimId || !DOC_KINDS.includes(kind)) {
      return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 })
    }

    const allowsMultiple = docAllowsMultiple(kind)
    const files = allowsMultiple ? rawFiles : rawFiles.slice(0, 1)

    for (const file of files) {
      if (file.size > MAX_DOC_BYTES) {
        return NextResponse.json({ error: "הקובץ גדול מדי (מקסימום 10MB)" }, { status: 400 })
      }
      if (!file.type || !ACCEPTED_DOC_TYPES.includes(file.type)) {
        return NextResponse.json({ error: "סוג קובץ לא נתמך" }, { status: 400 })
      }
    }

    log("5.db.lookupExisting")
    const existing = await db
      .select()
      .from(claimDocument)
      .where(and(eq(claimDocument.claimId, claimId), eq(claimDocument.kind, kind)))

    if (existing.length === 0) {
      log("5b.db.notFound")
      return NextResponse.json({ error: "מסמך לא נמצא" }, { status: 404 })
    }

    try {
      await assertDemandStageClear(claimId, kind)
      await assertPreviousWorkflowStagesValidated(claimId, kind)
    } catch (gateErr) {
      const message = gateErr instanceof Error ? gateErr.message : "לא ניתן לדלג על שלבים"
      log("5c.workflow.blocked", { claimId, kind, message })
      return NextResponse.json({ error: message }, { status: 409 })
    }

    const partnerId = existing[0]!.partnerId
    const emptySlots = existing.filter((r) => !r.blobPathname)
    const now = new Date()
    let emptyIdx = 0
    let uploaded = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!
      log(`6.blob.put.start`, { index: i + 1, total: files.length, name: file.name, size: file.size })

      const safeName = file.name.replace(/[^\w.\-\u0590-\u05FF]/g, "_")
      const pathname = `documents/${partnerId}/${claimId}/${kind}-${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`

      let blob: { pathname: string }
      try {
        blob = await put(pathname, file, {
          access: "private",
          abortSignal: AbortSignal.timeout(BLOB_PUT_TIMEOUT_MS),
        })
        log(`6.blob.put.ok`, { index: i + 1, pathname: blob.pathname })
      } catch (blobErr) {
        const msg = blobErr instanceof Error ? blobErr.message : String(blobErr)
        log(`6.blob.put.fail`, { index: i + 1, error: msg })
        return NextResponse.json(
          {
            error:
              uploaded > 0
                ? `חלק מהקבצים הועלו (${uploaded}), ואז ההעלאה נכשלה: ${file.name}`
                : "העלאה לשרת הקבצים נכשלה או פג הזמן. נסה שוב.",
            uploaded,
          },
          { status: 504 },
        )
      }

      const payload = {
        status: "uploaded" as const,
        blobPathname: blob.pathname,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || "application/octet-stream",
        uploadedBy: user.id,
        note: "",
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
        ...(kind === DEMAND_LETTER_KIND ? { signatureStatus: SIGNATURE_VERIFIED } : {}),
      }

      try {
        let documentId: string
        if (!allowsMultiple) {
          const target = emptySlots[0] ?? existing[0]!
          documentId = target.id

          if (kind === DEMAND_LETTER_KIND) {
            try {
              await gateDemandLetterSignedUpload({
                claimId,
                documentId,
                partnerId,
                blobPathname: blob.pathname,
                contentType: file.type || "application/octet-stream",
                fileName: file.name,
                actorUserId: user.id,
              })
            } catch (gateErr) {
              if (gateErr instanceof DemandLetterVersionMismatchError) {
                try {
                  await del(blob.pathname)
                } catch {
                  /* ignore */
                }
                return NextResponse.json({ error: gateErr.message }, { status: 409 })
              }
              throw gateErr
            }
          }

          if (target.blobPathname && target.blobPathname !== blob.pathname) {
            try {
              await del(target.blobPathname)
            } catch {
              /* best-effort */
            }
          }
          await db
            .update(claimDocument)
            .set(payload)
            .where(and(eq(claimDocument.id, target.id), eq(claimDocument.partnerId, partnerId)))
          documentId = target.id

          const extras = existing.filter((r) => r.id !== target.id)
          for (const extra of extras) {
            if (extra.blobPathname) {
              try {
                await del(extra.blobPathname)
              } catch {
                /* best-effort */
              }
            }
            await db.delete(claimDocument).where(eq(claimDocument.id, extra.id))
          }
        } else if (emptyIdx < emptySlots.length) {
          const slot = emptySlots[emptyIdx]!
          emptyIdx += 1
          await db
            .update(claimDocument)
            .set(payload)
            .where(and(eq(claimDocument.id, slot.id), eq(claimDocument.partnerId, partnerId)))
          documentId = slot.id
        } else {
          documentId = randomUUID()
          await db.insert(claimDocument).values({
            id: documentId,
            claimId,
            partnerId,
            kind,
            ...payload,
            createdAt: now,
          })
        }
        uploaded += 1
        log(`7.db.saved`, { index: i + 1, uploaded, documentId })
        await recordClaimEvent({
          claimId,
          partnerId,
          type: "doc_uploaded",
          actorUserId: user.id,
          actorRole: user.role,
          documentId,
          documentKind: kind,
          meta: { fileName: file.name, fileSize: file.size, contentType: file.type },
        })
        try {
          const { enqueueDocumentExtraction } = await import("@/lib/idp/pipeline")
          enqueueDocumentExtraction(documentId, kind)
        } catch (idpErr) {
          log("7.idp.enqueue.skip", idpErr instanceof Error ? idpErr.message : String(idpErr))
        }
      } catch (dbErr) {
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr)
        log(`7.db.fail`, { index: i + 1, error: msg })
        // Best-effort cleanup of orphaned blob
        try {
          await del(blob.pathname)
        } catch {
          /* ignore */
        }
        return NextResponse.json(
          {
            error:
              msg.includes("unique") || msg.includes("duplicate")
                ? "שגיאת מסד נתונים: ייתכן שעדיין קיים אילוץ uniqueness על סוג המסמך. הרץ את scripts/migrate-p0.sql."
                : "שמירת המסמך במסד הנתונים נכשלה. נסה שוב.",
            uploaded,
          },
          { status: 500 },
        )
      }
    }

    log("8.syncProgress.start")
    try {
      await syncClaimProgressFromDocuments(claimId)
      log("8.syncProgress.ok")
    } catch (syncErr) {
      // Files are saved — don't fail the whole upload because progress sync failed.
      log("8.syncProgress.fail", syncErr instanceof Error ? syncErr.message : String(syncErr))
    }

    try {
      revalidatePath("/admin")
      revalidatePath("/dashboard")
    } catch (revalErr) {
      log("9.revalidate.fail", revalErr instanceof Error ? revalErr.message : String(revalErr))
    }

    log("10.done", { uploaded: files.length })
    return NextResponse.json({ ok: true, uploaded: files.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[upload] FATAL", message, err instanceof Error ? err.stack : undefined)
    return NextResponse.json({ error: "העלאה נכשלה, נסה שוב" }, { status: 500 })
  }
}
