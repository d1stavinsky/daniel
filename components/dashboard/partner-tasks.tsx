"use client"

import { AlertTriangle } from "lucide-react"
import { docKindLabels } from "@/lib/documents"
import type { MissingTask } from "@/app/actions/documents"

/** Docs AXIS flagged as missing — partners open the claim and upload via async intake. */
export function PartnerTasks({
  tasks,
  onOpenClaim,
}: {
  tasks: MissingTask[]
  onOpenClaim?: (claimId: string) => void
}) {
  if (tasks.length === 0) return null

  return (
    <section
      className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 md:p-5"
      aria-label="מסמכים חסרים"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5 text-amber-600" aria-hidden="true" />
        <h2 className="text-base font-semibold text-amber-800 dark:text-amber-200">
          {tasks.length} מסמכים סומנו כחסרים
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        פתחו את התיק והעלו את המסמכים החסרים — ההעלאה רצה ברקע ישירות לאחסון.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {tasks.map((task) => (
          <li
            key={task.docId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/60 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {docKindLabels[task.kind]} · {task.clientName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {task.note || `תיק ${task.claimId}`}
              </p>
            </div>
            {onOpenClaim && (
              <button
                type="button"
                onClick={() => onOpenClaim(task.claimId)}
                className="shrink-0 rounded-lg border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
              >
                העלאה בתיק
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
