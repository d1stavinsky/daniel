import { randomUUID } from "crypto"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { account, claim, claimStage, financialTransaction, partner, user } from "@/lib/db/schema"
import { auth } from "@/lib/auth"
import { STAGES } from "@/lib/workflow-data"

const DAY_MS = 86_400_000

type SeedPartner = { key: string; businessName: string; contactEmail: string; type: "garage" | "agency" }

const SEED_PARTNERS: SeedPartner[] = [
  { key: "P-01", businessName: "מוסך מרכזי תל אביב", contactEmail: "garage@axis.co.il", type: "garage" },
  { key: "P-02", businessName: "סוכנות ביטוח הראל ושות'", contactEmail: "harel@axis-demo.co.il", type: "agency" },
  { key: "P-03", businessName: "מוסך הצפון חיפה", contactEmail: "north@axis-demo.co.il", type: "garage" },
  { key: "P-04", businessName: "סוכנות כלל דרום", contactEmail: "clal@axis-demo.co.il", type: "agency" },
  { key: "P-05", businessName: "מוסך פרימיום ירושלים", contactEmail: "premium@axis-demo.co.il", type: "garage" },
]

type SeedClaim = {
  id: string
  clientName: string
  plate: string
  carModel: string
  partnerKey: string
  currentStage: number
  requested: number
  received: number
  daysInStage: number
  closed: boolean
}

const SEED_CLAIMS: SeedClaim[] = [
  { id: "CLM-4821", clientName: "דניאל אברהמי", plate: "34-812-05", carModel: "טויוטה קורולה 2022", partnerKey: "P-01", currentStage: 4, requested: 48200, received: 0, daysInStage: 5, closed: false },
  { id: "CLM-4820", clientName: "מיכל בן דוד", plate: "921-47-301", carModel: "מאזדה 3 2021", partnerKey: "P-02", currentStage: 6, requested: 126500, received: 0, daysInStage: 2, closed: false },
  { id: "CLM-4819", clientName: "יוסף כהן", plate: "55-244-88", carModel: "יונדאי i20 2020", partnerKey: "P-03", currentStage: 9, requested: 31900, received: 31900, daysInStage: 1, closed: true },
  { id: "CLM-4818", clientName: "נועה שרון", plate: "712-33-902", carModel: "קיה ספורטאז' 2023", partnerKey: "P-01", currentStage: 7, requested: 89400, received: 0, daysInStage: 6, closed: false },
  { id: "CLM-4817", clientName: "אבי לוי", plate: "18-905-62", carModel: "סקודה אוקטביה 2022", partnerKey: "P-04", currentStage: 2, requested: 54700, received: 0, daysInStage: 1, closed: false },
  { id: "CLM-4816", clientName: "תמר גולן", plate: "440-27-118", carModel: "ב.מ.וו X3 2023", partnerKey: "P-05", currentStage: 8, requested: 213000, received: 187000, daysInStage: 2, closed: false },
  { id: "CLM-4815", clientName: "רון מזרחי", plate: "63-771-24", carModel: "פורד פוקוס 2019", partnerKey: "P-02", currentStage: 9, requested: 27800, received: 27800, daysInStage: 3, closed: true },
  { id: "CLM-4814", clientName: "ליאת פרץ", plate: "802-19-556", carModel: "אאודי A4 2021", partnerKey: "P-03", currentStage: 5, requested: 95600, received: 0, daysInStage: 4, closed: false },
]

// Demo garage login (attached to P-01). Force-reset is applied in Phase 3.
const DEMO_LOGIN = { email: "garage@axis.co.il", password: "GarageDemo2026", name: "מוסך מרכזי תל אביב" }

function seedStages(current: number, closed: boolean) {
  return STAGES.map((s) => ({
    stage: s.id,
    status: closed ? "done" : s.id < current ? "done" : s.id === current ? "in-progress" : "pending",
  }))
}

export type SeedResult = { seeded: boolean; message: string; demoLogin?: { email: string; password: string } }

/** Idempotently seed demo partners, one demo garage login, and 8 claims. */
export async function seedDemoData(): Promise<SeedResult> {
  const existing = await db.select({ id: claim.id }).from(claim).limit(1)
  if (existing.length > 0) {
    return { seeded: false, message: "נתוני דמו כבר קיימים." }
  }

  // Find any admin to attribute the seed to; fall back to a system id.
  const [admin] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.role, "admin")).limit(1)
  const createdBy = admin?.id ?? "system-seed"
  const createdByName = admin?.name ?? "מערכת"

  const now = Date.now()

  // 1) Partners
  const partnerIdByKey = new Map<string, string>()
  for (const p of SEED_PARTNERS) {
    const id = randomUUID()
    partnerIdByKey.set(p.key, id)
    await db.insert(partner).values({
      id,
      businessName: p.businessName,
      contactEmail: p.contactEmail,
      loginUsername: `${p.key.toLowerCase()}-demo`,
      status: "active",
      type: p.type,
      createdBy,
      createdAt: new Date(now),
    })
  }

  // 2) Demo garage login on P-01 (email + password)
  const demoPartnerId = partnerIdByKey.get("P-01")!
  const existingUser = await db.select({ id: user.id }).from(user).where(eq(user.email, DEMO_LOGIN.email)).limit(1)
  if (existingUser.length === 0) {
    const ctx = await auth.$context
    const hashed = await ctx.password.hash(DEMO_LOGIN.password)
    const userId = randomUUID()
    await db.insert(user).values({
      id: userId,
      name: DEMO_LOGIN.name,
      email: DEMO_LOGIN.email,
      emailVerified: true,
      role: "partner",
      partnerId: demoPartnerId,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    await db.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hashed,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
  }

  // 3) Claims + stage ledgers + audit rows
  for (let i = 0; i < SEED_CLAIMS.length; i++) {
    const c = SEED_CLAIMS[i]
    const partnerId = partnerIdByKey.get(c.partnerKey)!
    const stageEnteredAt = new Date(now - c.daysInStage * DAY_MS)
    const createdAt = new Date(now - (c.daysInStage + i + 2) * DAY_MS)

    await db.insert(claim).values({
      id: c.id,
      clientName: c.clientName,
      customerName: c.clientName,
      plate: c.plate,
      carModel: c.carModel,
      partnerId,
      currentStage: c.currentStage,
      requestedAmount: c.requested,
      receivedAmount: c.received,
      fundsReleased: c.closed && c.received > 0,
      status: c.closed ? "closed" : "open",
      stageEnteredAt,
      createdBy,
      createdAt,
      updatedAt: new Date(now),
    })

    await db.insert(claimStage).values(
      seedStages(c.currentStage, c.closed).map((s) => ({
        id: randomUUID(),
        claimId: c.id,
        stage: s.stage,
        status: s.status,
        notes: "",
        updatedAt: new Date(now),
      })),
    )

    const txs: (typeof financialTransaction.$inferInsert)[] = [
      {
        id: randomUUID(),
        claimId: c.id,
        partnerId,
        kind: "created",
        amount: c.requested,
        previousAmount: null,
        note: "פתיחת תיק תביעה",
        performedBy: createdBy,
        performedByName: createdByName,
        createdAt,
      },
    ]
    if (c.received > 0) {
      txs.push({
        id: randomUUID(),
        claimId: c.id,
        partnerId,
        kind: "received_set",
        amount: c.received,
        previousAmount: 0,
        note: "התקבל תשלום",
        performedBy: createdBy,
        performedByName: createdByName,
        createdAt: new Date(now - c.daysInStage * DAY_MS),
      })
    }
    await db.insert(financialTransaction).values(txs)
  }

  return {
    seeded: true,
    message: `נוצרו ${SEED_PARTNERS.length} שותפים ו-${SEED_CLAIMS.length} תיקים.`,
    demoLogin: { email: DEMO_LOGIN.email, password: DEMO_LOGIN.password },
  }
}
