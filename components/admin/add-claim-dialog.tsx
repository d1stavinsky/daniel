"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldSelect } from "@/components/admin/field-select"
import { parseMoneyInput } from "@/lib/claims-data"
import { formatPlate, isValidPlate } from "@/lib/validation"

export type NewClaimInput = {
  clientName: string
  plate: string
  carModel: string
  partnerId: string
  requestedAmount: number
}

type PartnerOption = { id: string; name: string }

type AddClaimDialogProps = {
  open: boolean
  onClose: () => void
  onCreate: (claim: NewClaimInput) => Promise<void> | void
  partners: PartnerOption[]
}

export function AddClaimDialog({ open, onClose, onCreate, partners }: AddClaimDialogProps) {
  const emptyForm = {
    clientName: "",
    plate: "",
    carModel: "",
    partnerId: partners[0]?.id ?? "",
    requestedAmount: "",
  }
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({ clientName: "", plate: "", carModel: "", partnerId: partners[0]?.id ?? "", requestedAmount: "" })
      setError("")
      setSubmitting(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose()
    }
    if (open) document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose, submitting])

  if (!open) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseMoneyInput(form.requestedAmount)
    if (!form.clientName.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError("יש למלא שם לקוח וסכום תקין.")
      return
    }
    if (!isValidPlate(form.plate)) {
      setError("מספר רכב לא תקין — יש להזין 7 או 8 ספרות.")
      return
    }
    if (!form.partnerId) {
      setError("יש לבחור שותף.")
      return
    }

    setSubmitting(true)
    setError("")
    try {
      await onCreate({
        clientName: form.clientName.trim(),
        plate: form.plate.trim(),
        carModel: form.carModel.trim(),
        partnerId: form.partnerId,
        requestedAmount: amount,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "פתיחת התיק נכשלה. נסו שוב.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-primary/40 backdrop-blur-sm"
        onClick={() => {
          if (!submitting) onClose()
        }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-claim-title"
        className="relative w-full max-w-lg rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h2 id="add-claim-title" className="text-base font-semibold text-foreground">
              תביעה חדשה
            </h2>
            <p className="text-sm text-muted-foreground">התיק ייפתח בשלב 1 · איסוף נתונים</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
            aria-label="סגירה"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="שם הלקוח" htmlFor="clientName">
              <input
                id="clientName"
                value={form.clientName}
                disabled={submitting}
                onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60"
                placeholder="שם מלא"
              />
            </Field>
            <Field label="מספר רכב" htmlFor="plate">
              <input
                id="plate"
                value={form.plate}
                inputMode="numeric"
                disabled={submitting}
                onChange={(e) => setForm((f) => ({ ...f, plate: formatPlate(e.target.value) }))}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm tabular-nums text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60"
                placeholder="000-00-000"
                dir="ltr"
              />
            </Field>
          </div>

          <Field label="דגם הרכב" htmlFor="carModel">
            <input
              id="carModel"
              value={form.carModel}
              disabled={submitting}
              onChange={(e) => setForm((f) => ({ ...f, carModel: e.target.value }))}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60"
              placeholder="יצרן, דגם ושנה"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="שותף / מוסך" htmlFor="partner">
              <FieldSelect
                value={form.partnerId}
                onChange={(v) => setForm((f) => ({ ...f, partnerId: v }))}
                options={partners.map((p) => ({ value: p.id, label: p.name }))}
                aria-label="בחירת שותף"
                className="w-full"
                disabled={submitting || partners.length === 0}
              />
            </Field>
            <Field label="סכום נדרש (₪)" htmlFor="amount">
              <input
                id="amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={form.requestedAmount}
                disabled={submitting}
                onChange={(e) => setForm((f) => ({ ...f, requestedAmount: e.target.value }))}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm tabular-nums text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60"
                placeholder="0.00"
                dir="ltr"
              />
            </Field>
          </div>

          {partners.length === 0 && (
            <p className="text-sm text-destructive" role="alert">
              אין שותפים פעילים — יש ליצור שותף לפני פתיחת תיק.
            </p>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              ביטול
            </Button>
            <Button type="submit" disabled={submitting || partners.length === 0}>
              {submitting ? "פותח…" : "פתיחת תיק"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
