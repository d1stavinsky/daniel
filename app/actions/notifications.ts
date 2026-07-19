"use server"

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { notification } from "@/lib/db/schema"
import { requireAdmin, requireStaff, requireUser } from "@/lib/session"
import { scanSlaBreaches, scanStuckClaims, type ScanResult, type SlaScanResult } from "@/lib/notifications"

export type AppNotification = {
  id: string
  type: string
  title: string
  body: string
  claimId: string | null
  read: boolean
  createdAt: string
}

/**
 * Notifications visible to the current user:
 *   admin   -> audience "admin"
 *   partner -> audience "partner" AND their own partnerId (tenant-scoped)
 */
export async function listMyNotifications(): Promise<AppNotification[]> {
  const user = await requireUser()
  const where =
    user.role === "admin" || user.role === "support"
      ? eq(notification.audience, "admin")
      : and(eq(notification.audience, "partner"), eq(notification.recipientPartnerId, user.partnerId ?? "__none__"))

  const rows = await db
    .select()
    .from(notification)
    .where(where)
    .orderBy(desc(notification.createdAt))
    .limit(50)

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    claimId: r.claimId,
    read: r.read,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function markNotificationRead(id: string): Promise<void> {
  const user = await requireUser()
  // Scope the update so a user can only mark their own notifications.
  const scope =
    user.role === "admin" || user.role === "support"
      ? eq(notification.audience, "admin")
      : and(eq(notification.audience, "partner"), eq(notification.recipientPartnerId, user.partnerId ?? "__none__"))
  await db
    .update(notification)
    .set({ read: true })
    .where(and(eq(notification.id, id), scope))
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser()
  const scope =
    user.role === "admin"
      ? and(eq(notification.audience, "admin"), eq(notification.read, false))
      : and(
          eq(notification.audience, "partner"),
          eq(notification.recipientPartnerId, user.partnerId ?? "__none__"),
          eq(notification.read, false),
        )
  await db.update(notification).set({ read: true }).where(scope)
}

/** Admin-triggered scan for stuck claims (also runnable via cron route). */
export async function runStuckScan(): Promise<ScanResult> {
  await requireStaff()
  const result = await scanStuckClaims()
  // SLA monitor rides along with the manual scan so operators get both.
  try {
    await scanSlaBreaches()
  } catch (err) {
    console.error("[notifications] sla scan failed", err)
  }
  return result
}

/** Admin-triggered SLA breach scan (Investigation/Demand > SLA_BREACH_DAYS). */
export async function runSlaScan(): Promise<SlaScanResult> {
  await requireStaff()
  return scanSlaBreaches()
}
