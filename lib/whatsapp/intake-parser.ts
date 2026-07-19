/**
 * WhatsApp Intake — parse `קליטה [phone] [plate] [customer name]` messages.
 * Client-safe pure helpers (no DB / Node-only imports).
 */

import { normalizePlate } from "@/lib/validation"
import {
  normalizeIsraeliPhoneE164,
  formatIsraeliPhoneDisplay,
} from "@/lib/phone"

export const WHATSAPP_INTAKE_KEYWORD = "קליטה"
export const WHATSAPP_INTAKE_FORMAT_HINT =
  "פורמט לא תקין, אנא שלח: קליטה [טלפון] [רכב] [שם לקוח]"
export const WHATSAPP_INTAKE_BAD_PLATE =
  "מספר הרכב אינו תקין. אנא וודא שהקלדת מספר רכב מלא"
export const WHATSAPP_INTAKE_BAD_PHONE =
  "מספר הטלפון אינו תקין. אנא וודא שהקלדת מספר טלפון ישראלי מלא"

export type WhatsAppIntakeParseOk = {
  ok: true
  plate: string
  plateDisplay: string
  phoneE164: string
  phoneDisplay: string
  customerName: string
}

export type WhatsAppIntakeParseFail = {
  ok: false
  reason: "not_intake" | "bad_format" | "bad_plate" | "bad_phone"
}

export type WhatsAppIntakeParseResult = WhatsAppIntakeParseOk | WhatsAppIntakeParseFail

/**
 * Parse an inbound WhatsApp body.
 * Expected: קליטה <10-digit Israeli mobile starting 05> <plate 6–7 digits> <customer name>.
 * The command intentionally requires local mobile form; +972 is rejected.
 */
export function parseWhatsAppIntakeMessage(body: string): WhatsAppIntakeParseResult {
  const trimmed = body.replace(/\u200f|\u200e/g, "").trim()
  const keyword = trimmed.match(/^קליטה(?:\s+|$)/u)
  if (!keyword) {
    return logParse(body, { ok: false, reason: "not_intake" })
  }

  // Capture exactly three logical parts. The third capture intentionally takes
  // the remaining text so full customer names may contain spaces.
  const remainder = trimmed.slice(keyword[0].length).trim()
  const parts = remainder.match(/^(\S+)\s+(\S+)\s+(.+)$/u)
  if (!parts) {
    return logParse(body, { ok: false, reason: "bad_format" })
  }

  const phoneRaw = parts[1]!
  const plateRaw = parts[2]!
  const customerName = parts[3]!.replace(/\s+/g, " ").trim()

  const localPhone = phoneRaw.replace(/\D/g, "")
  if (!/^[\d-]+$/.test(phoneRaw) || localPhone.length !== 10 || !localPhone.startsWith("05")) {
    return logParse(body, { ok: false, reason: "bad_phone" })
  }

  const plate = plateRaw.replace(/\D/g, "")
  if (!/^[\d-]+$/.test(plateRaw) || plate.length < 6 || plate.length > 7) {
    return logParse(body, { ok: false, reason: "bad_plate" })
  }

  if (
    customerName.length < 2 ||
    customerName.length > 100 ||
    /[\u0000-\u001F\u007F]/.test(customerName)
  ) {
    return logParse(body, { ok: false, reason: "bad_format" })
  }

  const phoneE164 = normalizeIsraeliPhoneE164(phoneRaw)
  if (!phoneE164) {
    return logParse(body, { ok: false, reason: "bad_phone" })
  }

  const plateDisplay = normalizePlate(plateRaw)
  return logParse(body, {
    ok: true,
    plate: plateDisplay,
    plateDisplay,
    phoneE164,
    phoneDisplay: formatIsraeliPhoneDisplay(phoneE164),
    customerName,
  })
}

function logParse(rawMessage: string, result: WhatsAppIntakeParseResult): WhatsAppIntakeParseResult {
  const debugEnabled =
    typeof process !== "undefined" &&
    (process.env.NODE_ENV !== "production" || process.env.WHATSAPP_INTAKE_DEBUG === "true")
  if (debugEnabled) {
    console.log("[whatsapp-intake-parser]", { rawMessage, result })
  }
  return result
}

export function whatsappIntakeSuccessReply(plateDisplay: string): string {
  return `התיק נפתח בהצלחה עבור רכב ${plateDisplay}. קישור מאובטח להעלאת המסמכים נשלח ללקוח.`
}
