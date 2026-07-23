import { LegalList, LegalSection } from "@/components/legal/legal-page-shell"

/** Israeli accessibility statement (WCAG 2.1 AA / IS 5568 oriented). */
export function AccessibilityStatementContent() {
  return (
    <>
      <LegalSection title="מחויבות לנגישות">
        <p>
          אינשורה | ENSURA רואה חשיבות עליונה במתן שירות שוויוני ונגיש לכלל המשתמשים, לרבות
          אנשים עם מוגבלויות. הצהרה זו מנוסחת בהתאם לחוק שוויון זכויות לאנשים עם מוגבלות,
          התשנ&quot;ח–1998, תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות),
          התשע&quot;ג–2013, ותקן ישראלי 5568 המבוסס על הנחיות{" "}
          <span className="font-manrope" dir="ltr">
            WCAG 2.1
          </span>{" "}
          ברמת AA.
        </p>
      </LegalSection>

      <LegalSection title="היקף ההצהרה">
        <p>הצהרה זו חלה על:</p>
        <LegalList
          items={[
            "אתר השיווק הציבורי בכתובת ensura.co.il",
            "דפי הצטרפות, התחברות והמסמכים המשפטיים",
            "פורטל השותפים (במידה שהמשתמש מורשה אליו)",
          ]}
        />
      </LegalSection>

      <LegalSection title="התאמות שבוצעו באתר">
        <LegalList
          items={[
            "מבנה סמנטי עם כותרות היררכיות, שפת מסמך עברית (lang=\"he\") וכיוון RTL.",
            "ניווט מקלדת ותמיכה ב־focus גלוי ברכיבים אינטראקטיביים.",
            "יעד מגע מינימלי נוח (~44–48px) ברכיבי ניווט וטפסים.",
            "ניגודיות צבעים מכוונת לפלטת Quiet Luxury (רקע #F4F7F8, דיו #14202B, כחול עמוק #10263F).",
            "טפסים עם תוויות מפורשות, הודעות שגיאה/הצלחה, וגודל טקסט קלט המונע זום לא רצוי ב־iOS.",
            "תמיכה בהעדפת \"הפחתת תנועה\" (prefers-reduced-motion) באנימציות שיווקיות.",
            "באנר עוגיות והודעות משפטיות הניתנים לקריאה ולסגירה באמצעות מקלדת.",
          ]}
        />
      </LegalSection>

      <LegalSection title="טכנולוגיות מסייעות">
        <p>
          האתר נבדק לעבודה עם דפדפנים מודרניים (Chrome, Safari, Edge, Firefox בגרסאות
          עדכניות) ועם טכנולוגיות מסייעות נפוצות כגון קורא מסך. מומלץ להשתמש בגרסת דפדפן
          מעודכנת.
        </p>
      </LegalSection>

      <LegalSection title="חריגות ידועות ושיפור מתמשך">
        <p>
          ייתכנו רכיבים צד־שלישי (למשל נגני מדיה או מסמכי PDF שהועלו על ידי שותפים) שאינם
          בשליטתנו המלאה. אנו פועלים לשיפור מתמשך של הנגישות ומזמינים דיווח על ליקויים.
        </p>
      </LegalSection>

      <LegalSection title="דרכי פנייה — רכז/ת נגישות">
        <p>
          לפניות, בקשות התאמה או דיווח על חוסר נגישות, אנא פנו לרכז/ת הנגישות של אינשורה:
        </p>
        <LegalList
          items={[
            <>
              שם:{" "}
              <strong className="font-medium text-ensura-ink">רכז/ת נגישות אינשורה</strong>{" "}
              (יעודכן עם שם איש הקשר המלא)
            </>,
            <>
              דוא&quot;ל:{" "}
              <a
                href="mailto:accessibility@ensura.co.il"
                className="font-medium text-ensura-teal underline-offset-2 hover:underline"
                dir="ltr"
              >
                accessibility@ensura.co.il
              </a>
            </>,
            <>
              טלפון:{" "}
              <a
                href="tel:+972500000000"
                className="font-medium text-ensura-teal underline-offset-2 hover:underline"
                dir="ltr"
              >
                050-000-0000
              </a>{" "}
              (מספר זמני — לעדכון)
            </>,
            "שעות מענה משוערות: ימי א׳–ה׳, 09:00–17:00",
          ]}
        />
        <p>
          נשתדל להשיב בתוך עד 5 ימי עסקים ולהציע חלופה סבירה אם לא ניתן לתקן באופן מיידי.
        </p>
      </LegalSection>

      <LegalSection title="יישוב סכסוכים">
        <p>
          אם הפנייה לא טופלה לשביעות רצונכם, ניתן לפנות לנציבות שוויון זכויות לאנשים עם
          מוגבלות או לגורם המוסמך על פי דין.
        </p>
      </LegalSection>
    </>
  )
}
