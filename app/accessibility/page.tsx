import type { Metadata } from "next"
import { LegalPageShell } from "@/components/legal/legal-page-shell"
import { AccessibilityStatementContent } from "@/components/legal/accessibility-statement"

export const metadata: Metadata = {
  title: "הצהרת נגישות · אינשורה | ENSURA",
  description:
    "הצהרת נגישות של אינשורה בהתאם לתקנות שוויון זכויות לאנשים עם מוגבלות ול־WCAG 2.1 AA.",
}

export default function AccessibilityPage() {
  return (
    <LegalPageShell
      title="הצהרת נגישות"
      subtitle="מחויבות אינשורה לנגישות דיגיטלית לפי הדין הישראלי ותקן WCAG 2.1 ברמת AA."
      updatedAt="יולי 2026"
    >
      <AccessibilityStatementContent />
    </LegalPageShell>
  )
}
