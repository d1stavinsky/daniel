/**
 * Production go-live reset: wipe demo/business data, keep admin users.
 *
 * Clears:
 *   claim_event, financial_transaction, claim_document, claim_stage, notification, claim,
 *   partner users (+ cascaded session/account), partner
 *
 * Preserves:
 *   user.role = 'admin' and their account/session rows
 *   verification (Better Auth system table)
 *
 * Claim IDs are text (CLM-####), not Postgres sequences. After this wipe,
 * nextClaimId() uses CLAIM_ID_BASE=1000 → first claim is CLM-1001.
 *
 * Usage (dry-run):
 *   npx tsx --env-file=.env.local scripts/reset-demo-data.ts
 *
 * Usage (execute):
 *   CONFIRM=YES npx tsx --env-file=.env.local scripts/reset-demo-data.ts
 *   # or:
 *   npm run reset:demo
 */

import { count, eq, inArray, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  account,
  claim,
  claimDocument,
  claimEvent,
  claimStage,
  documentJob,
  financialTransaction,
  notification,
  partner,
  session,
  user,
  verification,
} from "@/lib/db/schema"

const CONFIRM = process.env.CONFIRM === "YES"
const CLAIM_ID_BASE = 1000 // must match app/actions/claims.ts

type Counts = Record<string, number>

async function snapshot(): Promise<Counts> {
  const [
    partners,
    claims,
    stages,
    docs,
    txs,
    notes,
    events,
    jobs,
    partnerUsers,
    admins,
    accounts,
    sessions,
    verifications,
  ] = await Promise.all([
    db.select({ n: count() }).from(partner),
    db.select({ n: count() }).from(claim),
    db.select({ n: count() }).from(claimStage),
    db.select({ n: count() }).from(claimDocument),
    db.select({ n: count() }).from(financialTransaction),
    db.select({ n: count() }).from(notification),
    db.select({ n: count() }).from(claimEvent),
    db.select({ n: count() }).from(documentJob),
    db.select({ n: count() }).from(user).where(ne(user.role, "admin")),
    db.select({ n: count() }).from(user).where(eq(user.role, "admin")),
    db.select({ n: count() }).from(account),
    db.select({ n: count() }).from(session),
    db.select({ n: count() }).from(verification),
  ])

  return {
    partner: partners[0]?.n ?? 0,
    claim: claims[0]?.n ?? 0,
    claim_stage: stages[0]?.n ?? 0,
    claim_document: docs[0]?.n ?? 0,
    financial_transaction: txs[0]?.n ?? 0,
    notification: notes[0]?.n ?? 0,
    claim_event: events[0]?.n ?? 0,
    document_job: jobs[0]?.n ?? 0,
    partner_users: partnerUsers[0]?.n ?? 0,
    admin_users: admins[0]?.n ?? 0,
    account: accounts[0]?.n ?? 0,
    session: sessions[0]?.n ?? 0,
    verification: verifications[0]?.n ?? 0,
  }
}

function printCounts(label: string, c: Counts) {
  console.log(`\n--- ${label} ---`)
  for (const [k, v] of Object.entries(c)) {
    console.log(`  ${k.padEnd(24)} ${v}`)
  }
}

async function expectedNextClaimId(): Promise<string> {
  const rows = await db.select({ id: claim.id }).from(claim)
  let max = CLAIM_ID_BASE
  for (const r of rows) {
    const n = Number.parseInt(r.id.replace(/\D/g, ""), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `CLM-${max + 1}`
}

async function verifyIntegrity(beforeAdmins: number): Promise<{ ok: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = []
  const warnings: string[] = []
  const after = await snapshot()

  if (after.partner !== 0) errors.push(`partner still has ${after.partner} rows`)
  if (after.claim !== 0) errors.push(`claim still has ${after.claim} rows`)
  if (after.claim_stage !== 0) errors.push(`claim_stage still has ${after.claim_stage} rows`)
  if (after.claim_document !== 0) errors.push(`claim_document still has ${after.claim_document} rows`)
  if (after.financial_transaction !== 0) {
    errors.push(`financial_transaction still has ${after.financial_transaction} rows`)
  }
  if (after.notification !== 0) errors.push(`notification still has ${after.notification} rows`)
  if (after.claim_event !== 0) errors.push(`claim_event still has ${after.claim_event} rows`)
  if (after.document_job !== 0) errors.push(`document_job still has ${after.document_job} rows`)
  if (after.partner_users !== 0) errors.push(`partner users still present: ${after.partner_users}`)
  if (after.admin_users < 1) errors.push("no admin users remain — abort condition")
  if (after.admin_users !== beforeAdmins) {
    errors.push(`admin count changed: before=${beforeAdmins} after=${after.admin_users}`)
  }

  // Every remaining user must be admin; credential account is strongly recommended.
  const admins = await db.select().from(user).where(eq(user.role, "admin"))
  for (const a of admins) {
    if (a.partnerId) errors.push(`admin ${a.email} still has partnerId=${a.partnerId}`)
    const [cred] = await db.select({ id: account.id }).from(account).where(eq(account.userId, a.id)).limit(1)
    if (!cred) {
      warnings.push(
        `admin ${a.email} has no credential account — cannot sign in until password is set (npm run create-admin)`,
      )
    }
  }

  const nextId = await expectedNextClaimId()
  if (nextId !== "CLM-1001") {
    errors.push(`expected next claim id CLM-1001, got ${nextId}`)
  }

  printCounts("After reset", after)
  console.log(`\nNext claim id will be: ${nextId}`)
  console.log(`Admin emails preserved: ${admins.map((a) => a.email).join(", ") || "(none)"}`)

  return { ok: errors.length === 0, errors, warnings }
}

async function reset() {
  console.log("AXIS demo-data reset")
  console.log(CONFIRM ? "Mode: EXECUTE (CONFIRM=YES)" : "Mode: DRY-RUN (set CONFIRM=YES to apply)")

  const before = await snapshot()
  printCounts("Before", before)

  if (before.admin_users < 1) {
    console.error("\nRefusing to run: no admin user found. Create an admin first.")
    process.exit(1)
  }

  if (!CONFIRM) {
    console.log("\nDry-run only. No rows deleted.")
    console.log("Would delete business tables and partner users; preserve admins.")
    console.log(`Would leave next claim id at CLM-${CLAIM_ID_BASE + 1} after wipe.`)
    process.exit(0)
  }

  await db.transaction(async (tx) => {
    // Child / dependent business tables first (no hard FKs on all, but safe order).
    await tx.delete(documentJob)
    await tx.delete(claimEvent)
    await tx.delete(financialTransaction)
    await tx.delete(claimDocument)
    await tx.delete(claimStage)
    await tx.delete(notification)
    await tx.delete(claim)

    // Partner login users (session + account cascade via FK on userId).
    const partnerUsers = await tx.select({ id: user.id }).from(user).where(ne(user.role, "admin"))
    const partnerUserIds = partnerUsers.map((u) => u.id)
    if (partnerUserIds.length > 0) {
      await tx.delete(session).where(inArray(session.userId, partnerUserIds))
      await tx.delete(account).where(inArray(account.userId, partnerUserIds))
      await tx.delete(user).where(inArray(user.id, partnerUserIds))
    }

    await tx.delete(partner)
  })

  const { ok, errors, warnings } = await verifyIntegrity(before.admin_users)
  if (warnings.length > 0) {
    console.warn("\nIntegrity warnings:")
    for (const w of warnings) console.warn(`  - ${w}`)
  }
  if (!ok) {
    console.error("\nIntegrity verification FAILED:")
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  console.log("\nIntegrity verification PASSED.")
  console.log("Database is ready for the first real partner.")
  console.log("First claim created via the app will be CLM-1001.")
}

reset()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
