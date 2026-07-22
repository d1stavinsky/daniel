"use client"

import { useEffect, useState } from "react"
import { REQUIRED_DOCS } from "@/lib/documents"
import { claimProgressLabels } from "@/lib/workflow-data"

type SloRow = {
  metric: string
  sampleCount: number
  p50Ms: number
  p95Ms: number
  targetP95Ms: number
  ok: boolean
}

export function SettingsView({ isFullAdmin }: { isFullAdmin: boolean }) {
  const [webhookUrl, setWebhookUrl] = useState("")
  const [webhookMsg, setWebhookMsg] = useState<string | null>(null)
  const [slos, setSlos] = useState<SloRow[]>([])
  const [endpoints, setEndpoints] = useState<{ id: string; url: string; events: string[] }[]>([])

  useEffect(() => {
    void fetch("/api/admin/slo", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => setSlos((d.slos ?? []) as SloRow[]))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isFullAdmin) return
    void fetch("/api/admin/webhooks", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => setEndpoints(d.endpoints ?? []))
      .catch(() => {})
  }, [isFullAdmin])

  async function addWebhook() {
    setWebhookMsg(null)
    const res = await fetch("/api/admin/webhooks", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    })
    if (!res.ok) {
      setWebhookMsg("הוספת webhook נכשלה")
      return
    }
    setWebhookUrl("")
    setWebhookMsg("Webhook נוסף בהצלחה")
    const data = await fetch("/api/admin/webhooks", { credentials: "same-origin" }).then((r) => r.json())
    setEndpoints(data.endpoints ?? [])
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="text-base font-semibold text-foreground">SLO — זמינות ותגובה</h2>
          <p className="text-sm text-muted-foreground">מדדי ביצועים 24 שעות אחרונות</p>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {slos.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">אין עדיין דגימות SLO</li>
          ) : (
            slos.map((s) => (
              <li key={s.metric} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-mono text-xs text-foreground">{s.metric}</span>
                <span className={s.ok ? "text-emerald-600" : "text-amber-600"}>
                  P95 {s.p95Ms}ms / יעד {s.targetP95Ms}ms · {s.sampleCount} דגימות
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      {isFullAdmin && (
        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="text-base font-semibold text-foreground">Webhooks</h2>
            <p className="text-sm text-muted-foreground">
              אירועים: claim.document_approved, claim.stp_verified, claim.completed
            </p>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                dir="ltr"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-system.com/hooks/axis"
                className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
              />
              <button
                type="button"
                onClick={() => void addWebhook()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                הוספה
              </button>
            </div>
            {webhookMsg && <p className="text-xs text-muted-foreground">{webhookMsg}</p>}
            <ul className="flex flex-col gap-2">
              {endpoints.map((ep) => (
                <li key={ep.id} className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs">
                  <span className="font-mono text-foreground">{ep.url}</span>
                  <span className="mt-1 block text-muted-foreground">{ep.events.join(", ")}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="text-base font-semibold text-foreground">סטטוס אוטומטי לפי מסמכים</h2>
          <p className="text-sm text-muted-foreground">הסטטוס נקבע לפי מספר המסמכים שאומתו ואישור תקבול ידני (שלב 6)</p>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-foreground">0 מסמכים מאומתים</span>
            <span className="text-muted-foreground">{claimProgressLabels.pending}</span>
          </li>
          <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-foreground">1–{REQUIRED_DOCS.length - 1} מסמכים מאומתים</span>
            <span className="text-muted-foreground">{claimProgressLabels.in_progress}</span>
          </li>
          <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-foreground">{REQUIRED_DOCS.length} מסמכים מאומתים (ללא אישור תקבול)</span>
            <span className="text-muted-foreground">{claimProgressLabels.pending_resolution}</span>
          </li>
          <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-foreground">{REQUIRED_DOCS.length} מסמכים מאומתים + אישור תקבול</span>
            <span className="text-muted-foreground">{claimProgressLabels.completed}</span>
          </li>
        </ul>
      </section>
    </div>
  )
}
