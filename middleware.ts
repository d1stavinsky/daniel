import { NextResponse, type NextRequest } from "next/server"

/**
 * Edge-safe optimistic auth gate (P4).
 *
 * IMPORTANT: This file MUST NOT import @/lib/auth, session, db, audit, or any
 * Node built-ins (pg, crypto, better-auth server). Those pull `node:util/types`
 * and break the Edge Runtime.
 *
 * Full RBAC (admin / support / partner + tenant isolation) is enforced in
 * Node.js server components, server actions, and route handlers via
 * requireAdmin / requireStaff / requirePartner / requireClaimAccess.
 */

const STAFF_PREFIXES = ["/admin"]
const PARTNER_PREFIXES = ["/dashboard", "/portal"]

/** Better Auth session cookie names (dev + production secure prefix). */
function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get("better-auth.session_token")?.value ||
      request.cookies.get("__Secure-better-auth.session_token")?.value,
  )
}

/**
 * Defense-in-depth: redirect unauthenticated users away from app shells.
 * Does not read role — pages already redirect by role after Node session load.
 */
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const needsAuth =
    STAFF_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) ||
    PARTNER_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))

  if (!needsAuth) {
    return NextResponse.next()
  }

  if (!hasSessionCookie(request)) {
    const login = new URL("/login", request.url)
    login.searchParams.set("next", path)
    return NextResponse.redirect(login)
  }

  const res = NextResponse.next()
  res.headers.set("x-request-start", String(Date.now()))
  return res
}

export const config = {
  // Pages only — API auth stays in Node route handlers (no Edge bundling of pg).
  matcher: ["/admin/:path*", "/dashboard/:path*", "/portal/:path*"],
}
