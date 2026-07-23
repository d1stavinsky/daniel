import type { Metadata } from "next"
import { LegalPageShell } from "@/components/legal/legal-page-shell"
import { PrivacyPolicyContent } from "@/components/legal/privacy-policy"

export const metadata: Metadata = {
  title: "מדיניות פרטיות · אינשורה | ENSURA",
  description:
    "מדיניות פרטיות של אינשורה — איסוף, עיבוד ואבטחת מידע אישי ותביעות רכב בהתאם לחוק הגנת הפרטיות.",
}

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="מדיניות פרטיות"
      subtitle="שקיפות לגבי איסוף, עיבוד ושמירת מידע אישי ומידע רגיש בהקשר תביעות רכב, בהתאם לדין הישראלי."
      updatedAt="יולי 2026"
    >
      <PrivacyPolicyContent />
    </LegalPageShell>
  )
}
