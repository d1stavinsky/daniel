"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/session"
import {
  listLockedAccounts,
  unlockUserAccount,
  type LockoutRow,
} from "@/lib/auth/lockout"

export type LockedAccountRow = {
  id: string
  email: string
  name: string
  role: string
  failedLoginAttempts: number
  lockedAt: string
}

export type UnlockAccountResult = { ok: true } | { ok: false; error: string }

export async function listLockedUserAccounts(): Promise<LockedAccountRow[]> {
  await requireAdmin()
  const rows: LockoutRow[] = await listLockedAccounts()
  return rows
    .filter((row) => row.lockedAt)
    .map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      failedLoginAttempts: row.failedLoginAttempts,
      lockedAt: row.lockedAt!.toISOString(),
    }))
}

export async function unlockUserAccountAction(userId: string): Promise<UnlockAccountResult> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, error: "אין הרשאה לבצע פעולה זו." }
  }

  if (!userId?.trim()) {
    return { ok: false, error: "מזהה משתמש חסר." }
  }

  const ok = await unlockUserAccount(userId.trim())
  if (!ok) {
    return { ok: false, error: "המשתמש לא נמצא." }
  }

  revalidatePath("/admin")
  return { ok: true }
}
