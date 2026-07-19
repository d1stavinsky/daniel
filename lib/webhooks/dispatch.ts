import { createHmac, randomUUID } from "crypto"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { webhookDelivery, webhookEndpoint } from "@/lib/db/schema"
import { recordSystemAudit } from "@/lib/audit"

export type WebhookEventName =
  | "claim.document_approved"
  | "claim.stp_verified"
  | "claim.completed"

export type WebhookPayload = {
  id: string
  event: WebhookEventName
  createdAt: string
  data: Record<string, unknown>
}

function parseEvents(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === "string") : []
  } catch {
    return []
  }
}

function signBody(secret: string, body: string, timestamp: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
}

async function deliverOnce(
  endpoint: typeof webhookEndpoint.$inferSelect,
  deliveryId: string,
  body: string,
  timestamp: string,
  signature: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AXIS-Event": JSON.parse(body).event as string,
        "X-AXIS-Delivery": deliveryId,
        "X-AXIS-Timestamp": timestamp,
        "X-AXIS-Signature": `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return { ok: false, status: res.status, error: text.slice(0, 400) }
    }
    return { ok: true, status: res.status }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function processDelivery(deliveryId: string): Promise<void> {
  const [row] = await db
    .select({
      delivery: webhookDelivery,
      endpoint: webhookEndpoint,
    })
    .from(webhookDelivery)
    .innerJoin(webhookEndpoint, eq(webhookEndpoint.id, webhookDelivery.endpointId))
    .where(eq(webhookDelivery.id, deliveryId))
    .limit(1)

  if (!row || !row.endpoint.active) return

  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = signBody(row.endpoint.secret, row.delivery.payload, timestamp)
  const result = await deliverOnce(row.endpoint, deliveryId, row.delivery.payload, timestamp, signature)
  const now = new Date()

  if (result.ok) {
    await db
      .update(webhookDelivery)
      .set({
        status: "success",
        attempts: row.delivery.attempts + 1,
        responseStatus: result.status,
        lastError: null,
        deliveredAt: now,
      })
      .where(eq(webhookDelivery.id, deliveryId))
    return
  }

  const attempts = row.delivery.attempts + 1
  const failed = attempts >= 3
  await db
    .update(webhookDelivery)
    .set({
      status: failed ? "failed" : "pending",
      attempts,
      responseStatus: result.status || null,
      lastError: result.error?.slice(0, 500) ?? "delivery failed",
    })
    .where(eq(webhookDelivery.id, deliveryId))

  if (!failed) {
    await new Promise((r) => setTimeout(r, 500 * attempts))
    await processDelivery(deliveryId)
  }
}

/**
 * Enqueue webhook deliveries for all active endpoints subscribed to the event.
 * Non-blocking for callers.
 */
export function dispatchWebhook(event: WebhookEventName, data: Record<string, unknown>): void {
  void enqueueWebhook(event, data).catch((err) => {
    console.error("[webhook] dispatch failed", event, err)
  })
}

export async function enqueueWebhook(
  event: WebhookEventName,
  data: Record<string, unknown>,
): Promise<void> {
  const endpoints = await db
    .select()
    .from(webhookEndpoint)
    .where(eq(webhookEndpoint.active, true))

  const payload: WebhookPayload = {
    id: randomUUID(),
    event,
    createdAt: new Date().toISOString(),
    data,
  }
  const body = JSON.stringify(payload)

  for (const ep of endpoints) {
    const events = parseEvents(ep.events)
    if (!events.includes(event) && !events.includes("*")) continue

    const deliveryId = randomUUID()
    await db.insert(webhookDelivery).values({
      id: deliveryId,
      endpointId: ep.id,
      event,
      payload: body,
      status: "pending",
      attempts: 0,
      createdAt: new Date(),
    })

    void processDelivery(deliveryId)
  }

  await recordSystemAudit({
    type: "webhook_dispatched",
    meta: { event, claimId: data.claimId ?? null },
  })
}
