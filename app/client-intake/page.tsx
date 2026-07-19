import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { claim, claimDocument } from "@/lib/db/schema"
import { verifyClientIntakeToken } from "@/lib/whatsapp/client-intake-link"
import { ClientIntakeUploadForm } from "@/components/client-intake/upload-form"

export const dynamic = "force-dynamic"

const INTAKE_KINDS = [
  "vehicle_license_client",
  "driver_license_client",
  "owner_id",
  "insurance_policy",
  "power_of_attorney",
  "insurance_to_trust_consent",
  "vehicle_license_third_party",
  "driver_license_third_party",
] as const

type PageProps = {
  searchParams: Promise<{ t?: string }>
}

export default async function ClientIntakePage({ searchParams }: PageProps) {
  const params = await searchParams
  const token = typeof params.t === "string" ? params.t : ""
  const payload = token ? verifyClientIntakeToken(token) : null

  if (!payload) {
    return (
      <main dir="rtl" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6 py-16 text-right">
        <h1 className="text-2xl font-semibold tracking-tight">קישור לא תקין או שפג תוקפו</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          בקשו מהמוסך לשלוח שוב את הודעת הקליטה, או פנו לשותף AXIS שלכם.
        </p>
      </main>
    )
  }

  const [row] = await db
    .select({ id: claim.id, plate: claim.plate, status: claim.status, clientName: claim.clientName })
    .from(claim)
    .where(eq(claim.id, payload.claimId))
    .limit(1)

  if (!row) {
    return (
      <main dir="rtl" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6 py-16 text-right">
        <h1 className="text-2xl font-semibold tracking-tight">התיק לא נמצא</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">פנו למוסך השותף להמשך טיפול.</p>
      </main>
    )
  }

  const docRows = await db
    .select({ kind: claimDocument.kind, blobPathname: claimDocument.blobPathname })
    .from(claimDocument)
    .where(and(eq(claimDocument.claimId, row.id), inArray(claimDocument.kind, [...INTAKE_KINDS])))

  const initialUploaded: Partial<Record<(typeof INTAKE_KINDS)[number], boolean>> = {}
  for (const d of docRows) {
    if (d.blobPathname) initialUploaded[d.kind as (typeof INTAKE_KINDS)[number]] = true
  }

  return (
    <main dir="rtl" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16 text-right">
      <div>
        <p className="text-muted-foreground text-xs tracking-wide">AXIS · קליטת לקוח</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          העלאת מסמכים עבור רכב {row.plate}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          מספר תיק: <span className="text-foreground font-medium">{row.id}</span>
        </p>
      </div>

      <p className="text-sm leading-relaxed">
        נא לצרף את המסמכים הנדרשים בשני שלבים — פרטי הלקוח ואז פרטי צד ג׳ — וללחוץ על כפתור השליחה.
      </p>

      <ClientIntakeUploadForm token={token} initialUploaded={initialUploaded} />
    </main>
  )
}
