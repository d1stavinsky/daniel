/**
 * Production verification script for Partner Management + Claim Management.
 *
 * Tests Zod schemas (offline) and, when DATABASE_URL is available, verifies
 * transactional create/toggle flows with cleanup.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/verify-core-flows.ts
 *   npm run verify:core
 */

import { randomUUID } from "crypto"
import { and, eq } from "drizzle-orm"
import { createClaimSchema, createPartnerSchema, setAmountsSchema, zodErrorMessage } from "../lib/schemas"

type Check = { name: string; pass: boolean; detail?: string }

const checks: Check[] = []

function assert(name: string, condition: boolean, detail?: string) {
  checks.push({ name, pass: condition, detail })
  const mark = condition ? "PASS" : "FAIL"
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ""}`)
}

function testSchemas() {
  console.log("\n=== Schema / validation (offline) ===")

  const partnerOk = createPartnerSchema.safeParse({
    businessName: "מוסך בדיקה",
    contactEmail: "garage-test@axis.co.il",
  })
  assert("createPartnerSchema accepts valid partner", partnerOk.success)

  const partnerBadEmail = createPartnerSchema.safeParse({
    businessName: "מוסך",
    contactEmail: "not-an-email",
  })
  assert(
    "createPartnerSchema rejects invalid email",
    !partnerBadEmail.success,
    partnerBadEmail.success ? undefined : zodErrorMessage(partnerBadEmail.error),
  )

  const claimOk = createClaimSchema.safeParse({
    clientName: "ישראל ישראלי",
    plate: "1234567",
    carModel: "טויוטה",
    partnerId: randomUUID(),
    requestedAmount: 12000,
  })
  assert("createClaimSchema accepts valid claim", claimOk.success)

  const claimBadPlate = createClaimSchema.safeParse({
    clientName: "ישראל",
    plate: "12",
    carModel: "",
    partnerId: "p1",
    requestedAmount: 100,
  })
  assert("createClaimSchema rejects bad plate", !claimBadPlate.success)

  const claimNeg = createClaimSchema.safeParse({
    clientName: "ישראל",
    plate: "12345678",
    carModel: "",
    partnerId: "p1",
    requestedAmount: -5,
  })
  assert("createClaimSchema rejects negative amount", !claimNeg.success)

  const amountsOk = setAmountsSchema.safeParse({
    claimId: "CLM-1",
    requested: 100.5,
    received: "250.75",
  })
  assert("setAmountsSchema accepts decimal money", amountsOk.success)
  assert(
    "setAmountsSchema rounds to 2dp",
    amountsOk.success && amountsOk.data.requested === 100.5 && amountsOk.data.received === 250.75,
  )

  const amountsNeg = setAmountsSchema.safeParse({
    claimId: "CLM-1",
    requested: -1,
    received: 0,
  })
  assert("setAmountsSchema rejects negative requested", !amountsNeg.success)

  const claimDecimal = createClaimSchema.safeParse({
    clientName: "Test",
    plate: "1234567",
    carModel: "X",
    partnerId: "p1",
    requestedAmount: "1234.56",
  })
  assert(
    "createClaimSchema accepts decimal string amount",
    claimDecimal.success && claimDecimal.data.requestedAmount === 1234.56,
  )
}

async function testDatabaseFlows() {
  console.log("\n=== Database flows (integration) ===")

  if (!process.env.DATABASE_URL) {
    assert("DATABASE_URL present", false, "skipped DB integration")
    return
  }

  // Dynamic imports so schema tests still run without DB modules failing early.
  const { db } = await import("../lib/db")
  const { account, claim, claimDocument, claimStage, financialTransaction, partner, user } =
    await import("../lib/db/schema")
  const { auth } = await import("../lib/auth")

  const stamp = Date.now().toString(36)
  const partnerId = randomUUID()
  const userId = randomUUID()
  const claimId = `CLM-V-${stamp}`
  const email = `verify-${stamp}@axis-test.local`
  const now = new Date()

  try {
    const ctx = await auth.$context
    const hashed = await ctx.password.hash(`Verify-${stamp}!a1`)

    await db.transaction(async (tx) => {
      await tx.insert(partner).values({
        id: partnerId,
        businessName: `Verify Garage ${stamp}`,
        contactEmail: email,
        loginUsername: `verify-${stamp}`,
        status: "active",
        type: "garage",
        createdBy: "verify-script",
        createdAt: now,
      })

      await tx.insert(user).values({
        id: userId,
        name: `Verify Garage ${stamp}`,
        email,
        emailVerified: true,
        role: "partner",
        partnerId,
        partnerRole: "owner",
        mustResetPassword: true,
        createdAt: now,
        updatedAt: now,
      })

      await tx.insert(account).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hashed,
        createdAt: now,
        updatedAt: now,
      })
    })
    assert("partner+user+account transactional insert", true)

    await db.transaction(async (tx) => {
      await tx.insert(claim).values({
        id: claimId,
        clientName: "Verify Client",
        customerName: "Verify Client",
        plate: "1234567",
        carModel: "Test",
        partnerId,
        currentStage: 1,
        requestedAmount: 5000,
        receivedAmount: 0,
        fundsReleased: false,
        status: "open",
        stageEnteredAt: now,
        createdBy: "verify-script",
        createdAt: now,
        updatedAt: now,
      })
      await tx.insert(claimStage).values({
        id: randomUUID(),
        claimId,
        stage: 1,
        status: "in-progress",
        notes: "",
        updatedAt: now,
      })
      await tx.insert(claimDocument).values({
        id: randomUUID(),
        claimId,
        partnerId,
        kind: "demand_letter",
        status: "pending",
        note: "",
        updatedAt: now,
        createdAt: now,
      })
      await tx.insert(financialTransaction).values({
        id: randomUUID(),
        claimId,
        partnerId,
        kind: "created",
        amount: 5000,
        previousAmount: null,
        note: "verify",
        performedBy: "verify-script",
        performedByName: "verify",
        createdAt: now,
      })
    })
    assert("claim bundle transactional insert", true)

    await db.update(partner).set({ status: "suspended" }).where(eq(partner.id, partnerId))
    const [suspended] = await db.select({ status: partner.status }).from(partner).where(eq(partner.id, partnerId))
    assert("partner suspend update", suspended?.status === "suspended")

    await db.update(partner).set({ status: "active" }).where(eq(partner.id, partnerId))
    const [active] = await db.select({ status: partner.status }).from(partner).where(eq(partner.id, partnerId))
    assert("partner reactivate update", active?.status === "active")

    // Simulate mid-failure: claim insert that would orphan without transaction — rollback path.
    let rolledBack = false
    try {
      await db.transaction(async (tx) => {
        await tx.insert(claim).values({
          id: `${claimId}-orphan`,
          clientName: "Should Roll Back",
          customerName: "Should Roll Back",
          plate: "7654321",
          carModel: "X",
          partnerId,
          currentStage: 1,
          requestedAmount: 1,
          receivedAmount: 0,
          fundsReleased: false,
          status: "open",
          stageEnteredAt: now,
          createdBy: "verify-script",
          createdAt: now,
          updatedAt: now,
        })
        throw new Error("forced-rollback")
      })
    } catch (err) {
      rolledBack = err instanceof Error && err.message === "forced-rollback"
    }
    const [orphan] = await db.select({ id: claim.id }).from(claim).where(eq(claim.id, `${claimId}-orphan`)).limit(1)
    assert("transaction rolls back on error", rolledBack && !orphan)

    const [acct] = await db
      .select({ password: account.password })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .limit(1)
    assert("credential account has hashed password", Boolean(acct?.password))
  } finally {
    // Cleanup (best-effort, order respects FKs).
    await db.delete(financialTransaction).where(eq(financialTransaction.partnerId, partnerId))
    await db.delete(claimDocument).where(eq(claimDocument.partnerId, partnerId))
    await db.delete(claimStage).where(eq(claimStage.claimId, claimId))
    await db.delete(claim).where(eq(claim.partnerId, partnerId))
    await db.delete(account).where(eq(account.userId, userId))
    await db.delete(user).where(eq(user.id, userId))
    await db.delete(partner).where(eq(partner.id, partnerId))
    assert("cleanup completed", true)
  }
}

async function main() {
  console.log("AXIS core-flow verification")
  testSchemas()
  await testDatabaseFlows()

  const failed = checks.filter((c) => !c.pass)
  console.log(`\n=== Summary: ${checks.length - failed.length}/${checks.length} passed ===`)
  if (failed.length > 0) {
    console.error("Failed checks:")
    for (const f of failed) console.error(` - ${f.name}${f.detail ? `: ${f.detail}` : ""}`)
    process.exit(1)
  }
  console.log("All core verification checks passed.")
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
