import { z } from "zod"
import { toMoneyNumber } from "@/lib/claims-data"
import { isValidEmail, isValidPlate, normalizeEmail } from "@/lib/validation"

export const emailSchema = z.preprocess(
  (value) => normalizeEmail(typeof value === "string" ? value : String(value ?? "")),
  z
    .string()
    .min(1, { message: 'יש למלא כתובת דוא"ל תקינה.' })
    .max(254, { message: 'כתובת הדוא"ל ארוכה מדי.' })
    .refine((v) => isValidEmail(v), { message: 'יש למלא כתובת דוא"ל תקינה.' }),
)

export const businessNameSchema = z
  .string()
  .trim()
  .min(1, { message: "יש למלא שם עסק." })
  .max(120, { message: "שם העסק ארוך מדי." })

export const personNameSchema = z
  .string()
  .trim()
  .min(1, { message: "יש למלא שם." })
  .max(120, { message: "השם ארוך מדי." })

/** Accepts numbers or locale-formatted strings; always outputs a 2-decimal float (never int-only). */
export const moneySchema = z.preprocess(
  (value) => toMoneyNumber(value),
  z
    .number({ invalid_type_error: "סכום לא תקין." })
    .finite({ message: "סכום לא תקין." })
    .nonnegative({ message: "סכום לא יכול להיות שלילי." })
    .max(50_000_000, { message: "סכום חורג מהמותר." }),
)

export const positiveMoneySchema = z.preprocess(
  (value) => toMoneyNumber(value),
  z
    .number({ invalid_type_error: "סכום לא תקין." })
    .finite({ message: "סכום לא תקין." })
    .positive({ message: "יש למלא סכום תקין." })
    .max(50_000_000, { message: "סכום חורג מהמותר." }),
)

export const createPartnerSchema = z.object({
  businessName: businessNameSchema,
  contactEmail: emailSchema,
})

export const createClaimSchema = z.object({
  clientName: personNameSchema,
  plate: z
    .string()
    .trim()
    .refine((v) => isValidPlate(v), { message: "מספר רכב לא תקין — יש להזין 7 או 8 ספרות." }),
  carModel: z.string().trim().max(120).optional().default(""),
  partnerId: z.string().min(1, { message: "יש לבחור שותף." }),
  requestedAmount: positiveMoneySchema,
})

export const setAmountsSchema = z.object({
  claimId: z.string().min(1, { message: "מזהה תיק חסר." }),
  requested: moneySchema,
  received: moneySchema,
})

export const createTeamMemberSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  partnerId: z.string().min(1).optional(),
})

export const stageNotesSchema = z.object({
  claimId: z.string().min(1),
  stage: z.number().int().min(1).max(9),
  notes: z.string().max(4000, { message: "הערה ארוכה מדי." }),
})

/** Format Zod errors into a single Hebrew-friendly message. */
export function zodErrorMessage(err: z.ZodError): string {
  return err.issues[0]?.message ?? "הנתונים שהוזנו אינם תקינים."
}
