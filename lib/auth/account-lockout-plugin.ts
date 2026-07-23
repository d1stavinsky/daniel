import { createAuthMiddleware, APIError } from "better-auth/api"
import {
  getLockoutByEmail,
  isAccountLocked,
  LOCKOUT_USER_MESSAGE,
} from "@/lib/auth/lockout"

/**
 * Blocks credential sign-in for locked accounts (API + server-action paths).
 * Attempt counters are updated in loginAction / the auth route wrapper.
 */
export function accountLockoutPlugin() {
  return {
    id: "account-lockout",
    hooks: {
      before: [
        {
          matcher: (ctx: { path?: string }) => ctx.path === "/sign-in/email",
          handler: createAuthMiddleware(async (ctx) => {
            const email = typeof ctx.body?.email === "string" ? ctx.body.email : ""
            if (!email) return

            const row = await getLockoutByEmail(email)
            if (isAccountLocked(row)) {
              throw new APIError("FORBIDDEN", {
                message: LOCKOUT_USER_MESSAGE,
                code: "ACCOUNT_LOCKED",
              })
            }
          }),
        },
      ],
    },
  }
}
