import { randomUUID } from "crypto"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { account, user } from "@/lib/db/schema"
import { auth } from "@/lib/auth"

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@axis.co.il"
const ADMIN_NAME = process.env.ADMIN_NAME ?? "AXIS Admin"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

async function main() {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
    console.error("Set ADMIN_PASSWORD (min 8 chars) in the environment before running this script.")
    console.error("Optional: ADMIN_EMAIL, ADMIN_NAME")
    process.exit(1)
  }

  const [existingUser] = await db.select().from(user).where(eq(user.email, ADMIN_EMAIL)).limit(1)

  const ctx = await auth.$context
  const hashed = await ctx.password.hash(ADMIN_PASSWORD)
  const now = new Date()

  if (existingUser) {
    await db
      .update(user)
      .set({
        name: ADMIN_NAME,
        role: "admin",
        partnerId: null,
        partnerRole: null,
        mustResetPassword: false,
        emailVerified: true,
        updatedAt: now,
      })
      .where(eq(user.id, existingUser.id))

    const [existingAccount] = await db
      .select()
      .from(account)
      .where(eq(account.userId, existingUser.id))
      .limit(1)

    if (existingAccount) {
      await db
        .update(account)
        .set({ password: hashed, updatedAt: now })
        .where(eq(account.id, existingAccount.id))
    } else {
      await db.insert(account).values({
        id: randomUUID(),
        accountId: existingUser.id,
        providerId: "credential",
        userId: existingUser.id,
        password: hashed,
        createdAt: now,
        updatedAt: now,
      })
    }

    console.log(`Updated existing admin user: ${ADMIN_EMAIL}`)
  } else {
    const userId = randomUUID()

    await db.insert(user).values({
      id: userId,
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      emailVerified: true,
      role: "admin",
      partnerId: null,
      partnerRole: null,
      mustResetPassword: false,
      createdAt: now,
      updatedAt: now,
    })

    await db.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hashed,
      createdAt: now,
      updatedAt: now,
    })

    console.log(`Created admin user: ${ADMIN_EMAIL}`)
  }

  console.log("Password set from ADMIN_PASSWORD env (not printed).")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
