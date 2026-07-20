"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { PartnerClaims } from "@/components/dashboard/partner-claims"
import type { WorkflowClaim } from "@/lib/workflow-data"
import type { PaginatedResult } from "@/lib/pagination"

type PaginatedPartnerClaimsProps = {
  searchQuery: string
  openClaimId?: string | null
}

async function fetchPage(page: number, q: string): Promise<PaginatedResult<WorkflowClaim>> {
  const params = new URLSearchParams({ page: String(page), pageSize: "20" })
  if (q.trim()) params.set("q", q.trim())
  const res = await fetch(`/api/claims?${params}`, { credentials: "same-origin" })
  if (!res.ok) throw new Error("Failed to load claims")
  return res.json() as Promise<PaginatedResult<WorkflowClaim>>
}

export function PaginatedPartnerClaims({ searchQuery, openClaimId = null }: PaginatedPartnerClaimsProps) {
  const [page, setPage] = useState(1)
  const key = useMemo(() => ["partner-claims", page, searchQuery], [page, searchQuery])

  const { data, error, isLoading } = useSWR(key, () => fetchPage(page, searchQuery), {
    keepPreviousData: true,
  })

  if (error) {
    return (
      <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        שגיאה בטעינת תיקים
      </p>
    )
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        טוען תיקים…
      </div>
    )
  }

  const claims = data?.items ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="flex flex-col gap-4">
      <PartnerClaims claims={claims} openClaimId={openClaimId} />
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-50"
          >
            <ChevronRight className="size-3.5" />
            הקודם
          </button>
          <span className="text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-50"
          >
            הבא
            <ChevronLeft className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
