"use client"

import { useMemo, useState } from "react"

type FileKind =
  | "vehicle_license_client"
  | "driver_license_client"
  | "owner_id"
  | "insurance_policy"
  | "insurance_to_trust_consent"
  | "power_of_attorney"
  | "vehicle_license_third_party"
  | "driver_license_third_party"

const STEP1_FIELDS: { kind: FileKind; label: string }[] = [
  { kind: "vehicle_license_client", label: "רישיון רכב" },
  { kind: "driver_license_client", label: "רישיון נהיגה" },
  { kind: "owner_id", label: "תעודת זהות של בעל הרכב" },
  { kind: "insurance_policy", label: "פוליסת ביטוח" },
  { kind: "power_of_attorney", label: "ייפוי כוח" },
  {
    kind: "insurance_to_trust_consent",
    label: "טופס הסכמה להעברת כספים לחשבון נאמנות",
  },
]

const STEP2_FILE_FIELDS: { kind: FileKind; label: string }[] = [
  { kind: "vehicle_license_third_party", label: "רישיון רכב של צד ג׳" },
  { kind: "driver_license_third_party", label: "רישיון נהיגה של צד ג׳" },
]

type InitialUploaded = Partial<Record<FileKind, boolean>>

export function ClientIntakeUploadForm({
  token,
  initialUploaded,
}: {
  token: string
  initialUploaded: InitialUploaded
}) {
  const initiallyComplete = false

  const [step, setStep] = useState<1 | 2>(1)
  const [files, setFiles] = useState<Partial<Record<FileKind, File>>>({})
  const [liability, setLiability] = useState<"yes" | "no" | null>(null)
  const [thirdPartyInsurer, setThirdPartyInsurer] = useState("")
  const [missingContact, setMissingContact] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [received, setReceived] = useState(initiallyComplete && Boolean(initialUploaded.owner_id))

  function onPick(kind: FileKind, file: File | null) {
    setFiles((prev) => {
      const next = { ...prev }
      if (file) next[kind] = file
      else delete next[kind]
      return next
    })
    setSubmitError(null)
  }

  const step1Ready = useMemo(
    () => STEP1_FIELDS.every((f) => Boolean(files[f.kind]) || initialUploaded[f.kind]),
    [files, initialUploaded],
  )

  const step1NeedsFiles = useMemo(
    () => STEP1_FIELDS.every((f) => Boolean(files[f.kind]) || initialUploaded[f.kind]),
    [files, initialUploaded],
  )

  const tpDocsComplete =
    (Boolean(files.vehicle_license_third_party) ||
      Boolean(initialUploaded.vehicle_license_third_party)) &&
    (Boolean(files.driver_license_third_party) ||
      Boolean(initialUploaded.driver_license_third_party))

  const step2Ready = useMemo(() => {
    if (liability === null) return false
    if (liability === "no") return true
    if (!thirdPartyInsurer.trim()) return false
    return tpDocsComplete || Boolean(missingContact.trim())
  }, [liability, thirdPartyInsurer, tpDocsComplete, missingContact])

  function goToStep2() {
    if (!step1NeedsFiles) {
      setSubmitError("יש לצרף את כל ארבעת המסמכים בשלב פרטי הלקוח")
      return
    }
    setSubmitError(null)
    setStep(2)
  }

  async function submitAll() {
    if (!step1NeedsFiles || !step2Ready || submitting || liability === null) return
    setSubmitting(true)
    setSubmitError(null)

    const fd = new FormData()
    fd.set("token", token)
    fd.set("mode", "batch")
    fd.set("liability", liability)
    fd.set("thirdPartyInsurer", thirdPartyInsurer.trim())
    fd.set("missingContact", missingContact.trim())

    for (const f of STEP1_FIELDS) {
      const file = files[f.kind]
      if (!file && !initialUploaded[f.kind]) {
        setSubmitting(false)
        setSubmitError("יש לצרף את כל מסמכי שלב 1")
        return
      }
      if (file) fd.set(f.kind, file)
    }

    if (liability === "yes") {
      if (files.vehicle_license_third_party) {
        fd.set("vehicle_license_third_party", files.vehicle_license_third_party)
      }
      if (files.driver_license_third_party) {
        fd.set("driver_license_third_party", files.driver_license_third_party)
      }
    }

    try {
      const res = await fetch("/api/client-intake/upload", { method: "POST", body: fd })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        setSubmitError(json.error || "שליחת המסמכים נכשלה. נסו שוב.")
        return
      }
      setReceived(true)
      setFiles({})
    } catch {
      setSubmitError("שליחת המסמכים נכשלה. בדקו את החיבור ונסו שוב.")
    } finally {
      setSubmitting(false)
    }
  }

  if (received) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm leading-relaxed text-emerald-900">
        <p className="font-semibold">המסמכים התקבלו בהצלחה</p>
        <p className="mt-1 text-emerald-800/90">
          הפרטים והמסמכים נשמרו בתיק בהצלחה וסומנו כממתינים לבדיקת צוות AXIS.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={
            step === 1
              ? "rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground"
              : "rounded-full bg-secondary px-3 py-1 text-muted-foreground"
          }
        >
          שלב 1 · פרטי הלקוח
        </span>
        <span className="text-muted-foreground">←</span>
        <span
          className={
            step === 2
              ? "rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground"
              : "rounded-full bg-secondary px-3 py-1 text-muted-foreground"
          }
        >
          שלב 2 · צד ג׳
        </span>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">
            נא לצרף את מסמכי הרכב והלקוח. לאחר מכן לחצו על &quot;המשך&quot;.
          </p>
          {STEP1_FIELDS.map((f) => (
            <FileSection
              key={f.kind}
              label={f.label}
              file={files[f.kind]}
              existing={Boolean(initialUploaded[f.kind])}
              disabled={submitting}
              onPick={(file) => onPick(f.kind, file)}
            />
          ))}

          <button
            type="button"
            onClick={goToStep2}
            disabled={!step1Ready || submitting}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            המשך לשלב צד ג׳
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <p className="text-sm font-semibold">האם צד ג׳ מודה באחריות?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLiability("yes")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  liability === "yes"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background"
                }`}
              >
                כן
              </button>
              <button
                type="button"
                onClick={() => setLiability("no")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  liability === "no"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background"
                }`}
              >
                לא
              </button>
            </div>
          </div>

          {liability === "yes" && (
            <>
              {STEP2_FILE_FIELDS.map((f) => (
                <FileSection
                  key={f.kind}
                  label={f.label}
                  file={files[f.kind]}
                  existing={Boolean(initialUploaded[f.kind])}
                  disabled={submitting}
                  onPick={(file) => onPick(f.kind, file)}
                />
              ))}

              <label className="block space-y-1.5 rounded-xl border border-border bg-card p-4">
                <span className="text-sm font-semibold">שם חברת הביטוח של צד ג׳</span>
                <input
                  type="text"
                  value={thirdPartyInsurer}
                  onChange={(e) => setThirdPartyInsurer(e.target.value)}
                  disabled={submitting}
                  placeholder="לדוגמה: הפניקס, מגדל, כלל…"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </label>

              {!tpDocsComplete && (
                <label className="block space-y-1.5 rounded-xl border border-dashed border-border bg-card p-4">
                  <span className="text-sm font-semibold">
                    בהיעדר מסמכים — טלפון או מספר רכב של צד ג׳ (אופציונלי אם המסמכים מצורפים)
                  </span>
                  <input
                    type="text"
                    value={missingContact}
                    onChange={(e) => setMissingContact(e.target.value)}
                    disabled={submitting}
                    placeholder="טלפון ו/או מספר רכב"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                  <span className="text-muted-foreground text-xs leading-relaxed">
                    אם חסר רישיון רכב או רישיון נהיגה של צד ג׳ — יש למלא כאן פרטי יצירת קשר או מספר רכב
                    להשלמה.
                  </span>
                </label>
              )}
            </>
          )}

          {liability === "no" && (
            <p className="text-muted-foreground text-sm leading-relaxed">
              לא נדרשים מסמכי צד ג׳. ניתן לשלוח את המסמכים לצוות AXIS.
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={submitting}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium disabled:opacity-40"
            >
              חזרה
            </button>
            <button
              type="button"
              onClick={submitAll}
              disabled={!step2Ready || submitting}
              className="flex-[2] rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {submitting ? "שולח…" : "שליחת מסמכים"}
            </button>
          </div>
        </div>
      )}

      {submitError && <p className="text-xs text-red-600">{submitError}</p>}

      <p className="text-muted-foreground text-xs leading-relaxed">
        ניתן להעלות קובץ PDF או תמונה (JPEG / PNG / WEBP) בגודל של עד 10MB. לאחר השליחה המסמכים
        יסומנו כממתינים לבדיקת צוות AXIS.
      </p>
    </div>
  )
}

function FileSection({
  label,
  file,
  existing,
  disabled,
  onPick,
}: {
  label: string
  file?: File
  existing?: boolean
  disabled?: boolean
  onPick: (file: File | null) => void
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label={label}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">{label}</h2>
        {file && (
          <span className="text-muted-foreground max-w-[45%] truncate text-xs">{file.name}</span>
        )}
        {!file && existing && (
          <span className="text-xs font-medium text-emerald-600">התקבל בעבר ✓</span>
        )}
      </div>
      <label className="block">
        <span className="sr-only">בחירת קובץ עבור {label}</span>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="w-full text-xs file:ml-2 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs"
          disabled={disabled}
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
    </section>
  )
}
