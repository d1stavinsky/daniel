import type { ClaimStatus } from "@/lib/claims-data"

export type Partner = {
  id: string
  name: string
  type: "garage" | "agency"
}

export type AdminClaim = {
  id: string
  clientName: string
  plate: string
  partnerId: string
  status: ClaimStatus
  value: number
  date: string
}

export type PartnerUser = {
  id: string
  name: string
  email: string
  partnerId: string
  role: "manager" | "clerk"
  active: boolean
}

export const partnerTypeLabels: Record<Partner["type"], string> = {
  garage: "מוסך",
  agency: "סוכנות ביטוח",
}

export const userRoleLabels: Record<PartnerUser["role"], string> = {
  manager: "מנהל",
  clerk: "פקיד",
}

export const partners: Partner[] = [
  { id: "P-01", name: "מוסך מרכזי תל אביב", type: "garage" },
  { id: "P-02", name: "סוכנות ביטוח הראל ושות'", type: "agency" },
  { id: "P-03", name: "מוסך הצפון חיפה", type: "garage" },
  { id: "P-04", name: "סוכנות כלל דרום", type: "agency" },
  { id: "P-05", name: "מוסך פרימיום ירושלים", type: "garage" },
]

export const initialAdminClaims: AdminClaim[] = [
  { id: "CLM-4821", clientName: "דניאל אברהמי", plate: "34-812-05", partnerId: "P-01", status: "appraisal", value: 48200, date: "12.07.2026" },
  { id: "CLM-4820", clientName: "מיכל בן דוד", plate: "921-47-301", partnerId: "P-02", status: "waiting", value: 126500, date: "11.07.2026" },
  { id: "CLM-4819", clientName: "יוסף כהן", plate: "55-244-88", partnerId: "P-03", status: "settled", value: 31900, date: "10.07.2026" },
  { id: "CLM-4818", clientName: "נועה שרון", plate: "712-33-902", partnerId: "P-01", status: "waiting", value: 89400, date: "09.07.2026" },
  { id: "CLM-4817", clientName: "אבי לוי", plate: "18-905-62", partnerId: "P-04", status: "appraisal", value: 54700, date: "08.07.2026" },
  { id: "CLM-4816", clientName: "תמר גולן", plate: "440-27-118", partnerId: "P-05", status: "waiting", value: 213000, date: "07.07.2026" },
  { id: "CLM-4815", clientName: "רון מזרחי", plate: "63-771-24", partnerId: "P-02", status: "settled", value: 27800, date: "06.07.2026" },
  { id: "CLM-4814", clientName: "ליאת פרץ", plate: "802-19-556", partnerId: "P-03", status: "appraisal", value: 95600, date: "05.07.2026" },
]

export const initialPartnerUsers: PartnerUser[] = [
  { id: "U-01", name: "אורי שגב", email: "uri@tlv-garage.co.il", partnerId: "P-01", role: "manager", active: true },
  { id: "U-02", name: "שירה כהן", email: "shira@harel-ins.co.il", partnerId: "P-02", role: "clerk", active: true },
  { id: "U-03", name: "מוטי דהן", email: "moti@north-garage.co.il", partnerId: "P-03", role: "manager", active: false },
  { id: "U-04", name: "יעל אזולאי", email: "yael@clal-south.co.il", partnerId: "P-04", role: "clerk", active: true },
]

export function partnerName(partnerId: string): string {
  return partners.find((p) => p.id === partnerId)?.name ?? "—"
}
