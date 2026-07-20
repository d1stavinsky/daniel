import { Check, AlertTriangle, Clock } from "lucide-react"
import { matchLabels, type MatchState } from "@/lib/workflow-data"

const styles: Record<MatchState, string> = {
  match: "bg-trust-muted text-trust-foreground",
  discrepancy: "bg-destructive/10 text-destructive",
  pending: "bg-secondary text-muted-foreground",
}

const icons: Record<MatchState, typeof Check> = {
  match: Check,
  discrepancy: AlertTriangle,
  pending: Clock,
}

export function MatchBadge({ state }: { state: MatchState }) {
  const Icon = icons[state]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[state]}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {matchLabels[state]}
    </span>
  )
}
