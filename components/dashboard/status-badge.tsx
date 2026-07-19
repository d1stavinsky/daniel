import type { ClaimStatus } from "@/lib/claims-data"
import { statusLabels } from "@/lib/claims-data"

const styles: Record<ClaimStatus, string> = {
  appraisal: "bg-garage-muted text-garage-foreground",
  waiting: "bg-legal-muted text-legal-foreground",
  settled: "bg-trust-muted text-trust-foreground",
  legal: "bg-secondary text-primary",
}

const dotStyles: Record<ClaimStatus, string> = {
  appraisal: "bg-garage",
  waiting: "bg-legal",
  settled: "bg-trust",
  legal: "bg-primary",
}

export function StatusBadge({ status }: { status: ClaimStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}
    >
      <span className={`size-1.5 rounded-full ${dotStyles[status]}`} aria-hidden="true" />
      {statusLabels[status]}
    </span>
  )
}
