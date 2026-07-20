"use client"

import { FileText } from "lucide-react"
import { REQUIRED_DOCS } from "@/lib/documents"
import type { WorkflowClaim } from "@/lib/workflow-data"

/**
 * Partner-facing catalog of the canonical supported claim documents.
 * Download/view/upload happens inside each claim's DocumentsPanel.
 */
export function PartnerDocuments({ claims: _claims = [] }: { claims?: WorkflowClaim[] }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4 md:p-5">
        <h2 className="text-base font-semibold text-foreground">מסמכי תביעה</h2>
        <p className="text-sm text-muted-foreground">
          {REQUIRED_DOCS.length} סוגי מסמכים נתמכים · העלאה וצפייה מתוך התיק
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-border">
          {REQUIRED_DOCS.map((doc) => (
            <li key={doc.kind} className="flex items-start gap-3 p-4 md:px-5">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                <FileText className="size-4.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{doc.label}</p>
                <p className="text-xs text-muted-foreground">{doc.hint}</p>
              </div>
            </li>
          ))}
        </ul>
    </section>
  )
}
