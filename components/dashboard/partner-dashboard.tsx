"use client"

import { useState } from "react"
import { TopNav } from "@/components/dashboard/top-nav"
import { PartnerWorkspace } from "@/components/dashboard/partner-workspace"
import type { MissingTask } from "@/app/actions/documents"

export function PartnerDashboard({
  businessName,
  tasks,
  canManageTeam,
}: {
  businessName: string
  tasks: MissingTask[]
  canManageTeam: boolean
}) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredTasks = searchQuery.trim()
    ? tasks.filter((t) =>
        `${t.claimId} ${t.clientName} ${t.note}`.toLowerCase().includes(searchQuery.trim().toLowerCase()),
      )
    : tasks

  return (
    <div className="min-h-dvh bg-background">
      <TopNav businessName={businessName} searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 md:px-8 md:py-8">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">פורטל שותפים · {businessName} · העלאת מסמכים וצפייה</p>
          <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            ברוך שובך
          </h1>
          <p className="text-sm text-muted-foreground">
            ניתן לצפות בתיקים ולהוריד מסמכים. עדכון נתונים מתבצע על ידי אינשורה בלבד.
          </p>
        </div>

        <PartnerWorkspace searchQuery={searchQuery} tasks={filteredTasks} canManageTeam={canManageTeam} />
      </main>
    </div>
  )
}
