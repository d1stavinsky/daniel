import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { isStaff } from "@/lib/rbac"
import { getSloSummary, recordSloMetric } from "@/lib/audit"

type HealthCheck = {
  name: string
  ok: boolean
  detail: string
}

/**
 * Admin health probe for P0 invariants (multi-doc schema, claim_event table).
 */
export async function GET() {
  const started = Date.now()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const checks: HealthCheck[] = []

  try {
    const uniqueRows = await pool.query<{ conname: string }>(
      `select conname
       from pg_constraint
       where conrelid = 'claim_document'::regclass
         and contype = 'u'
         and conname = 'claim_document_claim_kind_unique'`,
    )
    const stillThere = uniqueRows.rowCount !== null && uniqueRows.rowCount > 0
    checks.push({
      name: "multi_doc_unique_dropped",
      ok: !stillThere,
      detail: stillThere
        ? "claim_document_claim_kind_unique still exists — run scripts/migrate-p0.sql"
        : "unique (claimId, kind) constraint absent (multi-file OK)",
    })
  } catch (err) {
    checks.push({
      name: "multi_doc_unique_dropped",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    await pool.query(`select 1 from claim_event limit 1`)
    checks.push({
      name: "claim_event_table",
      ok: true,
      detail: "claim_event table reachable",
    })
  } catch (err) {
    checks.push({
      name: "claim_event_table",
      ok: false,
      detail:
        err instanceof Error
          ? `${err.message} — run scripts/migrate-p0.sql`
          : "claim_event missing — run scripts/migrate-p0.sql",
    })
  }

  try {
    await pool.query(`select 1 from document_job limit 1`)
    checks.push({
      name: "document_job_table",
      ok: true,
      detail: "document_job table reachable",
    })
  } catch (err) {
    checks.push({
      name: "document_job_table",
      ok: false,
      detail:
        err instanceof Error
          ? `${err.message} — run scripts/migrate-p1.sql`
          : "document_job missing — run scripts/migrate-p1.sql",
    })
  }

  try {
    const cols = await pool.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_name = 'claim_document'
         and column_name in ('extracted_data', 'extractionStatus')`,
    )
    const names = new Set(cols.rows.map((r) => r.column_name))
    const okCols = names.has("extracted_data") && names.has("extractionStatus")
    checks.push({
      name: "idp_extraction_columns",
      ok: okCols,
      detail: okCols
        ? "extracted_data + extractionStatus present"
        : "missing IDP columns — run scripts/migrate-p2.sql",
    })
  } catch (err) {
    checks.push({
      name: "idp_extraction_columns",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    const cols = await pool.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_name = 'claim_document'
         and column_name = 'stpStatus'`,
    )
    const okCols = cols.rowCount !== null && cols.rowCount > 0
    checks.push({
      name: "stp_columns",
      ok: okCols,
      detail: okCols
        ? "stpStatus present"
        : "missing STP columns — run scripts/migrate-p3.sql",
    })
  } catch (err) {
    checks.push({
      name: "stp_columns",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    await pool.query(`select 1 from webhook_endpoint limit 1`)
    checks.push({ name: "webhook_endpoint_table", ok: true, detail: "webhook_endpoint reachable" })
  } catch (err) {
    checks.push({
      name: "webhook_endpoint_table",
      ok: false,
      detail: err instanceof Error ? err.message : "run scripts/migrate-p4.sql",
    })
  }

  try {
    await pool.query(`select 1 from slo_snapshot limit 1`)
    checks.push({ name: "slo_snapshot_table", ok: true, detail: "slo_snapshot reachable" })
  } catch (err) {
    checks.push({
      name: "slo_snapshot_table",
      ok: false,
      detail: err instanceof Error ? err.message : "run scripts/migrate-p4.sql",
    })
  }

  const ok = checks.every((c) => c.ok)
  const ms = Date.now() - started
  void recordSloMetric("api_health", ms)
  const slos = await getSloSummary()

  return NextResponse.json(
    {
      ok,
      checks,
      slos,
      hint: ok
        ? null
        : "Apply scripts/migrate-p0.sql through migrate-p4.sql on Neon, then re-check.",
    },
    { status: ok ? 200 : 503 },
  )
}
