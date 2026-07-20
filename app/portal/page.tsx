import { redirect } from "next/navigation"
import { getSessionUser, isPartnerOrgActive } from "@/lib/session"

export const dynamic = "force-dynamic"

// Role-aware entry point: routes each user to the surface they're allowed to see.
export default async function PortalPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  // Force a password change before granting access to any surface.
  if (user.mustResetPassword) redirect("/reset-password")
  if (user.role === "admin") redirect("/admin")
  if (!user.partnerId || !(await isPartnerOrgActive(user.partnerId))) redirect("/login")
  redirect("/dashboard")
}
