"use client"

import { useState } from "react"
import { PartnerTasks } from "@/components/dashboard/partner-tasks"
import { PartnerDocuments } from "@/components/dashboard/partner-documents"
import { TeamPanel } from "@/components/dashboard/team-panel"
import { PaginatedPartnerClaims } from "@/components/dashboard/paginated-partner-claims"
import type { MissingTask } from "@/app/actions/documents"

export function PartnerWorkspace({
  searchQuery,
  tasks,
  canManageTeam,
}: {
  searchQuery: string
  tasks: MissingTask[]
  canManageTeam: boolean
}) {
  const [openClaimId, setOpenClaimId] = useState<string | null>(null)

  return (
    <>
      <PartnerTasks tasks={tasks} onOpenClaim={setOpenClaimId} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <PaginatedPartnerClaims searchQuery={searchQuery} openClaimId={openClaimId} />
        </div>
        <div className="lg:col-span-2">
          <PartnerDocuments claims={[]} />
        </div>
      </div>
      {canManageTeam && <TeamPanel />}
    </>
  )
}
