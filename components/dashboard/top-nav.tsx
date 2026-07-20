"use client"

import { useRouter } from "next/navigation"
import { Search, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { NotificationBell } from "@/components/notifications/notification-bell"

type TopNavProps = {
  businessName: string
  searchQuery?: string
  onSearchChange?: (value: string) => void
}

export function TopNav({ businessName, searchQuery = "", onSearchChange }: TopNavProps) {
  const router = useRouter()

  async function logout() {
    await authClient.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="glass sticky top-0 z-30 border-b border-border">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:gap-6 md:px-8">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold text-gold-foreground">
            <span className="text-lg font-bold tracking-tight">A</span>
          </div>
          <div className="hidden flex-col leading-none sm:flex">
            <span className="text-lg font-bold tracking-[0.2em] text-foreground">AXIS</span>
            <span className="text-[10px] font-medium tracking-[0.15em] text-muted-foreground">
              CLAIMS MANAGEMENT
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="חיפוש תביעות, לקוחות או מספר רכב..."
            aria-label="חיפוש תביעות, לקוחות או מספר רכב"
            className="h-10 w-full rounded-lg border border-border bg-secondary/60 pr-10 pl-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:ring-2 focus:ring-ring/30"
          />
        </div>

        {/* Actions — partner view is read-only, so no create/edit controls */}
        <div className="flex items-center gap-2">
          <NotificationBell />
          <div className="hidden items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3 py-1.5 sm:flex">
            <span className="max-w-[12rem] truncate text-sm font-medium text-foreground">{businessName}</span>
          </div>
          <Button variant="outline" onClick={logout} className="gap-2">
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">התנתקות</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
