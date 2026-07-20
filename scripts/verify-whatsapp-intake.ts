/**
 * Unit checks for WhatsApp Intake parser + phone helpers.
 * Usage: npx tsx scripts/verify-whatsapp-intake.ts
 */

import { isValidIsraeliMobile, normalizeIsraeliPhoneE164, formatIsraeliPhoneDisplay } from "@/lib/phone"
import {
  parseWhatsAppIntakeMessage,
  WHATSAPP_INTAKE_BAD_PHONE,
  WHATSAPP_INTAKE_BAD_PLATE,
  WHATSAPP_INTAKE_FORMAT_HINT,
} from "@/lib/whatsapp/intake-parser"

let failures = 0
function check(name: string, ok: boolean) {
  if (!ok) failures++
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`)
}

check("mobile 0501234567", isValidIsraeliMobile("0501234567"))
check("mobile +972501234567", isValidIsraeliMobile("+972501234567"))
check("reject landline-ish", !isValidIsraeliMobile("039123456"))
check("e164 normalize", normalizeIsraeliPhoneE164("050-123-4567") === "972501234567")
check("display", formatIsraeliPhoneDisplay("972501234567") === "050-123-4567")

const ok = parseWhatsAppIntakeMessage("קליטה 0501234567 12-34-56 ישראל ישראלי")
check("parse ok", ok.ok === true)
if (ok.ok) {
  check("plate", ok.plateDisplay === "12-345-6")
  check("phone", ok.phoneE164 === "972501234567")
  check("customer name", ok.customerName === "ישראל ישראלי")
}

const spaced = parseWhatsAppIntakeMessage("קליטה 052-1112233 12345678 מיכל כהן")
check(
  "8-digit plate rejected",
  spaced.ok === false && (spaced as { reason: string }).reason === "bad_plate",
)
check("6-digit plate", parseWhatsAppIntakeMessage("קליטה 0501234567 123456 מיכל כהן").ok === true)
check("7-digit plate", parseWhatsAppIntakeMessage("קליטה 0501234567 1234567 מיכל כהן").ok === true)

check(
  "missing plate → bad_format",
  (parseWhatsAppIntakeMessage("קליטה 0501234567") as { reason: string }).reason === "bad_format",
)
check(
  "missing phone → bad_format",
  (parseWhatsAppIntakeMessage("קליטה") as { reason: string }).reason === "bad_format",
)
check(
  "missing customer name → bad_format",
  (parseWhatsAppIntakeMessage("קליטה 0501234567 123456") as { reason: string }).reason ===
    "bad_format",
)
check(
  "plate shorter than 6 → bad_plate",
  parseWhatsAppIntakeMessage("קליטה 0501234567 12345 מיכל כהן").ok === false &&
    (parseWhatsAppIntakeMessage("קליטה 0501234567 12345 מיכל כהן") as { reason: string }).reason ===
      "bad_plate",
)
check(
  "international phone rejected by strict command",
  parseWhatsAppIntakeMessage("קליטה +972501234567 123456 מיכל כהן").ok === false &&
    (parseWhatsAppIntakeMessage("קליטה +972501234567 123456 מיכל כהן") as { reason: string }).reason ===
      "bad_phone",
)
check(
  "landline rejected by strict command",
  parseWhatsAppIntakeMessage("קליטה 0391234567 123456 מיכל כהן").ok === false,
)
check("not intake", parseWhatsAppIntakeMessage("שלום").ok === false && (parseWhatsAppIntakeMessage("שלום") as { reason: string }).reason === "not_intake")

check(
  "format hint copy",
  WHATSAPP_INTAKE_FORMAT_HINT ===
    "פורמט לא תקין, אנא שלח: קליטה [טלפון] [רכב] [שם לקוח]",
)
check("plate error copy", WHATSAPP_INTAKE_BAD_PLATE.includes("מספר הרכב אינו תקין"))
check("phone error copy", WHATSAPP_INTAKE_BAD_PHONE.includes("מספר הטלפון אינו תקין"))

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exitCode = 1
} else {
  console.log("\nAll WhatsApp intake checks passed.")
}
