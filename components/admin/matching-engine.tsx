"use client"

import { useMemo } from "react"
import { AlertTriangle, CheckCircle2, Clock, Wallet } from "lucide-react"
import { MatchBadge } from "@/components/admin/match-badge"
import { Sparkline } from "@/components/admin/sparkline"
import {
  formatCurrency,
  matchState,
  type WorkflowClaim,
} from "@/lib/workflow-data"

type MatchingEngineProps = {
  claims: WorkflowClaim[]
  onSelect: (id: string) => void
  onReconcile?: (id: string, received: number) => void
}

export function MatchingEngine({ claims, onSelect, onReconcile }: MatchingEngineProps) {
  const rows = useMemo(
    () =>
      claims
        .filter((c) => c.requestedAmount > 0)
        .map((c) => ({ claim: c, state: matchState(c), gap: c.requestedAmount - c.receivedAmount }))
        .sort((a, b) => {
          const order = { discrepancy: 0, pending: 1, match: 2 } as const
          return order[a.state] - order[b.state]
        }),
    [claims],
  )

  const totals = useMemo(() => {
    let requested = 0
    let received = 0
    let discrepancy = 0
    let matched = 0
    for (const { claim, state } of rows.map((r) => ({ claim: r.claim, state: r.state }))) {
      requested += claim.requestedAmount
      received += claim.receivedAmount
      if (state === "discrepancy") discrepancy += 1
      if (state === "match") matched += 1
    }
    return { requested, received, gap: requested - received, discrepancy, matched }
  }, [rows])

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          icon={Wallet}
          label="סך נדרש"
          value={formatCurrency(totals.requested)}
          tone="neutral"
        />
        <SummaryTile
          icon={CheckCircle2}
          label="סך התקבל"
          value={formatCurrency(totals.received)}
          tone="trust"
        />
        <SummaryTile
          icon={AlertTriangle}
          label="פער כולל"
          value={formatCurrency(totals.gap)}
          tone="legal"
        />
        <SummaryTile
          icon={Clock}
          label="תיקים בפער"
          value={String(totals.discrepancy)}
          tone="garage"
        />
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="text-base font-semibold text-foreground">התאמות סכומים</h2>
          <p className="text-sm text-muted-foreground">השוואת סכום נדרש מול סכום שהתקבל בפועל</p>
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">מספר תיק</th>
                <th className="px-4 py-3 font-medium">שותף</th>
                <th className="px-4 py-3 font-medium">נדרש</th>
                <th className="px-4 py-3 font-medium">התקבל</th>
                <th className="px-4 py-3 font-medium">מאזן</th>
                <th className="px-4 py-3 font-medium">פער</th>
                <th className="px-4 py-3 font-medium">מצב</th>
                <th className="px-4 py-3 font-medium">פעולה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ claim, state, gap }) => (
                <tr key={claim.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onSelect(claim.id)}
                      className="font-medium text-foreground hover:text-gold-foreground hover:underline"
                    >
                      {claim.id}
                    </button>
                    <p className="text-xs text-muted-foreground">{claim.clientName}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{claim.partnerName}</td>
                  <td className="px-4 py-3 tabular-nums text-foreground">{formatCurrency(claim.requestedAmount)}</td>
                  <td className="px-4 py-3 tabular-nums text-foreground">{formatCurrency(claim.receivedAmount)}</td>
                  <td className="px-4 py-3">
                    <Sparkline requested={claim.requestedAmount} received={claim.receivedAmount} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <span className={gap > 0 ? "text-legal-foreground" : "text-trust-foreground"}>
                      {formatCurrency(gap)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <MatchBadge state={state} />
                  </td>
                  <td className="px-4 py-3">
                    {state !== "match" ? (
                      <button
                        type="button"
                        onClick={() => onReconcile?.(claim.id, claim.requestedAmount)}
                        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        סמן כתואם
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="flex flex-col divide-y divide-border md:hidden">
          {rows.map(({ claim, state, gap }) => (
            <div key={claim.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onSelect(claim.id)}
                  className="font-medium text-foreground hover:underline"
                >
                  {claim.id}
                </button>
                <MatchBadge state={state} />
              </div>
              <p className="text-xs text-muted-foreground">
                {claim.clientName} · {claim.partnerName}
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">נדרש</span>
                <span className="tabular-nums text-foreground">{formatCurrency(claim.requestedAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">התקבל</span>
                <span className="tabular-nums text-foreground">{formatCurrency(claim.receivedAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">פער</span>
                <span className="flex items-center gap-2">
                  <Sparkline requested={claim.requestedAmount} received={claim.receivedAmount} />
                  <span className={gap > 0 ? "tabular-nums text-legal-foreground" : "tabular-nums text-trust-foreground"}>
                    {formatCurrency(gap)}
                  </span>
                </span>
              </div>
              {state !== "match" && (
                <button
                  type="button"
                  onClick={() => onReconcile?.(claim.id, claim.requestedAmount)}
                  className="mt-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                >
                  סמן כתואם
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet
  label: string
  value: string
  tone: "neutral" | "trust" | "legal" | "garage"
}) {
  const tones: Record<string, string> = {
    neutral: "bg-secondary text-foreground",
    trust: "bg-trust-muted text-trust-foreground",
    legal: "bg-legal-muted text-legal-foreground",
    garage: "bg-garage-muted text-garage-foreground",
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className={`flex size-10 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
        </div>
      </div>
    </div>
  )
}
