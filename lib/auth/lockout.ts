import { desc, isNotNull, and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { session, user } from "@/lib/db/schema"

/** Consecutive failed password attempts before the account is locked. */
export const LOGIN_LOCKOUT_THRESHOLD = 10

export const LOCKOUT_USER_MESSAGE =
  "החשבון נחסם עקב ניסיונות התחברות כושלים מרובים. פנו למנהל המערכת לשחרור."

export const GENERIC_CREDENTIALS_MESSAGE = "פרטי ההתחברות שגויים. נסו שוב."

export type LockoutRow = {
  id: string
  email: string
  name: string
  role: string
  failedLoginAttempts: number
  lockedAt: Date | null
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Returns lockout state for an email. Unknown emails look unlocked (no enumeration). */
export async function getLockoutByEmail(email: string): Promise<LockoutRow | null> {
  const normalized = normalizeEmail(email)
  if (!normalized) return null

  const [row] = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedAt: user.lockedAt,
    })
    .from(user)
    .where(eq(user.email, normalized))
    .limit(1)

  return row ?? null
}

export function isAccountLocked(row: Pick<LockoutRow, "lockedAt"> | null | undefined): boolean {
  return Boolean(row?.lockedAt)
}

/**
 * Record a failed credential attempt for an existing user.
 * Locks the account and revokes sessions at the threshold.
 * No-ops for unknown emails (avoids account enumeration side-channels).
 */
export async function recordFailedLoginAttempt(email: string): Promise<{
  locked: boolean
  attempts: number
}> {
  const row = await getLockoutByEmail(email)
  if (!row) {
    return { locked: false, attempts: 0 }
  }

  if (row.lockedAt) {
    return { locked: true, attempts: row.failedLoginAttempts }
  }

  const nextAttempts = row.failedLoginAttempts + 1
  const shouldLock = nextAttempts >= LOGIN_LOCKOUT_THRESHOLD
  const now = new Date()

  await db
    .update(user)
    .set({
      failedLoginAttempts: nextAttempts,
      lockedAt: shouldLock ? now : null,
      updatedAt: now,
    })
    .where(eq(user.id, row.id))

  if (shouldLock) {
    await db.delete(session).where(eq(session.userId, row.id))
    console.warn(
      `[lockout] account locked userId=${row.id} email=${row.email} attempts=${nextAttempts}`,
    )
  }

  return { locked: shouldLock, attempts: nextAttempts }
}

/** Clear failed attempts after a successful password authentication. */
export async function clearFailedLoginAttempts(userId: string): Promise<void> {
  await db
    .update(user)
    .set({
      failedLoginAttempts: 0,
      lockedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(user.id, userId),
        sql`("failedLoginAttempts" <> 0 OR "lockedAt" IS NOT NULL)`,
      ),
    )
}

/** Admin unlock: clear lock + counter, leave sessions to be re-created on next login. */
export async function unlockUserAccount(userId: string): Promise<boolean> {
  const [updated] = await db
    .update(user)
    .set({
      failedLoginAttempts: 0,
      lockedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId))
    .returning({ id: user.id })

  return Boolean(updated)
}

export async function listLockedAccounts(): Promise<LockoutRow[]> {
  return db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedAt: user.lockedAt,
    })
    .from(user)
    .where(isNotNull(user.lockedAt))
    .orderBy(desc(user.lockedAt))
}
