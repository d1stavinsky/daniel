"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, FileText } from "lucide-react"
import { ClaimProgressBadge } from "@/components/admin/claim-progress-badge"
import { DocumentsPanel } from "@/components/documents/documents-panel"
import { claimProgressLabels, formatCurrency, type WorkflowClaim } from "@/lib/workflow-data"
import { cn } from "@/lib/utils"

export function PartnerClaims({
  claims,
  openClaimId,
}: {
  claims: WorkflowClaim[]
  openClaimId?: string | null
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (openClaimId) setOpenId(openClaimId)
  }, [openClaimId])

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4 md:p-5">
        <h2 className="text-base font-semibold text-foreground">התיקים שלי</h2>
        <p className="text-sm text-muted-foreground">צפייה בסטטוס ובמסמכים — ללא אפשרות עריכה</p>
      </div>

      <div className="flex flex-col divide-y divide-border">
        {claims.map((claim) => {
          const isOpen = openId === claim.id
          return (
            <div key={claim.id}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : claim.id)}
                aria-expanded={isOpen}
                className="flex w-full flex-col gap-3 p-4 text-right transition-colors hover:bg-muted/40 md:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{claim.clientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {claim.id} · {claim.carModel} · {claim.plate}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(claim.requestedAmount)}
                    </span>
                    <ChevronLeft
                      className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        isOpen && "-rotate-90",
                      )}
                      aria-hidden="true"
                    />
                  </div>
                </div>
                <ClaimProgressBadge status={claim.progressStatus} uploadedCount={claim.uploadedDocCount} />
                <p className="text-xs text-muted-foreground">
                  סטטוס:{" "}
                  <span className="text-foreground">{claimProgressLabels[claim.progressStatus]}</span>
                </p>
              </button>

              {isOpen && (
                <div className="border-t border-border bg-secondary/30 px-4 py-4 md:px-5">
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <FileText className="size-4 text-gold" aria-hidden="true" />
                      מסמכים נדרשים
                    </h3>
                    <DocumentsPanel claimId={claim.id} mode="partner" />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {claims.length === 0 && (
        <p className="p-8 text-center text-sm text-muted-foreground">אין תיקים פעילים כרגע.</p>
      )}
    </section>
  )
}
