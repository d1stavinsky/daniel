import { randomUUID } from "crypto"
import { desc, eq, gte, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { claimEvent, sloSnapshot } from "@/lib/db/schema"

export type SystemAuditType =
  | "api_request"
  | "auth_denied"
  | "webhook_dispatched"
  | "slo_recorded"
  | "rbac_blocked"

const inMemoryLatencies: { metric: string; ms: number; at: number }[] = []
const MAX_MEMORY_SAMPLES = 500

/** Structured console audit — always on. */
export function auditLog(type: string, detail: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      type,
      ...detail,
    }),
  )
}

/** Persist a system-level audit row (claimId optional). */
export async function recordSystemAudit(input: {
  type: SystemAuditType
  claimId?: string | null
  partnerId?: string | null
  actorUserId?: string | null
  actorRole?: string | null
  meta?: Record<string, unknown>
}): Promise<void> {
  auditLog(input.type, input.meta ?? {})
  if (!input.claimId || !input.partnerId) return
  try {
    await db.insert(claimEvent).values({
      id: randomUUID(),
      claimId: input.claimId,
      partnerId: input.partnerId,
      type: input.type,
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? "system",
      meta: JSON.stringify(input.meta ?? {}),
      createdAt: new Date(),
    })
  } catch (err) {
    console.error("[audit] claim_event insert failed", err)
  }
}

/** Record a latency sample for SLO rollups. */
export async function recordSloMetric(
  metric: string,
  valueMs: number,
  meta?: Record<string, unknown>,
): Promise<void> {
  const now = Date.now()
  inMemoryLatencies.push({ metric, ms: valueMs, at: now })
  if (inMemoryLatencies.length > MAX_MEMORY_SAMPLES) {
    inMemoryLatencies.splice(0, inMemoryLatencies.length - MAX_MEMORY_SAMPLES)
  }

  try {
    await db.insert(sloSnapshot).values({
      id: randomUUID(),
      metric,
      value: valueMs,
      unit: "ms",
      meta: JSON.stringify(meta ?? {}),
      recordedAt: new Date(),
    })
  } catch {
    // Table may not exist yet during migration — in-memory still works.
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return Math.round(sorted[idx] ?? 0)
}

export type SloSummary = {
  metric: string
  sampleCount: number
  p50Ms: number
  p95Ms: number
  targetP95Ms: number
  ok: boolean
}

const SLO_TARGETS: Record<string, number> = {
  api_claims_list: 800,
  api_health: 500,
  idp_extraction: 60_000,
}

/** Summarize recent SLO metrics (memory + last 24h DB). */
export async function getSloSummary(): Promise<SloSummary[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const metrics = Object.keys(SLO_TARGETS)
  const out: SloSummary[] = []

  for (const metric of metrics) {
    const mem = inMemoryLatencies.filter((s) => s.metric === metric).map((s) => s.ms)
    let dbVals: number[] = []
    try {
      const rows = await db
        .select({ value: sloSnapshot.value })
        .from(sloSnapshot)
        .where(andMetricSince(metric, since))
        .orderBy(desc(sloSnapshot.recordedAt))
        .limit(200)
      dbVals = rows.map((r) => Number(r.value))
    } catch {
      /* ignore */
    }
    const values = [...mem, ...dbVals]
    const p95 = percentile(values, 95)
    const target = SLO_TARGETS[metric] ?? 1000
    out.push({
      metric,
      sampleCount: values.length,
      p50Ms: percentile(values, 50),
      p95Ms: p95,
      targetP95Ms: target,
      ok: values.length === 0 || p95 <= target,
    })
  }
  return out
}

function andMetricSince(metric: string, since: Date) {
  return and(eq(sloSnapshot.metric, metric), gte(sloSnapshot.recordedAt, since))
}
