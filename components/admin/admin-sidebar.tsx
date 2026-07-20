"use client"

import { useRouter } from "next/navigation"
import { Workflow, Users, Wallet, Settings, LogOut, X, Inbox } from "lucide-react"
import { AxisLogo } from "@/components/brand/axis-logo"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

import type { AppRole } from "@/lib/rbac"

export type AdminView = "inbox" | "claims" | "finance" | "partners" | "settings"

const navItems: { id: AdminView; label: string; icon: typeof Workflow }[] = [
  { id: "inbox", label: "תיבת משימות", icon: Inbox },
  { id: "claims", label: "תיקים", icon: Workflow },
  { id: "finance", label: "כספים", icon: Wallet },
  { id: "partners", label: "שותפים", icon: Users },
  { id: "settings", label: "הגדרות", icon: Settings },
]

type AdminSidebarProps = {
  active: AdminView
  onNavigate: (view: AdminView) => void
  open: boolean
  onClose: () => void
  currentUser: { name: string; email: string }
  userRole?: AppRole
  /** Backlog badge on Inbox (unhandled STP exceptions). */
  inboxBadge?: number
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]).join("") || "AX"
}

export function AdminSidebar({
  active,
  onNavigate,
  open,
  onClose,
  currentUser,
  userRole = "admin",
  inboxBadge = 0,
}: AdminSidebarProps) {
  const router = useRouter()
  const visibleNav = navItems.filter((item) => {
    if (userRole === "support") {
      return item.id !== "partners" && item.id !== "finance"
    }
    return true
  })

  async function logout() {
    await authClient.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "pointer-events-auto fixed inset-y-0 right-0 z-40 flex w-64 flex-col border-l border-sidebar-border bg-sidebar transition-transform duration-300 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <AxisLogo />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted lg:hidden"
            aria-label="סגור תפריט"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="ניווט ראשי">
          {visibleNav.map((item) => {
            const Icon = item.icon
            const isActive = active === item.id
            const showBadge = item.id === "inbox" && inboxBadge > 0
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.id)
                  onClose()
                }}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-gold/12 text-gold"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                {isActive && (
                  <span
                    className="pointer-events-none absolute inset-y-2 right-0 w-0.5 rounded-full bg-gold"
                    aria-hidden="true"
                  />
                )}
                <Icon className="pointer-events-none size-5 shrink-0" aria-hidden="true" />
                <span className="pointer-events-none flex-1 text-right">{item.label}</span>
                {showBadge && (
                  <span className="pointer-events-none rounded-md bg-legal/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-legal-foreground">
                    {inboxBadge > 99 ? "99+" : inboxBadge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground ring-1 ring-gold/30">
              {initials(currentUser.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{currentUser.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {userRole === "support" ? "תמיכה" : "מנהל מערכת"}
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="התנתקות"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
