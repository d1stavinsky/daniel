import type { SessionUser } from "@/lib/session"

export type AppRole = "admin" | "support" | "partner"

export type Permission =
  | "claims:read_all"
  | "claims:read_own"
  | "claims:write"
  | "claims:delete"
  | "documents:approve"
  | "documents:upload"
  | "finance:write"
  | "partners:manage"
  | "exceptions:manage"
  | "webhooks:manage"
  | "settings:manage"
  | "slo:read"
  | "team:manage"

const ROLE_PERMISSIONS: Record<AppRole, ReadonlySet<Permission>> = {
  admin: new Set([
    "claims:read_all",
    "claims:write",
    "claims:delete",
    "documents:approve",
    "documents:upload",
    "finance:write",
    "partners:manage",
    "exceptions:manage",
    "webhooks:manage",
    "settings:manage",
    "slo:read",
    "team:manage",
  ]),
  support: new Set([
    "claims:read_all",
    "documents:approve",
    "documents:upload",
    "exceptions:manage",
    "slo:read",
  ]),
  partner: new Set(["claims:read_own", "documents:upload", "team:manage"]),
}

export function normalizeRole(raw: string | undefined | null): AppRole {
  if (raw === "admin") return "admin"
  if (raw === "support") return "support"
  return "partner"
}

export function hasPermission(user: SessionUser, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[user.role]
  return perms.has(permission)
}

export function isStaff(user: SessionUser): boolean {
  return user.role === "admin" || user.role === "support"
}

export function isFullAdmin(user: SessionUser): boolean {
  return user.role === "admin"
}
