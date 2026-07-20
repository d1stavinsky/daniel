import { EnsuraAuthShell } from "@/components/auth/ensura-auth-shell"
import { JoinLeadForm } from "@/components/landing/join-lead-form"

export const metadata = {
  title: "הצטרפות · אינשורה | ENSURA",
  description: "השאירו פרטי קשר ונחזור אליכם לתיאום הצטרפות לאינשורה.",
}

export default function JoinPage() {
  return (
    <EnsuraAuthShell wide>
      <JoinLeadForm />
    </EnsuraAuthShell>
  )
}
