"use server"

/**
 * Ops inbox + health stats for the admin dashboard (S1).
 * Consumed by S2 Inbox UI and `/api/admin/inbox` + `/api/admin/ops-health`.
 */

import { and, eq, gte, inArray, ne, or, sql } from "drizzle-orm"
import { getSloSummary, type SloSummary } from "@/lib/audit"
import { toMoneyNumber } from "@/lib/claims-data"
import { DOC_KINDS, docKindLabels, type DocKind } from "@/lib/documents"
import { db } from "@/lib/db"
import { claim, claimDocument, partner } from "@/lib/db/schema"
import {
  deriveClaimNextAction,
  filterInboxByAction,
  INBOX_AGING_HOURS,
  sortInboxItems,
  type ClaimInboxItem,
  type InboxDocSignal,
  type NextActionKind,
} from "@/lib/ops/next-action"
import { clampPagination, paginated, type PaginatedResult } from "@/lib/pagination"
import { requireStaff } from "@/lib/session"

export type OpsInboxFilters = {
  page?: number
  pageSize?: number
  /** Segment filter; default "all" excludes `none`. */
  action?: NextActionKind | "all"
  /** Keep only items with urgencyScore >= this value (e.g. 80 for "high urgency"). */
  minUrgency?: number
  /** Keep only items whose Investigation/Demand SLA is breached. */
  slaOnly?: boolean
  partnerId?: string
  query?: string
}

/**
 * Operational health KPIs for the dashboard header.
 * - stpPercent: auto_verified / (auto_verified + exception) over 7d
 * - backlog: open claims that are stuck, erroneous, or require staff intervention
 * - agingAvgDays: average days in pending for all inbox items
 */
export type OpsHealth = {
  /** 0–100; null when no STP decisions in the window. */
  stpPercent: number | null
  stpAutoVerifiedCount: number
  stpExceptionDecisions7d: number
  /** Claims that are stuck, erroneous, or require direct staff intervention. */
  backlog: number
  /** Average age in days of open inbox items (pending work). Null if empty. */
  agingAvgDays: number | null
  /** Count of inbox items older than 48h (secondary SLA pressure). */
  agingOver48h: number
  agingThresholdHours: number
  byAction: Record<Exclude<NextActionKind, "none">, number>
  system: {
    ok: boolean
    slos: SloSummary[]
  }
  generatedAt: string
}

/** @deprecated Use OpsHealth — alias for older naming. */
export type OpsHealthStats = OpsHealth

function mapDocSignal(row: {
  id: string
  kind: string
  status: string
  blobPathname: string | null
  extractionStatus: string | null
  extractionConfidence: number | null
  stpStatus: string | null
  stpReason: string | null
  signatureStatus: string | null
  updatedAt: Date
}): InboxDocSignal {
  const kind = row.kind as DocKind
  return {
    documentId: row.id,
    kind: row.kind,
    kindLabel: docKindLabels[kind] ?? row.kind,
    status: row.status,
    hasFile: Boolean(row.blobPathname),
    extractionStatus: row.extractionStatus ?? "none",
    extractionConfidence: row.extractionConfidence,
    stpStatus: row.stpStatus ?? "none",
    stpReason: row.stpReason,
    signatureStatus: row.signatureStatus,
    updatedAt: row.updatedAt,
  }
}

function emptyByAction(): Record<Exclude<NextActionKind, "none">, number> {
  return {
    internal_audit: 0,
    stp_exception: 0,
    pending_approval: 0,
    pending_signature: 0,
    missing_docs: 0,
    stuck: 0,
    pending_resolution: 0,
    finance_gap: 0,
  }
}

/** Load open claims + docs → sorted inbox items (no auth). */
async function buildOpsInboxItems(
  filters: Pick<OpsInboxFilters, "action" | "minUrgency" | "slaOnly" | "partnerId" | "query"> = {},
): Promise<ClaimInboxItem[]> {
  const actionFilter = filters.action ?? "all"
  const now = new Date()

  const claimRows = await db
    .select({
      id: claim.id,
      clientName: claim.clientName,
      customerName: claim.customerName,
      clientPhone: claim.clientPhone,
      plate: claim.plate,
      partnerId: claim.partnerId,
      partnerName: partner.businessName,
      createdAt: claim.createdAt,
      stageEnteredAt: claim.stageEnteredAt,
      status: claim.status,
      paymentConfirmedAt: claim.paymentConfirmedAt,
      requestedAmount: claim.requestedAmount,
      receivedAmount: claim.receivedAmount,
    })
    .from(claim)
    .leftJoin(partner, eq(partner.id, claim.partnerId))
    .where(ne(claim.status, "closed"))

  const claimIds = claimRows.map((c) => c.id)
  const docsByClaim = new Map<string, InboxDocSignal[]>()

  if (claimIds.length > 0) {
    const docRows = await db
      .select({
        id: claimDocument.id,
        claimId: claimDocument.claimId,
        kind: claimDocument.kind,
        status: claimDocument.status,
        blobPathname: claimDocument.blobPathname,
        extractionStatus: claimDocument.extractionStatus,
        extractionConfidence: claimDocument.extractionConfidence,
        stpStatus: claimDocument.stpStatus,
        stpReason: claimDocument.stpReason,
        signatureStatus: claimDocument.signatureStatus,
        updatedAt: claimDocument.updatedAt,
      })
      .from(claimDocument)
      .where(and(inArray(claimDocument.claimId, claimIds), inArray(claimDocument.kind, DOC_KINDS)))

    for (const row of docRows) {
      const list = docsByClaim.get(row.claimId) ?? []
      list.push(mapDocSignal(row))
      docsByClaim.set(row.claimId, list)
    }
  }

  let items = claimRows.map((c) =>
    deriveClaimNextAction(
      {
        claimId: c.id,
        clientName: c.clientName,
        customerName: c.customerName,
        clientPhone: c.clientPhone,
        partnerId: c.partnerId,
        partnerName: c.partnerName ?? "—",
        plate: c.plate,
        createdAt: c.createdAt,
        stageEnteredAt: c.stageEnteredAt,
        closed: c.status === "closed",
        paymentConfirmed: Boolean(c.paymentConfirmedAt),
        requestedAmount: toMoneyNumber(c.requestedAmount),
        receivedAmount: toMoneyNumber(c.receivedAmount),
        docs: docsByClaim.get(c.id) ?? [],
      },
      now,
    ),
  )

  items = filterInboxByAction(items, actionFilter)

  if (filters.minUrgency != null && filters.minUrgency > 0) {
    items = items.filter((i) => i.urgencyScore >= filters.minUrgency!)
  }

  if (filters.slaOnly) {
    items = items.filter((i) => i.slaBreached)
  }

  if (filters.partnerId) {
    items = items.filter((i) => i.partnerId === filters.partnerId)
  }

  const q = filters.query?.trim().toLowerCase()
  if (q) {
    items = items.filter(
      (i) =>
        i.claimId.toLowerCase().includes(q) ||
        i.clientName.toLowerCase().includes(q) ||
        i.customerName.toLowerCase().includes(q) ||
        (i.clientPhone ?? "").toLowerCase().includes(q) ||
        i.partnerName.toLowerCase().includes(q) ||
        i.plate.toLowerCase().includes(q) ||
        i.reason.toLowerCase().includes(q) ||
        i.labelEn.toLowerCase().includes(q),
    )
  }

  return sortInboxItems(items)
}

/**
 * Paginated ops inbox — claims sorted by urgencyScore (highest first).
 */
export async function getOpsInbox(
  filters: OpsInboxFilters = {},
): Promise<PaginatedResult<ClaimInboxItem>> {
  await requireStaff()
  const { page, pageSize, offset } = clampPagination(filters)
  const items = await buildOpsInboxItems({
    action: filters.action,
    minUrgency: filters.minUrgency,
    slaOnly: filters.slaOnly,
    partnerId: filters.partnerId,
    query: filters.query,
  })
  return paginated(items.slice(offset, offset + pageSize), items.length, page, pageSize)
}

/**
 * System health for the dashboard header:
 * STP %, backlog (unhandled exceptions), aging (avg days in pending).
 */
export async function getOpsHealth(): Promise<OpsHealth> {
  await requireStaff()
  const now = new Date()
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [stpRows, inboxItems, slos] = await Promise.all([
    db
      .select({
        stpStatus: claimDocument.stpStatus,
        n: sql<number>`count(*)`.mapWith(Number),
      })
      .from(claimDocument)
      .where(
        and(
          or(eq(claimDocument.stpStatus, "auto_verified"), eq(claimDocument.stpStatus, "exception")),
          gte(claimDocument.stpDecidedAt, since7d),
        ),
      )
      .groupBy(claimDocument.stpStatus),
    buildOpsInboxItems({ action: "all" }),
    getSloSummary(),
  ])

  let stpAutoVerifiedCount = 0
  let stpExceptionDecisions7d = 0
  for (const r of stpRows) {
    if (r.stpStatus === "auto_verified") stpAutoVerifiedCount = r.n
    if (r.stpStatus === "exception") stpExceptionDecisions7d = r.n
  }
  const stpDenom = stpAutoVerifiedCount + stpExceptionDecisions7d
  const stpPercent =
    stpDenom === 0 ? null : Math.round((stpAutoVerifiedCount / stpDenom) * 1000) / 10

  const byAction = emptyByAction()
  let agingOver48h = 0
  let ageHoursSum = 0
  for (const item of inboxItems) {
    if (item.nextAction === "none") continue
    byAction[item.nextAction] += 1
    ageHoursSum += item.ageHours
    if (item.ageHours > INBOX_AGING_HOURS) agingOver48h += 1
  }

  const backlog =
    byAction.internal_audit +
    byAction.stp_exception +
    byAction.pending_approval +
    byAction.pending_signature +
    byAction.stuck +
    byAction.pending_resolution +
    byAction.finance_gap
  const agingAvgDays =
    inboxItems.length === 0
      ? null
      : Math.round((ageHoursSum / inboxItems.length / 24) * 10) / 10

  const systemOk = slos.every((s) => s.ok || s.sampleCount === 0)

  return {
    stpPercent,
    stpAutoVerifiedCount,
    stpExceptionDecisions7d,
    backlog,
    agingAvgDays,
    agingOver48h,
    agingThresholdHours: INBOX_AGING_HOURS,
    byAction,
    system: { ok: systemOk, slos },
    generatedAt: now.toISOString(),
  }
}

/** @deprecated Prefer getOpsHealth. */
export async function getOpsHealthStats(): Promise<OpsHealth> {
  return getOpsHealth()
}
