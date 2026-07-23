import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"
import {
  clearFailedLoginAttempts,
  GENERIC_CREDENTIALS_MESSAGE,
  LOCKOUT_USER_MESSAGE,
  recordFailedLoginAttempt,
} from "@/lib/auth/lockout"

const handler = toNextJsHandler(auth.handler)

function isSignInEmailPath(url: string): boolean {
  try {
    const path = new URL(url).pathname
    return path.endsWith("/sign-in/email") || path.includes("/sign-in/email")
  } catch {
    return false
  }
}

async function readSignInEmail(request: Request): Promise<string | null> {
  try {
    const contentType = request.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { email?: unknown }
      return typeof body.email === "string" ? body.email.trim().toLowerCase() : null
    }
    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const form = await request.formData()
      const email = form.get("email")
      return typeof email === "string" ? email.trim().toLowerCase() : null
    }
  } catch {
    return null
  }
  return null
}

async function wrap(method: "GET" | "POST", request: Request): Promise<Response> {
  const trackSignIn = method === "POST" && isSignInEmailPath(request.url)
  const requestForHandler = trackSignIn ? request.clone() : request
  const email = trackSignIn ? await readSignInEmail(request.clone()) : null

  try {
    const response = await handler[method](requestForHandler)

    if (trackSignIn && email) {
      if (response.ok) {
        try {
          const data = (await response.clone().json()) as { user?: { id?: string } }
          if (data.user?.id) {
            await clearFailedLoginAttempts(data.user.id)
          }
        } catch {
          // Non-JSON success body — ignore.
        }
      } else if (response.status === 401 || response.status === 403) {
        const body = await response
          .clone()
          .json()
          .catch(() => null) as { code?: string; message?: string } | null

        if (body?.code === "ACCOUNT_LOCKED") {
          return Response.json(
            { code: "ACCOUNT_LOCKED", message: LOCKOUT_USER_MESSAGE },
            { status: 403 },
          )
        }

        const result = await recordFailedLoginAttempt(email)
        if (result.locked) {
          return Response.json(
            { code: "ACCOUNT_LOCKED", message: LOCKOUT_USER_MESSAGE },
            { status: 403 },
          )
        }

        // Keep credential failures generic (do not reveal whether the email exists).
        if (response.status === 401) {
          return Response.json(
            { code: "INVALID_EMAIL_OR_PASSWORD", message: GENERIC_CREDENTIALS_MESSAGE },
            { status: 401 },
          )
        }
      }
    }

    return response
  } catch (err) {
    console.error(`[api/auth] ${method} failed:`, err instanceof Error ? err.message : err)
    return Response.json(
      {
        error: "AUTH_HANDLER_FAILED",
        message: err instanceof Error ? err.message : "Unknown auth error",
      },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return wrap("GET", request)
}

export async function POST(request: Request) {
  return wrap("POST", request)
}
