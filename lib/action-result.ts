/** Shared Result type for mutations that should never throw opaque errors to the UI. */
export type ActionOk<T> = { ok: true } & T
export type ActionErr = { ok: false; error: string }
export type ActionResult<T extends Record<string, unknown> = Record<string, never>> = ActionOk<T> | ActionErr

export function actionOk<T extends Record<string, unknown>>(data: T): ActionOk<T> {
  return { ok: true, ...data }
}

export function actionErr(error: string): ActionErr {
  return { ok: false, error }
}

export function toUserError(err: unknown, fallback = "אירעה שגיאה. נסו שוב."): string {
  if (err instanceof Error) {
    const msg = err.message
    if (msg === "Unauthorized") return "יש להתחבר מחדש."
    if (msg === "Forbidden") return "אין הרשאה לבצע פעולה זו."
    // Prefer already-localized Hebrew / validation messages.
    if (/[\u0590-\u05FF]/.test(msg)) return msg
  }
  return fallback
}
