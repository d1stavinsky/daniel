"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { APIError } from "better-auth/api"
import { auth } from "@/lib/auth"
import { emailSchema, zodErrorMessage } from "@/lib/schemas"
import { z } from "zod"
import { emailEnabled } from "@/lib/email"

export type ForgotPasswordState = { error: string | null; sent?: boolean }

const requestSchema = z.object({
  email: emailSchema,
})

/**
 * Request a password-reset email via Better Auth.
 * Always returns a generic success message to avoid email enumeration.
 */
export async function requestPasswordResetAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = requestSchema.safeParse({ email: formData.get("email") })
  if (!parsed.success) {
    return { error: zodErrorMessage(parsed.error) }
  }

  if (!emailEnabled()) {
    return {
      error: 'שליחת דוא"ל אינה מוגדרת כרגע. פנו לתמיכת AXIS לאיפוס סיסמה.',
    }
  }

  try {
    await auth.api.requestPasswordReset({
      body: {
        email: parsed.data.email,
        redirectTo: "/reset-password",
      },
      headers: await headers(),
    })
  } catch (err) {
    // Better Auth may throw if sendResetPassword is misconfigured; surface a safe message.
    if (err instanceof APIError && err.body?.code === "RESET_PASSWORD_DISABLED") {
      return { error: "איפוס סיסמה אינו זמין כרגע. פנו לתמיכה." }
    }
    console.error("[requestPasswordReset]", err)
    // Still show success-shaped UX for unknown emails / timing; only hard-fail on config issues.
  }

  return {
    error: null,
    sent: true,
  }
}

export type TokenResetState = { error?: string }

const tokenResetSchema = z
  .object({
    token: z.string().min(1, { message: "קישור האיפוס אינו תקין או שפג תוקפו." }),
    newPassword: z.string().min(8, { message: "הסיסמה החדשה חייבת להכיל לפחות 8 תווים." }),
    confirm: z.string().min(1, { message: "יש לאמת את הסיסמה החדשה." }),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: "הסיסמאות אינן תואמות.",
    path: ["confirm"],
  })

/**
 * Complete a forgot-password reset using the email token (unauthenticated).
 */
export async function completeTokenPasswordReset(
  _prev: TokenResetState,
  formData: FormData,
): Promise<TokenResetState> {
  const parsed = tokenResetSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirm: formData.get("confirm"),
  })
  if (!parsed.success) {
    return { error: zodErrorMessage(parsed.error) }
  }

  try {
    await auth.api.resetPassword({
      body: {
        newPassword: parsed.data.newPassword,
        token: parsed.data.token,
      },
      headers: await headers(),
    })
  } catch (err) {
    if (err instanceof APIError) {
      return { error: "קישור האיפוס אינו תקין או שפג תוקפו. בקשו קישור חדש." }
    }
    console.error("[completeTokenPasswordReset]", err)
    return { error: "עדכון הסיסמה נכשל. נסו שוב." }
  }

  redirect("/login?reset=success")
}
