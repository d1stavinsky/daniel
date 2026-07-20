import { redirect } from "next/navigation"
import { getSessionUser, isPartnerOrgActive } from "@/lib/session"
import { PartnerDashboard } from "@/components/dashboard/partner-dashboard"
import { getMyMissingTasks } from "@/app/actions/documents"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const user = await getSessionUser()

  // RBAC: must be signed in; admins belong in the admin console.
  if (!user) redirect("/login")
  if (user.mustResetPassword) redirect("/reset-password")
  if (user.role === "admin" || user.role === "support") redirect("/admin")
  if (!user.partnerId || !(await isPartnerOrgActive(user.partnerId))) redirect("/login")

  // Partners only ever see claims scoped to their own partnerId — the action
  // enforces this server-side via requirePartner() + a partnerId filter.
  // Partners are read-only observers — no team management UI.
  const missingTasks = await getMyMissingTasks()

  return (
    <PartnerDashboard
      businessName={user.name}
      tasks={missingTasks}
      canManageTeam={false}
    />
  )
}
