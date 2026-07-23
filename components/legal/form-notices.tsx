import Link from "next/link"
import { cn } from "@/lib/utils"

/** Short collection notice for web forms (Israeli Privacy Protection Law). */
export function FormPrivacyNotice({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <p
      className={cn(
        "text-pretty text-ensura-navy/55",
        compact ? "text-xs leading-relaxed" : "text-sm leading-relaxed",
        className,
      )}
    >
      המידע ישמש ליצירת קשר ולטיפול בפנייה בלבד, בהתאם ל{" "}
      <Link
        href="/privacy"
        className="font-medium text-ensura-teal underline-offset-2 hover:underline"
      >
        מדיניות הפרטיות
      </Link>
      . לא יועבר לצדדים שלישיים למטרות שיווק שלהם ללא הסכמה. ניתן לעיין, לתקן או לבקש מחיקה
      ב־
      <a
        href="mailto:privacy@ensura.co.il"
        className="font-medium text-ensura-teal underline-offset-2 hover:underline"
        dir="ltr"
      >
        privacy@ensura.co.il
      </a>
      .
    </p>
  )
}

/**
 * Communications Law §30A notice — for marketing / callback / newsletter style opt-ins.
 * Pair with an explicit checkbox when collecting marketing consent.
 */
export function AntiSpamNotice({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <p
      className={cn(
        "text-pretty text-ensura-navy/55",
        compact ? "text-xs leading-relaxed" : "text-sm leading-relaxed",
        className,
      )}
    >
      שליחת פרטים מהווה הסכמה לקבלת פנייה חוזרת בנוגע להצטרפות ולשירותי אינשורה, בהתאם לסעיף
      30א לחוק התקשורת. ניתן לבטל הסכמה בכל עת באמצעות קישור הסרה בהודעה או בפנייה ל־
      <a
        href="mailto:privacy@ensura.co.il?subject=%D7%94%D7%A1%D7%A8%D7%94%20%D7%9E%D7%93%D7%99%D7%95%D7%95%D7%A8"
        className="font-medium text-ensura-teal underline-offset-2 hover:underline"
        dir="ltr"
      >
        privacy@ensura.co.il
      </a>
      .
    </p>
  )
}

/** Explicit marketing opt-in control for forms that may send promotional messages. */
export function MarketingConsentCheckbox({
  id = "marketingConsent",
  name = "marketingConsent",
  required = false,
}: {
  id?: string
  name?: string
  required?: boolean
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-ensura-navy/70"
    >
      <input
        id={id}
        name={name}
        type="checkbox"
        value="yes"
        required={required}
        className="mt-1 size-4 shrink-0 rounded border-ensura-navy/25 text-ensura-teal focus-visible:ring-2 focus-visible:ring-ensura-teal/30"
      />
      <span className="text-pretty">
        מאשר/ת קבלת עדכונים ומידע שיווקי מאינשורה בדוא&quot;ל או בטלפון. ניתן להסיר בכל עת.
      </span>
    </label>
  )
}
