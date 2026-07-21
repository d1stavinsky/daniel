import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

const handler = toNextJsHandler(auth.handler)

async function wrap(
  method: "GET" | "POST",
  request: Request,
): Promise<Response> {
  try {
    return await handler[method](request)
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
