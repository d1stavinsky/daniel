import type { Metadata } from "next"
import { LegalPageShell } from "@/components/legal/legal-page-shell"
import { TermsOfUseContent } from "@/components/legal/terms-of-use"

export const metadata: Metadata = {
  title: "תנאי שימוש · אינשורה | ENSURA",
  description:
    "תנאי השימוש בפלטפורמת אינשורה לשותפים עסקיים ולמשתמשי פורטל ניהול תביעות רכב.",
}

export default function TermsPage() {
  return (
    <LegalPageShell
      title="תנאי שימוש"
      subtitle="הסכם מחייב המסדיר את השימוש באתר ובפורטל השותפים של אינשורה."
      updatedAt="יולי 2026"
    >
      <TermsOfUseContent />
    </LegalPageShell>
  )
}
