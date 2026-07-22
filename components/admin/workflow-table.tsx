"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Search, ChevronLeft, ChevronRight, Clock, Building2, Car, Loader2 } from "lucide-react"
import { FieldSelect } from "@/components/admin/field-select"
import { ClaimProgressBadge } from "@/components/admin/claim-progress-badge"
import { ClaimStatusIndicator } from "@/components/admin/claim-status-indicator"
import { MatchBadge } from "@/components/admin/match-badge"
import { Sparkline } from "@/components/admin/sparkline"
import {
  claimProgressLabels,
  matchState,
  formatCurrency,
  isOverdue,
  type ClaimProgressStatus,
  type WorkflowClaim,
} from "@/lib/workflow-data"
import type { PaginatedResult } from "@/lib/pagination"
import { cn } from "@/lib/utils"

type WorkflowTableProps = {
  partnerOptions: { id: string; name: string }[]
  onOpen: (claim: WorkflowClaim) => void
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "כל הסטטוסים" },
  { value: "pending", label: claimProgressLabels.pending },
  { value: "in_progress", label: claimProgressLabels.in_progress },
  { value: "pending_resolution", label: claimProgressLabels.pending_resolution },
  { value: "completed", label: claimProgressLabels.completed },
]

async function fetchClaimsPage(params: URLSearchParams): Promise<PaginatedResult<WorkflowClaim>> {
  const res = await fetch(`/api/claims?${params.toString()}`, { credentials: "same-origin" })
  if (!res.ok) throw new Error(`Failed to load claims (${res.status})`)
  return res.json() as Promise<PaginatedResult<WorkflowClaim>>
}

export function WorkflowTable({ partnerOptions, onOpen }: WorkflowTableProps) {
  const [partnerFilter, setPartnerFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const params = useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", String(page))
    p.set("pageSize", "24")
    if (debouncedQuery.trim()) p.set("q", debouncedQuery.trim())
    if (partnerFilter !== "all") p.set("partnerId", partnerFilter)
    if (statusFilter !== "all") p.set("status", statusFilter)
    return p
  }, [page, debouncedQuery, partnerFilter, statusFilter])

  const { data, error, isLoading } = useSWR(
    ["claims-page", params.toString()],
    () => fetchClaimsPage(params),
    { keepPreviousData: true },
  )

  const claims = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const partnerFilterOptions = useMemo(
    () => [{ value: "all", label: "כל השותפים" }, ...partnerOptions.map((p) => ({ value: p.id, label: p.name }))],
    [partnerOptions],
  )

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-semibold text-foreground">תיקי תביעה</h2>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString("he-IL")} תביעות · עמוד {page} מתוך {totalPages}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-56">
            <Search
              className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש לקוח / תביעה / רכב"
              aria-label="חיפוש תביעות"
              className="h-9 w-full rounded-lg border border-border bg-card/60 pr-8 pl-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            />
          </div>
          <FieldSelect
            value={partnerFilter}
            onChange={(v) => {
              setPartnerFilter(v)
              setPage(1)
            }}
            options={partnerFilterOptions}
            aria-label="סינון לפי שותף"
            className="sm:w-44"
          />
          <FieldSelect
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v)
              setPage(1)
            }}
            options={STATUS_FILTERS}
            aria-label="סינון לפי סטטוס"
            className="sm:w-44"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error instanceof Error ? error.message : "שגיאה בטעינת תביעות"}
        </p>
      )}

      {isLoading && claims.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          טוען תביעות…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {claims.map((claim) => {
            const overdue = isOverdue(claim)
            return (
              <button
                key={claim.id}
                type="button"
                onClick={() => onOpen(claim)}
                className={cn(
                  "group flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 text-right",
                  "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/70 hover:shadow-lg hover:shadow-black/20",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{claim.clientName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{claim.id}</p>
                  </div>
                  <MatchBadge state={matchState(claim)} />
                </div>

                <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Car className="size-3.5" aria-hidden="true" />
                    {claim.carModel} · {claim.plate}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="size-3.5" aria-hidden="true" />
                    {claim.partnerName}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <ClaimProgressBadge
                    status={claim.progressStatus}
                    uploadedCount={claim.uploadedDocCount}
                    compact
                  />
                  <ClaimStatusIndicator
                    verification={
                      claim.verification ?? {
                        tone: "red",
                        percent: 0,
                        verifiedCount: 0,
                        requiredCount: claim.requiredDocCount,
                      }
                    }
                  />
                </div>

                <div className="flex items-end justify-between gap-3 border-t border-border/70 pt-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground">נדרש · התקבל</span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(claim.requestedAmount)}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {claim.receivedAmount > 0 ? formatCurrency(claim.receivedAmount) : "טרם התקבל"}
                    </span>
                  </div>
                  <Sparkline
                    requested={claim.requestedAmount}
                    received={claim.receivedAmount}
                    showRatio
                  />
                </div>

                <div className="flex items-center justify-between">
                  {overdue ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-legal-muted/60 px-2.5 py-1 text-[11px] font-medium text-legal-foreground">
                      <Clock className="size-3.5" aria-hidden="true" />
                      ללא התקדמות · {claim.daysInStage} ימים
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      בסטטוס זה {claim.daysInStage} ימים
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-primary">
                    פרטים
                    <ChevronLeft className="size-3.5" aria-hidden="true" />
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {claims.length === 0 && !isLoading && (
        <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          לא נמצאו תביעות התואמות את הסינון.
        </p>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            <ChevronRight className="size-3.5" />
            הקודם
          </button>
          <span className="text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            הבא
            <ChevronLeft className="size-3.5" />
          </button>
        </div>
      )}
    </section>
  )
}
