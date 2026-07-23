import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/session"
import { AdminShell } from "@/components/admin/admin-shell"
import { PartnersManagement } from "@/components/admin/partners-management"
import { LockedAccountsPanel } from "@/components/admin/locked-accounts-panel"
import { listPartners } from "@/app/actions/partners"
import { listLockedUserAccounts } from "@/app/actions/account-lockout"
import { getClaimsDashboardStats, getPartnerOptions } from "@/app/actions/claims"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  const user = await getSessionUser()

  // RBAC: only admins reach the admin console.
  if (!user) redirect("/login")
  if (user.mustResetPassword) redirect("/reset-password")
  if (user.role !== "admin" && user.role !== "support") redirect("/dashboard")

  const [partners, stats, partnerOptions, lockedAccounts] = await Promise.all([
    listPartners(),
    getClaimsDashboardStats(),
    getPartnerOptions(),
    user.role === "admin" ? listLockedUserAccounts() : Promise.resolve([]),
  ])

  return (
    <AdminShell
      currentUser={{ name: user.name, email: user.email, role: user.role }}
      dashboardStats={stats}
      partnerOptions={partnerOptions}
      partnersSlot={
        <div className="flex flex-col gap-6">
          <PartnersManagement initialPartners={partners} />
          {user.role === "admin" ? (
            <LockedAccountsPanel initialAccounts={lockedAccounts} />
          ) : null}
        </div>
      }
    />
  )
}
