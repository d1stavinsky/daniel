/**
 * Resolve garage partner from inbound WhatsApp sender number.
 */

import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { partner } from "@/lib/db/schema"
import { normalizeIsraeliPhoneE164, stripWhatsAppAddress } from "@/lib/phone"

export type ResolvedIntakePartner = {
  id: string
  businessName: string
}

/**
 * Match Twilio/Meta `From` to partner.whatsappPhone, else WHATSAPP_INTAKE_DEFAULT_PARTNER_ID.
 */
export async function resolvePartnerForWhatsAppSender(
  fromRaw: string,
): Promise<ResolvedIntakePartner | null> {
  const e164 = normalizeIsraeliPhoneE164(stripWhatsAppAddress(fromRaw))

  if (e164) {
    const rows = await db
      .select({ id: partner.id, businessName: partner.businessName, whatsappPhone: partner.whatsappPhone, status: partner.status })
      .from(partner)
      .where(eq(partner.status, "active"))

    for (const row of rows) {
      if (!row.whatsappPhone) continue
      const stored = normalizeIsraeliPhoneE164(row.whatsappPhone)
      if (stored && stored === e164) {
        return { id: row.id, businessName: row.businessName }
      }
    }
  }

  const fallbackId = process.env.WHATSAPP_INTAKE_DEFAULT_PARTNER_ID?.trim()
  if (!fallbackId) return null

  const [fallback] = await db
    .select({ id: partner.id, businessName: partner.businessName })
    .from(partner)
    .where(and(eq(partner.id, fallbackId), eq(partner.status, "active")))
    .limit(1)

  return fallback ?? null
}
