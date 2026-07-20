"use server"

import { z } from "zod"
import { sendAlertEmail } from "@/lib/email"

export type JoinLeadState = {
  error: string | null
  success: boolean
}

const joinLeadSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "נא להזין שם מלא.")
    .max(100, "השם ארוך מדי."),
  businessName: z
    .string()
    .trim()
    .min(2, "נא להזין שם עסק / מוסך / סוכנות.")
    .max(120, "שם העסק ארוך מדי."),
  phone: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s\-()]/g, ""))
    .refine((value) => /^0\d{8,9}$/.test(value) || /^972\d{8,9}$/.test(value), {
      message: "נא להזין מספר טלפון ישראלי תקין.",
    }),
  email: z
    .string()
    .trim()
    .email('כתובת דוא"ל אינה תקינה.')
    .max(160),
  partnerType: z.enum(["garage", "agency", "other"], {
    errorMap: () => ({ message: "נא לבחור סוג שותף." }),
  }),
  message: z
    .string()
    .trim()
    .max(1000, "ההודעה ארוכה מדי.")
    .optional()
    .transform((value) => value || ""),
})

const partnerTypeLabels: Record<z.infer<typeof joinLeadSchema>["partnerType"], string> = {
  garage: "מוסך",
  agency: "סוכנות ביטוח",
  other: "שותף מקצועי אחר",
}

function leadsInbox(): string | null {
  return (
    process.env.LEADS_INBOX_EMAIL?.trim() ||
    process.env.RESEND_FROM?.match(/<([^>]+)>/)?.[1]?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    null
  )
}

export async function submitJoinLeadAction(
  _prev: JoinLeadState,
  formData: FormData,
): Promise<JoinLeadState> {
  const parsed = joinLeadSchema.safeParse({
    fullName: formData.get("fullName"),
    businessName: formData.get("businessName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    partnerType: formData.get("partnerType"),
    message: formData.get("message"),
  })

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "הטופס אינו תקין.",
      success: false,
    }
  }

  const lead = parsed.data
  const inbox = leadsInbox()

  console.log(
    `NEW JOIN LEAD: ${lead.fullName} · ${lead.businessName} · ${lead.email} · ${lead.phone} · ${partnerTypeLabels[lead.partnerType]}`,
  )

  if (!inbox) {
    console.warn("[join-lead] LEADS_INBOX_EMAIL / RESEND_FROM not configured — lead logged only")
    return { error: null, success: true }
  }

  const sent = await sendAlertEmail({
    to: inbox,
    subject: `פנייה חדשה להצטרפות · ${lead.businessName}`,
    heading: "פנייה חדשה להצטרפות לאינשורה",
    lines: [
      `שם מלא: ${lead.fullName}`,
      `עסק: ${lead.businessName}`,
      `סוג שותף: ${partnerTypeLabels[lead.partnerType]}`,
      `טלפון: ${lead.phone}`,
      `דוא״ל: ${lead.email}`,
      lead.message ? `הודעה: ${lead.message}` : "הודעה: —",
    ],
  })

  if (!sent.ok) {
    console.error("[join-lead] email delivery failed")
    // Lead is still captured in logs; do not block the user.
  }

  return { error: null, success: true }
}
