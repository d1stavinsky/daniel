"use server"

import { randomUUID } from "crypto"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { del } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { claim, claimStage, claimDocument, claimEvent, documentJob, financialTransaction, partner, notification, user, inboundEmail } from "@/lib/db/schema"
import { requireAdmin, requirePartner, requireStaff, requireUser } from "@/lib/session"
import { findClaimAccess } from "@/lib/tenant"
import { toMoneyNumber } from "@/lib/claims-data"
import { createClaimSchema, setAmountsSchema, stageNotesSchema, zodErrorMessage } from "@/lib/schemas"
import { toUserError } from "@/lib/action-result"
import {
  deriveClaimProgressStatus,
  progressStatusToStage,
  REQUIRED_DOC_COUNT,
  DOC_KINDS,
  type ClaimProgressStatus,
} from "@/lib/claim-progress"
import {
  STAGES,
  canTransition,
  type StepStatus,
  type WorkflowClaim,
} from "@/lib/workflow-data"
import {
  deriveClaimVerification,
  emptyVerificationState,
  type ClaimVerificationState,
  type VerificationDocSignal,
} from "@/lib/claim-verification"
import { syncClaimProgressFromDocuments } from "@/lib/sync-claim-progress"
import { countValidatedDocKindsFromRows, countValidatedDocs } from "@/lib/document-workflow-gates"
import { assertDemandStageClear } from "@/lib/demand-letter"
import { assertNoOpenInternalAudit } from "@/lib/stp/cross-field"
import { recordClaimEvent } from "@/lib/claim-events"
import { createClaimRecord } from "@/lib/claims/create-claim-record"

const DAY_MS = 86_400_000
const LEGACY_LIST_CAP = 500

type ClaimRow = typeof claim.$inferSelect
type StageRow = typeof claimStage.$inferSelect

function daysBetween(from: Date, to = new Date()): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS))
}

function formatHebrewDate(d: Date): string {
  return d.toLocaleDateString("he-IL").replaceAll("/", ".")
}

function parseContributors(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v) => v.length > 0)
  } catch {
    return []
  }
}

function serializeContributors(names: string[]): string {
  return JSON.stringify(names)
}

/** Assemble a WorkflowClaim from its DB rows + document verification state. */
function mapClaim(
  row: ClaimRow,
  stages: StageRow[],
  partnerNameById: Map<string, string>,
  uploadedDocCount: number,
  verification: ClaimVerificationState = emptyVerificationState(),
  creatorNameById: Map<string, string> = new Map(),
): WorkflowClaim {
  const steps = STAGES.map((s) => {
    const cell = stages.find((st) => st.stage === s.id)
    return {
      stage: s.id,
      status: (cell?.status as StepStatus) ?? "pending",
      notes: cell?.notes ?? "",
      docs: [] as string[],
    }
  })
  const paymentConfirmed = Boolean(row.paymentConfirmedAt)
  const progressStatus = deriveClaimProgressStatus(uploadedDocCount, paymentConfirmed)
  const createdById = row.createdBy

  let createdByName = "—"
  if (createdById) {
    const fromMap = creatorNameById.get(createdById)
    if (fromMap) {
      createdByName = fromMap
    } else if (createdById.length > 8) {
      createdByName = createdById.slice(0, 8)
    } else {
      createdByName = createdById
    }
  }

  return {
    id: row.id,
    clientName: row.clientName,
    customerName: row.customerName,
    clientPhone: row.clientPhone,
    plate: row.plate,
    carModel: row.carModel,
    partnerId: row.partnerId,
    partnerName: partnerNameById.get(row.partnerId) ?? "—",
    currentStage: progressStatusToStage(progressStatus),
    steps,
    requestedAmount: toMoneyNumber(row.requestedAmount),
    receivedAmount: toMoneyNumber(row.receivedAmount),
    date: formatHebrewDate(row.createdAt),
    createdAt: row.createdAt.toISOString(),
    createdBy: createdById,
    createdByName,
    contributors: parseContributors(row.contributors),
    daysInStage: daysBetween(row.stageEnteredAt),
    fundsReleased: row.fundsReleased,
    paymentConfirmed: Boolean(row.paymentConfirmedAt),
    paymentConfirmedAt: row.paymentConfirmedAt?.toISOString() ?? null,
    closed: row.status === "closed",
    progressStatus,
    uploadedDocCount,
    requiredDocCount: REQUIRED_DOC_COUNT,
    verification,
  }
}

async function partnerNameMap(partnerIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (partnerIds.length === 0) return map
  const rows = await db
    .select({ id: partner.id, name: partner.businessName })
    .from(partner)
    .where(inArray(partner.id, Array.from(new Set(partnerIds))))
  for (const r of rows) map.set(r.id, r.name)
  return map
}

async function userNameMap(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = Array.from(new Set(userIds.filter(Boolean)))
  if (unique.length === 0) return map
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, unique))
  for (const r of rows) map.set(r.id, r.name)
  return map
}

/** Count distinct mandatory kinds validated for claim progress per claim. */
async function validatedDocCountsForClaims(claimIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (const id of claimIds) map.set(id, 0)
  if (claimIds.length === 0) return map

  const rows = await db
    .select({
      claimId: claimDocument.claimId,
      kind: claimDocument.kind,
      status: claimDocument.status,
      blobPathname: claimDocument.blobPathname,
      stpStatus: claimDocument.stpStatus,
      signatureStatus: claimDocument.signatureStatus,
    })
    .from(claimDocument)
    .where(and(inArray(claimDocument.claimId, claimIds), inArray(claimDocument.kind, DOC_KINDS)))

  const byClaim = new Map<string, typeof rows>()
  for (const row of rows) {
    const list = byClaim.get(row.claimId) ?? []
    list.push(row)
    byClaim.set(row.claimId, list)
  }

  for (const [claimId, claimRows] of byClaim) {
    map.set(claimId, countValidatedDocKindsFromRows(claimRows))
  }
  return map
}

/**
 * Load verification signals from claim_document for the given claims,
 * then derive green / yellow / red tones from STP + IDP + status.
 */
async function verificationForClaims(
  claimIds: string[],
): Promise<Map<string, ClaimVerificationState>> {
  const map = new Map<string, ClaimVerificationState>()
  for (const id of claimIds) map.set(id, emptyVerificationState())
  if (claimIds.length === 0) return map

  const rows = await db
    .select({
      claimId: claimDocument.claimId,
      kind: claimDocument.kind,
      status: claimDocument.status,
      blobPathname: claimDocument.blobPathname,
      extractionStatus: claimDocument.extractionStatus,
      extractionConfidence: claimDocument.extractionConfidence,
      stpStatus: claimDocument.stpStatus,
    })
    .from(claimDocument)
    .where(and(inArray(claimDocument.claimId, claimIds), inArray(claimDocument.kind, DOC_KINDS)))

  const byClaim = new Map<string, VerificationDocSignal[]>()
  for (const r of rows) {
    const signal: VerificationDocSignal = {
      kind: r.kind,
      status: r.status,
      hasFile: Boolean(r.blobPathname),
      extractionStatus: r.extractionStatus ?? "none",
      extractionConfidence: r.extractionConfidence,
      stpStatus: r.stpStatus ?? "none",
    }
    const list = byClaim.get(r.claimId) ?? []
    list.push(signal)
    byClaim.set(r.claimId, list)
  }

  for (const id of claimIds) {
    map.set(id, deriveClaimVerification(byClaim.get(id) ?? []))
  }
  return map
}

/** Load the stage ledgers for a set of claim ids. */
async function stagesForClaims(claimIds: string[]): Promise<Map<string, StageRow[]>> {
  const map = new Map<string, StageRow[]>()
  if (claimIds.length === 0) return map
  const rows = await db
    .select()
    .from(claimStage)
    .where(inArray(claimStage.claimId, claimIds))
    .orderBy(asc(claimStage.stage))
  for (const r of rows) {
    const list = map.get(r.claimId) ?? []
    list.push(r)
    map.set(r.claimId, list)
  }
  return map
}

// --- Reads -----------------------------------------------------------------

export type ClaimsListFilters = {
  page?: number
  pageSize?: number
  query?: string
  partnerId?: string
  progressStatus?: ClaimProgressStatus | "all"
}

export type ClaimsDashboardStats = {
  totalClaims: number
  openClaims: number
  byProgress: Record<ClaimProgressStatus, number>
  financialBuckets: ReturnType<typeof import("@/lib/workflow-data").financialBuckets>
  byPartner: { partnerId: string; partnerName: string; totalRequested: number }[]
}

/** Paginated claims list — staff sees all tenants; partners see own org only. */
export async function listClaimsPaginated(
  filters: ClaimsListFilters = {},
): Promise<import("@/lib/pagination").PaginatedResult<WorkflowClaim>> {
  const { clampPagination, paginated } = await import("@/lib/pagination")
  const user = await requireUser()
  const { page, pageSize, offset } = clampPagination(filters)

  const conditions = []
  if (user.role === "partner") {
    if (!user.partnerId) throw new Error("Forbidden")
    conditions.push(eq(claim.partnerId, user.partnerId))
  } else if (filters.partnerId && filters.partnerId !== "all") {
    conditions.push(eq(claim.partnerId, filters.partnerId))
  }

  const q = filters.query?.trim()
  if (q) {
    conditions.push(
      sql`(
        ${claim.id} ilike ${`%${q}%`} or
        ${claim.clientName} ilike ${`%${q}%`} or
        ${claim.customerName} ilike ${`%${q}%`} or
        ${claim.plate} ilike ${`%${q}%`}
      )`,
    )
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [countRow] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(claim)
    .where(whereClause)
  const total = Number(countRow?.n ?? 0)

  const rows = await db
    .select()
    .from(claim)
    .where(whereClause)
    .orderBy(desc(claim.createdAt))
    .limit(pageSize)
    .offset(offset)

  const ids = rows.map((r) => r.id)
  const [stageMap, nameMap, docCounts, verificationMap, creatorMap] = await Promise.all([
    stagesForClaims(ids),
    partnerNameMap(rows.map((r) => r.partnerId)),
    validatedDocCountsForClaims(ids),
    verificationForClaims(ids),
    userNameMap(rows.map((r) => r.createdBy)),
  ])

  let items = rows.map((r) =>
    mapClaim(
      r,
      stageMap.get(r.id) ?? [],
      nameMap,
      docCounts.get(r.id) ?? 0,
      verificationMap.get(r.id) ?? emptyVerificationState(),
      creatorMap,
    ),
  )

  if (filters.progressStatus && filters.progressStatus !== "all") {
    items = items.filter((c) => c.progressStatus === filters.progressStatus)
  }

  return paginated(items, total, page, pageSize)
}

/** Aggregate stats for admin overview (no full-table scan in UI). */
export async function getClaimsDashboardStats(): Promise<ClaimsDashboardStats> {
  const user = await requireUser()
  if (user.role === "partner") throw new Error("Forbidden")

  const rows = await db
    .select({
      id: claim.id,
      status: claim.status,
      partnerId: claim.partnerId,
      requestedAmount: claim.requestedAmount,
      receivedAmount: claim.receivedAmount,
      fundsReleased: claim.fundsReleased,
      paymentConfirmedAt: claim.paymentConfirmedAt,
    })
    .from(claim)

  const ids = rows.map((r) => r.id)
  const docCounts = await validatedDocCountsForClaims(ids)
  const nameMap = await partnerNameMap(rows.map((r) => r.partnerId))

  const byProgress: Record<ClaimProgressStatus, number> = {
    pending: 0,
    in_progress: 0,
    pending_resolution: 0,
    completed: 0,
  }

  const workflowClaims: WorkflowClaim[] = rows.map((r) => {
    const uploadedDocCount = docCounts.get(r.id) ?? 0
    const progressStatus = deriveClaimProgressStatus(
      uploadedDocCount,
      Boolean(r.paymentConfirmedAt),
    )
    byProgress[progressStatus] += 1
    return {
      id: r.id,
      clientName: "",
      customerName: "",
      clientPhone: null,
      plate: "",
      carModel: "",
      partnerId: r.partnerId,
      partnerName: nameMap.get(r.partnerId) ?? "—",
      currentStage: 1,
      steps: [],
      requestedAmount: toMoneyNumber(r.requestedAmount),
      receivedAmount: toMoneyNumber(r.receivedAmount),
      date: "",
      createdAt: "",
      createdBy: "",
      createdByName: "—",
      contributors: [],
      daysInStage: 0,
      fundsReleased: r.fundsReleased,
      paymentConfirmed: Boolean(r.paymentConfirmedAt),
      paymentConfirmedAt: r.paymentConfirmedAt?.toISOString() ?? null,
      closed: r.status === "closed",
      progressStatus,
      uploadedDocCount,
      requiredDocCount: REQUIRED_DOC_COUNT,
      verification: emptyVerificationState(),
    }
  })

  const { financialBuckets } = await import("@/lib/workflow-data")

  const partnerTotals = new Map<string, number>()
  for (const c of workflowClaims) {
    partnerTotals.set(c.partnerId, (partnerTotals.get(c.partnerId) ?? 0) + c.requestedAmount)
  }
  const byPartner = [...partnerTotals.entries()]
    .map(([partnerId, totalRequested]) => ({
      partnerId,
      partnerName: nameMap.get(partnerId) ?? "—",
      totalRequested,
    }))
    .sort((a, b) => b.totalRequested - a.totalRequested)

  return {
    totalClaims: rows.length,
    openClaims: rows.filter((r) => r.status !== "closed").length,
    byProgress,
    financialBuckets: financialBuckets(workflowClaims),
    byPartner,
  }
}

/** All claims across all tenants (staff). @deprecated Use listClaimsPaginated */
export async function getAdminClaims(): Promise<WorkflowClaim[]> {
  await requireStaff()
  const result = await listClaimsPaginated({ page: 1, pageSize: LEGACY_LIST_CAP })
  return result.items
}

/** Claims for the signed-in partner ONLY — strict tenant isolation. */
export async function getPartnerClaims(): Promise<WorkflowClaim[]> {
  const result = await listClaimsPaginated({ page: 1, pageSize: LEGACY_LIST_CAP })
  return result.items
}

/** A single claim, scoped: admins see any, partners only their own (partnerId in WHERE). */
export async function getClaimById(id: string): Promise<WorkflowClaim | null> {
  const access = await findClaimAccess(id)
  if (!access) return null
  const [row] = await db
    .select()
    .from(claim)
    .where(and(eq(claim.id, access.claimId), eq(claim.partnerId, access.partnerId)))
    .limit(1)
  if (!row) return null
  const [stageMap, nameMap, docCounts, verificationMap, creatorMap] = await Promise.all([
    stagesForClaims([access.claimId]),
    partnerNameMap([access.partnerId]),
    validatedDocCountsForClaims([access.claimId]),
    verificationForClaims([access.claimId]),
    userNameMap([row.createdBy]),
  ])
  return mapClaim(
    row,
    stageMap.get(access.claimId) ?? [],
    nameMap,
    docCounts.get(access.claimId) ?? 0,
    verificationMap.get(access.claimId) ?? emptyVerificationState(),
    creatorMap,
  )
}

/** Partner options for the admin "new claim" dropdown. */
export async function getPartnerOptions(): Promise<{ id: string; name: string }[]> {
  await requireStaff()
  const rows = await db
    .select({ id: partner.id, name: partner.businessName })
    .from(partner)
    .where(eq(partner.status, "active"))
    .orderBy(asc(partner.businessName))
  return rows
}

export type TransactionRow = {
  id: string
  kind: string
  amount: number
  previousAmount: number | null
  note: string
  performedByName: string
  createdAt: string
}

/** Audit trail for a claim, scoped by tenant in SQL. */
export async function getTransactions(claimId: string): Promise<TransactionRow[]> {
  const access = await findClaimAccess(claimId)
  if (!access) return []
  const rows = await db
    .select()
    .from(financialTransaction)
    .where(
      and(
        eq(financialTransaction.claimId, access.claimId),
        eq(financialTransaction.partnerId, access.partnerId),
      ),
    )
    .orderBy(desc(financialTransaction.createdAt))
  return rows.map((t) => ({
    id: t.id,
    kind: t.kind,
    amount: t.amount,
    previousAmount: t.previousAmount,
    note: t.note,
    performedByName: t.performedByName,
    createdAt: t.createdAt.toISOString(),
  }))
}

// --- Admin mutations (full CRUD) -------------------------------------------

export type CreateClaimInput = {
  clientName: string
  plate: string
  carModel: string
  partnerId: string
  requestedAmount: number
}

export async function createClaim(input: CreateClaimInput): Promise<WorkflowClaim> {
  const admin = await requireAdmin()

  const parsed = createClaimSchema.safeParse(input)
  if (!parsed.success) throw new Error(zodErrorMessage(parsed.error))

  const { claimId: createdId } = await createClaimRecord(
    {
      clientName: parsed.data.clientName,
      plate: parsed.data.plate,
      carModel: parsed.data.carModel || "—",
      partnerId: parsed.data.partnerId,
      requestedAmount: parsed.data.requestedAmount,
      source: "admin",
    },
    { id: admin.id, name: admin.name },
  )

  revalidatePath("/admin")
  revalidatePath("/dashboard")
  const created = await getClaimById(createdId)
  if (!created) throw new Error("פתיחת התיק נכשלה.")
  return created
}

/** @deprecated Document checklist owns claim progress (P0). Stage cells are notes-only. */
export async function setStageStatus(claimId: string, stage: number, target: StepStatus): Promise<WorkflowClaim> {
  await requireAdmin()
  const [row] = await db.select().from(claim).where(eq(claim.id, claimId)).limit(1)
  if (!row) throw new Error("Claim not found")

  const stageRows = await db.select().from(claimStage).where(eq(claimStage.claimId, claimId)).orderBy(asc(claimStage.stage))
  const steps = STAGES.map((s) => ({
    stage: s.id,
    status: (stageRows.find((r) => r.stage === s.id)?.status as StepStatus) ?? "pending",
    notes: stageRows.find((r) => r.stage === s.id)?.notes ?? "",
    docs: [] as string[],
  }))

  if (!canTransition(steps, stage, target)) {
    throw new Error("מעבר שלב לא חוקי — יש להשלים שלבים לפי הסדר.")
  }

  const now = new Date()
  // Update the ledger cell only — never overwrite claim.currentStage / status here.
  await db
    .update(claimStage)
    .set({ status: target, updatedAt: now })
    .where(and(eq(claimStage.claimId, claimId), eq(claimStage.stage, stage)))

  // Re-assert document-driven progress as the single source of truth.
  await syncClaimProgressFromDocuments(claimId)

  revalidatePath("/admin")
  revalidatePath("/dashboard")
  const updated = await getClaimById(claimId)
  if (!updated) throw new Error("עדכון התיק נכשל.")
  return updated
}

/** Update the internal (admin-only) note on a stage. */
export async function setStageNotes(claimId: string, stage: number, notes: string): Promise<WorkflowClaim> {
  await requireAdmin()
  const parsed = stageNotesSchema.safeParse({ claimId, stage, notes })
  if (!parsed.success) throw new Error(zodErrorMessage(parsed.error))

  const now = new Date()
  await db
    .update(claimStage)
    .set({ notes: parsed.data.notes, updatedAt: now })
    .where(and(eq(claimStage.claimId, parsed.data.claimId), eq(claimStage.stage, parsed.data.stage)))
  revalidatePath("/admin")
  revalidatePath("/dashboard")
  const updated = await getClaimById(parsed.data.claimId)
  if (!updated) throw new Error("עדכון התיק נכשל.")
  return updated
}

/** Edit requested / received amounts, appending audit rows for any change. */
export async function setAmounts(claimId: string, requested: number, received: number): Promise<WorkflowClaim> {
  console.log("[setAmounts] raw args", {
    claimId,
    requested,
    received,
    requestedType: typeof requested,
    receivedType: typeof received,
  })

  const admin = await requireAdmin()

  // Explicit decimal coercion — never rely on integer truncation.
  const requestedMoney = toMoneyNumber(requested)
  const receivedMoney = toMoneyNumber(received)
  console.log("[setAmounts] coerced money", { requestedMoney, receivedMoney })

  const parsed = setAmountsSchema.safeParse({
    claimId,
    requested: requestedMoney,
    received: receivedMoney,
  })
  if (!parsed.success) {
    console.log("[setAmounts] zod rejected", parsed.error.flatten())
    throw new Error(zodErrorMessage(parsed.error))
  }

  const [row] = await db.select().from(claim).where(eq(claim.id, parsed.data.claimId)).limit(1)
  if (!row) throw new Error("התיק לא נמצא.")

  const prevRequested = toMoneyNumber(row.requestedAmount)
  const prevReceived = toMoneyNumber(row.receivedAmount)
  console.log("[setAmounts] db before", {
    claimId: row.id,
    prevRequested,
    prevReceived,
    rawRequested: row.requestedAmount,
    rawReceived: row.receivedAmount,
  })

  const now = new Date()
  const txs: (typeof financialTransaction.$inferInsert)[] = []
  if (parsed.data.requested !== prevRequested) {
    txs.push({
      id: randomUUID(),
      claimId: parsed.data.claimId,
      partnerId: row.partnerId,
      kind: "requested_set",
      amount: parsed.data.requested,
      previousAmount: prevRequested,
      note: "עדכון סכום נדרש",
      performedBy: admin.id,
      performedByName: admin.name,
      createdAt: now,
    })
  }
  if (parsed.data.received !== prevReceived) {
    txs.push({
      id: randomUUID(),
      claimId: parsed.data.claimId,
      partnerId: row.partnerId,
      kind: "received_set",
      amount: parsed.data.received,
      previousAmount: prevReceived,
      note: "עדכון סכום שהתקבל",
      performedBy: admin.id,
      performedByName: admin.name,
      createdAt: now,
    })
  }

  await db.transaction(async (tx) => {
    await tx
      .update(claim)
      .set({
        requestedAmount: parsed.data.requested,
        receivedAmount: parsed.data.received,
        updatedAt: now,
      })
      .where(eq(claim.id, parsed.data.claimId))
    if (txs.length > 0) await tx.insert(financialTransaction).values(txs)
  })

  const [after] = await db
    .select({
      requestedAmount: claim.requestedAmount,
      receivedAmount: claim.receivedAmount,
    })
    .from(claim)
    .where(eq(claim.id, parsed.data.claimId))
    .limit(1)
  console.log("[setAmounts] db after", {
    requestedAmount: after?.requestedAmount,
    receivedAmount: after?.receivedAmount,
    asNumberRequested: toMoneyNumber(after?.requestedAmount),
    asNumberReceived: toMoneyNumber(after?.receivedAmount),
    auditRows: txs.length,
  })

  revalidatePath("/admin")
  revalidatePath("/dashboard")
  const updated = await getClaimById(parsed.data.claimId)
  if (!updated) throw new Error("עדכון התיק נכשל.")
  console.log("[setAmounts] returning", {
    requestedAmount: updated.requestedAmount,
    receivedAmount: updated.receivedAmount,
  })
  return updated
}

/** Toggle whether matched funds have been released to the partner. */
export async function toggleFunds(claimId: string): Promise<WorkflowClaim> {
  const admin = await requireAdmin()
  if (!claimId) throw new Error("מזהה תיק חסר.")
  const [row] = await db.select().from(claim).where(eq(claim.id, claimId)).limit(1)
  if (!row) throw new Error("התיק לא נמצא.")

  const next = !row.fundsReleased
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx.update(claim).set({ fundsReleased: next, updatedAt: now }).where(eq(claim.id, claimId))
    await tx.insert(financialTransaction).values({
      id: randomUUID(),
      claimId,
      partnerId: row.partnerId,
      kind: next ? "funds_released" : "funds_held",
      amount: row.receivedAmount,
      previousAmount: null,
      note: next ? "שחרור כספים לשותף" : "עצירת העברת כספים",
      performedBy: admin.id,
      performedByName: admin.name,
      createdAt: now,
    })
  })

  revalidatePath("/admin")
  revalidatePath("/dashboard")
  const updated = await getClaimById(claimId)
  if (!updated) throw new Error("עדכון התיק נכשל.")
  return updated
}

/**
 * Stage 6 gate: manually confirm compensation received, then close the claim.
 * Requires all mandatory docs validated and receivedAmount > 0.
 */
export async function confirmPaymentReceived(claimId: string): Promise<WorkflowClaim> {
  const admin = await requireStaff()
  if (!claimId) throw new Error("מזהה תיק חסר.")

  const [row] = await db.select().from(claim).where(eq(claim.id, claimId)).limit(1)
  if (!row) throw new Error("התיק לא נמצא.")
  if (row.paymentConfirmedAt) throw new Error("התקבול כבר אושר.")

  const validatedDocCount = await countValidatedDocs(claimId)
  if (validatedDocCount < REQUIRED_DOC_COUNT) {
    throw new Error("לא ניתן לאשר תקבול לפני אימות כל המסמכים הנדרשים.")
  }

  await assertDemandStageClear(claimId)
  await assertNoOpenInternalAudit(claimId)

  const received = toMoneyNumber(row.receivedAmount)
  if (received <= 0) {
    throw new Error("יש לעדכן סכום שהתקבל לפני אישור התקבול.")
  }

  const now = new Date()
  await db.update(claim).set({ paymentConfirmedAt: now, updatedAt: now }).where(eq(claim.id, claimId))

  await recordClaimEvent({
    claimId,
    partnerId: row.partnerId,
    type: "payment_confirmed",
    actorUserId: admin.id,
    actorRole: admin.role,
    meta: { receivedAmount: received },
  })

  await syncClaimProgressFromDocuments(claimId)

  revalidatePath("/admin")
  revalidatePath("/dashboard")
  const updated = await getClaimById(claimId)
  if (!updated) throw new Error("עדכון התיק נכשל.")
  return updated
}

/** Staff: add a contributor name to the claim accountability list. */
export async function addClaimContributor(claimId: string, name: string): Promise<WorkflowClaim> {
  await requireStaff()
  const access = await findClaimAccess(claimId)
  if (!access) throw new Error("התיק לא נמצא.")

  const trimmed = name.trim().replace(/\s+/g, " ")
  if (trimmed.length < 2) throw new Error("יש להזין שם מלא (לפחות 2 תווים).")
  if (trimmed.length > 80) throw new Error("השם ארוך מדי.")

  const [row] = await db.select().from(claim).where(eq(claim.id, access.claimId)).limit(1)
  if (!row) throw new Error("התיק לא נמצא.")

  const current = parseContributors(row.contributors)
  if (current.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("השם כבר מופיע ברשימת התורמים.")
  }

  const next = [...current, trimmed]
  await db
    .update(claim)
    .set({ contributors: serializeContributors(next), updatedAt: new Date() })
    .where(eq(claim.id, access.claimId))

  revalidatePath("/admin")
  revalidatePath("/dashboard")
  const updated = await getClaimById(claimId)
  if (!updated) throw new Error("עדכון התיק נכשל.")
  return updated
}

/** Staff: remove a contributor name from the claim. */
export async function removeClaimContributor(claimId: string, name: string): Promise<WorkflowClaim> {
  await requireStaff()
  const access = await findClaimAccess(claimId)
  if (!access) throw new Error("התיק לא נמצא.")

  const [row] = await db.select().from(claim).where(eq(claim.id, access.claimId)).limit(1)
  if (!row) throw new Error("התיק לא נמצא.")

  const next = parseContributors(row.contributors).filter(
    (n) => n.toLowerCase() !== name.trim().toLowerCase(),
  )
  await db
    .update(claim)
    .set({ contributors: serializeContributors(next), updatedAt: new Date() })
    .where(eq(claim.id, access.claimId))

  revalidatePath("/admin")
  revalidatePath("/dashboard")
  const updated = await getClaimById(claimId)
  if (!updated) throw new Error("עדכון התיק נכשל.")
  return updated
}

/**
 * Permanently delete a claim and all related rows (stages, documents, txs, notifications).
 * Admin-only — partners must never be able to invoke this.
 */
export async function deleteClaim(claimId: string): Promise<{ ok: true; id: string }> {
  await requireAdmin()
  if (!claimId?.trim()) throw new Error("מזהה תיק חסר.")

  const [row] = await db.select({ id: claim.id }).from(claim).where(eq(claim.id, claimId)).limit(1)
  if (!row) throw new Error("התיק לא נמצא.")

  // Best-effort: remove private blobs before DB rows disappear.
  const docs = await db
    .select({ blobPathname: claimDocument.blobPathname })
    .from(claimDocument)
    .where(eq(claimDocument.claimId, claimId))
  for (const doc of docs) {
    if (!doc.blobPathname) continue
    try {
      await del(doc.blobPathname)
    } catch (err) {
      console.log("[deleteClaim] blob delete failed:", err instanceof Error ? err.message : String(err))
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(inboundEmail)
      .set({ claimId: null, partnerId: null, updatedAt: new Date() })
      .where(eq(inboundEmail.claimId, claimId))
    await tx.delete(documentJob).where(eq(documentJob.claimId, claimId))
    await tx.delete(claimEvent).where(eq(claimEvent.claimId, claimId))
    await tx.delete(financialTransaction).where(eq(financialTransaction.claimId, claimId))
    await tx.delete(claimDocument).where(eq(claimDocument.claimId, claimId))
    await tx.delete(claimStage).where(eq(claimStage.claimId, claimId))
    await tx.delete(notification).where(eq(notification.claimId, claimId))
    await tx.delete(claim).where(eq(claim.id, claimId))
  })

  revalidatePath("/admin")
  revalidatePath("/dashboard")
  return { ok: true, id: claimId }
}
