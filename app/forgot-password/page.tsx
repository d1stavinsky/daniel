import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"
import { EnsuraAuthShell } from "@/components/auth/ensura-auth-shell"

export const metadata = {
  title: "שחזור סיסמה · אינשורה | ENSURA",
}

export default function ForgotPasswordPage() {
  return (
    <EnsuraAuthShell>
      <ForgotPasswordForm />
    </EnsuraAuthShell>
  )
}
