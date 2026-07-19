"use client"

import useSWR from "swr"
import { Activity, Inbox, Timer } from "lucide-react"
import { getOpsHealth, type OpsHealth } from "@/app/actions/stats"
import { cn } from "@/lib/utils"

const metrics = [
  {
    key: "stp" as const,
    label: "STP",
    hint: "אימות אוטומטי · 7 ימים",
    icon: Activity,
  },
  {
    key: "backlog" as const,
    label: "תיקים בטיפול ידני",
    hint: "תקועים או דורשים התערבות",
    icon: Inbox,
  },
  {
    key: "aging" as const,
    label: "זמן טיפול ממוצע",
    hint: "ימים בהמתנה",
    icon: Timer,
  },
]

function formatStp(health: OpsHealth | undefined): string {
  if (!health || health.stpPercent == null) return "—"
  return `${health.stpPercent}%`
}

function formatBacklog(health: OpsHealth | undefined): string {
  if (!health) return "—"
  return String(health.backlog)
}

function formatAging(health: OpsHealth | undefined): string {
  if (!health || health.agingAvgDays == null) return "—"
  return `${health.agingAvgDays}`
}

function metricValue(key: (typeof metrics)[number]["key"], health: OpsHealth | undefined): string {
  if (key === "stp") return formatStp(health)
  if (key === "backlog") return formatBacklog(health)
  return formatAging(health)
}

function metricAccent(
  key: (typeof metrics)[number]["key"],
  health: OpsHealth | undefined,
): string {
  if (!health) return "bg-muted text-muted-foreground"
  if (key === "stp") {
    if (health.stpPercent == null) return "bg-muted text-muted-foreground"
    if (health.stpPercent >= 90) return "bg-emerald-500/12 text-emerald-600"
    if (health.stpPercent >= 70) return "bg-amber-400/15 text-amber-700"
    return "bg-rose-500/12 text-rose-600"
  }
  if (key === "backlog") {
    if (health.backlog === 0) return "bg-emerald-500/12 text-emerald-600"
    if (health.backlog <= 5) return "bg-amber-400/15 text-amber-700"
    return "bg-rose-500/12 text-rose-600"
  }
  if (health.agingAvgDays == null) return "bg-muted text-muted-foreground"
  if (health.agingAvgDays <= 2) return "bg-emerald-500/12 text-emerald-600"
  if (health.agingAvgDays <= 5) return "bg-amber-400/15 text-amber-700"
  return "bg-rose-500/12 text-rose-600"
}

type OpsHealthSummaryProps = {
  className?: string
}

/** Quiet Luxury ops KPIs — STP %, exception backlog, avg aging days. */
export function OpsHealthSummary({ className }: OpsHealthSummaryProps) {
  const { data: health, isLoading } = useSWR("ops-health", () => getOpsHealth(), {
    refreshInterval: 60_000,
  })

  return (
    <div
      className={cn(
        "grid grid-cols-1 divide-y divide-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:divide-border/70",
        className,
      )}
      dir="rtl"
      aria-busy={isLoading}
    >
      {metrics.map((m) => {
        const Icon = m.icon
        const accent = metricAccent(m.key, health)
        return (
          <div key={m.key} className="flex items-center gap-4 py-4 sm:px-5 sm:py-1 first:pt-0 sm:first:ps-0 last:pb-0 sm:last:pe-0">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                accent,
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 text-right">
              <p className="text-[11px] font-medium text-muted-foreground">
                {m.label}
              </p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                {isLoading && !health ? "…" : metricValue(m.key, health)}
                {m.key === "aging" && health?.agingAvgDays != null && (
                  <span className="ms-1 text-sm font-normal text-muted-foreground">ימים</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">{m.hint}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
