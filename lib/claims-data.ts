export type ClaimStatus = "appraisal" | "waiting" | "settled" | "legal"

export type Claim = {
  id: string
  clientName: string
  plate: string
  value: number
  status: ClaimStatus
  date: string
}

export const statusLabels: Record<ClaimStatus, string> = {
  appraisal: "בשמאות",
  waiting: "ממתין לאישור",
  settled: "הוסדר",
  legal: "בהליך משפטי",
}

export const financialSummary = {
  legal: 1_284_500,
  trust: 3_920_000,
  garage: 742_300,
}

export const claims: Claim[] = [
  { id: "CLM-4821", clientName: "דניאל אברהמי", plate: "34-812-05", value: 48200, status: "appraisal", date: "12.07.2026" },
  { id: "CLM-4820", clientName: "מיכל בן דוד", plate: "921-47-301", value: 126500, status: "waiting", date: "11.07.2026" },
  { id: "CLM-4819", clientName: "יוסף כהן", plate: "55-244-88", value: 31900, status: "settled", date: "10.07.2026" },
  { id: "CLM-4818", clientName: "נועה שרון", plate: "712-33-902", value: 89400, status: "legal", date: "09.07.2026" },
  { id: "CLM-4817", clientName: "אבי לוי", plate: "18-905-62", value: 54700, status: "appraisal", date: "08.07.2026" },
  { id: "CLM-4816", clientName: "תמר גולן", plate: "440-27-118", value: 213000, status: "waiting", date: "07.07.2026" },
  { id: "CLM-4815", clientName: "רון מזרחי", plate: "63-771-24", value: 27800, status: "settled", date: "06.07.2026" },
  { id: "CLM-4814", clientName: "ליאת פרץ", plate: "802-19-556", value: 95600, status: "legal", date: "05.07.2026" },
]

export function formatCurrency(value: number): string {
  const n = toMoneyNumber(value)
  if (!Number.isFinite(n)) return "—"
  // Use en-US grouping so thousands never look like decimals (avoids "18.243,84" / "18.243.84").
  const body = n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `₪${body}`
}

/** Format a money value for controlled inputs (plain `12345.67`, no grouping). */
export function formatMoneyInput(value: number | string): string {
  const n = toMoneyNumber(value)
  if (!Number.isFinite(n)) return "0.00"
  return n.toFixed(2)
}

/** Coerce DB / form values to a finite shekel amount rounded to 2 decimals. */
export function toMoneyNumber(raw: unknown): number {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return NaN
    return Math.round(raw * 100) / 100
  }
  if (typeof raw === "bigint") return toMoneyNumber(Number(raw))
  if (raw == null) return NaN
  return parseMoneyInput(String(raw))
}

/**
 * Parse a money string that may use US (`18,243.84`) or EU (`18.243,84`) separators.
 * Ambiguous multi-dot forms like `18.243.84` treat the last group as decimals when it has 1–2 digits.
 */
export function parseMoneyInput(raw: string): number {
  let s = raw.trim().replace(/[₪$€\s\u00a0\u200f\u200e]/g, "")
  if (!s) return NaN

  const negative = s.startsWith("-")
  if (negative) s = s.slice(1)

  const hasComma = s.includes(",")
  const hasDot = s.includes(".")

  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // 18.243,84
      s = s.replace(/\./g, "").replace(",", ".")
    } else {
      // 18,243.84
      s = s.replace(/,/g, "")
    }
  } else if (hasComma) {
    // 18243,84 (decimal) vs 18,243 (thousands)
    if (/,\d{1,2}$/.test(s)) {
      s = s.replace(",", ".")
      const idx = s.lastIndexOf(".")
      s = s.slice(0, idx).replace(/\./g, "") + s.slice(idx)
    } else {
      s = s.replace(/,/g, "")
    }
  } else if (hasDot) {
    const parts = s.split(".")
    if (parts.length > 2) {
      const last = parts[parts.length - 1] ?? ""
      if (last.length <= 2) {
        s = `${parts.slice(0, -1).join("")}.${last}`
      } else {
        s = parts.join("")
      }
    }
  }

  s = s.replace(/[^\d.]/g, "")
  if (!s || s === ".") return NaN
  const n = Number(s)
  if (!Number.isFinite(n)) return NaN
  const rounded = Math.round(n * 100) / 100
  return negative ? -rounded : rounded
}

export function moneyEquals(a: unknown, b: unknown): boolean {
  const left = toMoneyNumber(a)
  const right = toMoneyNumber(b)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false
  return Math.round(left * 100) === Math.round(right * 100)
}
