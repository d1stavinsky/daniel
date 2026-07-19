/**
 * Shared claim creation (Stage 0 / Intake scaffolding).
 * Used by admin web form and WhatsApp Intake webhook — no session required here.
 */

import { randomUUID } from "crypto"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { claim, claimDocument, claimStage, financialTransaction, partner } from "@/lib/db/schema"
import { REQUIRED_DOCS } from "@/lib/documents"
import { normalizePlate } from "@/lib/validation"
import { freshLedger } from "@/lib/workflow-data"
import { recordClaimEvent } from "@/lib/claim-events"

const CLAIM_ID_BASE = 1000
const CREATE_CLAIM_MAX_ATTEMPTS = 5

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err
  while (current && typeof current === "object") {
    const code = (current as { code?: string }).code
    if (code === "23505") return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type ClaimWriter = Pick<typeof db, "select" | "insert"> | DbTx

async function nextClaimId(writer: ClaimWriter = db): Promise<string> {
  const rows = await writer.select({ id: claim.id }).from(claim)
  let max = CLAIM_ID_BASE
  for (const r of rows) {
    const n = Number.parseInt(r.id.replace(/\D/g, ""), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `CLM-${max + 1}`
}

export type CreateClaimRecordInput = {
  clientName: string
  /** Permanent customer name; defaults to clientName for non-WhatsApp callers. */
  customerName?: string
  plate: string
  carModel?: string
  partnerId: string
  /** May be 0 for WhatsApp intake placeholders — staff fills later. */
  requestedAmount: number
  /** Client mobile (E.164 digits) when opened via WhatsApp. */
  clientPhone?: string | null
  source?: "admin" | "whatsapp"
}

export type CreateClaimActor = {
  id: string
  name: string
}

export type CreateClaimRecordResult = {
  claimId: string
  plate: string
  partnerId: string
}

/**
 * Insert claim + 9-stage ledger + 14 pending docs + financial "created" row.
 * Caller must validate partner / auth / schema before invoking.
 */
export async function createClaimRecord(
  input: CreateClaimRecordInput,
  actor: CreateClaimActor,
): Promise<CreateClaimRecordResult> {
  const [p] = await db.select().from(partner).where(eq(partner.id, input.partnerId)).limit(1)
  if (!p) throw new Error("השותף לא נמצא.")
  if (p.status !== "active") throw new Error("לא ניתן לפתוח תיק לשותף מושבת.")

  const now = new Date()
  const clientName = input.clientName.trim()
  const customerName = input.customerName?.trim() || clientName
  const plate = normalizePlate(input.plate)
  const carModel = (input.carModel || "").trim() || "—"
  const partnerId = input.partnerId
  const requestedAmount = Number.isFinite(input.requestedAmount) ? input.requestedAmount : 0
  const source = input.source ?? "admin"
  const clientPhone = input.clientPhone?.trim() || null

  let createdId: string | null = null

  for (let attempt = 0; attempt < CREATE_CLAIM_MAX_ATTEMPTS; attempt++) {
    try {
      createdId = await db.transaction(async (tx) => {
        const id = await nextClaimId(tx)

        await tx.insert(claim).values({
          id,
          clientName,
          customerName,
          plate,
          carModel,
          partnerId,
          currentStage: 1,
          requestedAmount,
          receivedAmount: 0,
          fundsReleased: false,
          status: "open",
          stageEnteredAt: now,
          createdBy: actor.id,
          contributors: "[]",
          clientPhone,
          intakeSource: source,
          createdAt: now,
          updatedAt: now,
        })

        await tx.insert(claimStage).values(
          freshLedger().map((s) => ({
            id: randomUUID(),
            claimId: id,
            stage: s.stage,
            status: s.status,
            notes: "",
            updatedAt: now,
          })),
        )

        await tx.insert(claimDocument).values(
          REQUIRED_DOCS.map((d) => ({
            id: randomUUID(),
            claimId: id,
            partnerId,
            kind: d.kind,
            status: "pending" as const,
            note: "",
            updatedAt: now,
            createdAt: now,
          })),
        )

        await tx.insert(financialTransaction).values({
          id: randomUUID(),
          claimId: id,
          partnerId,
          kind: "created",
          amount: requestedAmount,
          previousAmount: null,
          note: source === "whatsapp" ? "פתיחת תיק תביעה (WhatsApp)" : "פתיחת תיק תביעה",
          performedBy: actor.id,
          performedByName: actor.name,
          createdAt: now,
        })

        return id
      })
      break
    } catch (err) {
      if (isUniqueViolation(err) && attempt < CREATE_CLAIM_MAX_ATTEMPTS - 1) {
        continue
      }
      throw err instanceof Error ? err : new Error("פתיחת התיק נכשלה.")
    }
  }

  if (!createdId) throw new Error("פתיחת התיק נכשלה.")

  await recordClaimEvent({
    claimId: createdId,
    partnerId,
    type: "claim_created",
    actorUserId: actor.id.startsWith("system:") ? null : actor.id,
    actorRole: source === "whatsapp" ? "system" : "admin",
    meta: { source, plate, clientPhone, customerName },
  })

  return { claimId: createdId, plate, partnerId }
}
