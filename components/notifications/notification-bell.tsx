"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Bell, AlertTriangle, FileWarning, CheckCheck } from "lucide-react"
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/app/actions/notifications"
import { cn } from "@/lib/utils"

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "עכשיו"
  if (mins < 60) return `לפני ${mins} דק׳`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `לפני ${hrs} שע׳`
  const days = Math.floor(hrs / 24)
  return `לפני ${days} ימים`
}

export function NotificationBell() {
  const { data, mutate } = useSWR<AppNotification[]>("notifications", () => listMyNotifications(), {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  })
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const items = data ?? []
  const unread = items.filter((n) => !n.read).length

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  async function handleOpen() {
    setOpen((v) => !v)
  }

  async function onItemClick(n: AppNotification) {
    if (!n.read) {
      await markNotificationRead(n.id)
      mutate()
    }
  }

  async function onMarkAll() {
    await markAllNotificationsRead()
    mutate()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={`התראות${unread > 0 ? ` (${unread} חדשות)` : ""}`}
        aria-expanded={open}
        className="relative inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-gold-foreground ring-2 ring-card">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-12 z-50 w-[22rem] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">התראות</h3>
            {unread > 0 && (
              <button
                type="button"
                onClick={onMarkAll}
                className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
              >
                <CheckCheck className="size-3.5" />
                סמן הכל כנקרא
              </button>
            )}
          </div>

          <div className="max-h-[24rem] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">אין התראות</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onItemClick(n)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-right transition-colors hover:bg-secondary/60",
                        !n.read && "bg-gold/5",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                          n.type === "stuck_claim" ? "bg-destructive/15 text-destructive" : "bg-gold/15 text-gold",
                        )}
                      >
                        {n.type === "stuck_claim" ? (
                          <AlertTriangle className="size-4" />
                        ) : (
                          <FileWarning className="size-4" />
                        )}
                      </span>
                      <span className="flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{n.title}</span>
                          {!n.read && <span className="size-1.5 rounded-full bg-gold" />}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{n.body}</span>
                        <span className="mt-1 block text-[11px] text-muted-foreground/70">{timeAgo(n.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
