import { Scale, ShieldCheck, Wrench } from "lucide-react"
import { formatCurrency, financialBuckets, type WorkflowClaim } from "@/lib/workflow-data"

const cards = [
  {
    key: "legal" as const,
    label: "בטיפול",
    hint: "תיקים עם מסמכים חלקיים",
    icon: Scale,
    box: "bg-legal-muted text-legal-foreground",
    bar: "bg-legal",
  },
  {
    key: "trust" as const,
    label: "הושלם · טרם שוחרר",
    hint: "כל המסמכים אומתו",
    icon: ShieldCheck,
    box: "bg-trust-muted text-trust-foreground",
    bar: "bg-trust",
  },
  {
    key: "garage" as const,
    label: "שולם / נסגר",
    hint: "תיקים שנסגרו או שוחררו כספים",
    icon: Wrench,
    box: "bg-garage-muted text-garage-foreground",
    bar: "bg-garage",
  },
]

export function WorkflowSummary({
  claims,
  buckets,
}: {
  claims?: WorkflowClaim[]
  buckets?: ReturnType<typeof financialBuckets>
}) {
  const resolved = buckets ?? financialBuckets(claims ?? [])
  const total = resolved.legal + resolved.trust + resolved.garage || 1

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {cards.map((c) => {
        const value = resolved[c.key]
        const pct = Math.round((value / total) * 100)
        const Icon = c.icon
        return (
          <div key={c.key} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className={`flex size-11 items-center justify-center rounded-xl ${c.box}`}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-xs text-muted-foreground">{pct}%</span>
            </div>
            <p className="mt-4 text-2xl font-semibold tabular-nums text-foreground">{formatCurrency(value)}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{c.label}</p>
            <p className="text-xs text-muted-foreground">{c.hint}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
