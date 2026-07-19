import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

export const metadata = {
  title: "שחזור סיסמה · AXIS",
}

export default function ForgotPasswordPage() {
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, var(--gold) 10%, transparent), transparent 70%)",
        }}
      />
      <div className="relative z-10 flex justify-center">
        <ForgotPasswordForm />
      </div>
    </main>
  )
}
