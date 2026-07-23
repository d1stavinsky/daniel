"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  COOKIE_CONSENT_EVENT,
  defaultConsent,
  readCookieConsent,
  writeCookieConsent,
  type CookieConsentState,
} from "@/lib/legal/cookie-consent"
import { cn } from "@/lib/utils"

export function useCookieConsent() {
  const [consent, setConsent] = useState<CookieConsentState | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setConsent(readCookieConsent())
    setReady(true)
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<CookieConsentState>).detail
      setConsent(detail ?? readCookieConsent())
    }
    window.addEventListener(COOKIE_CONSENT_EVENT, onChange)
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onChange)
  }, [])

  const save = useCallback((analytics: boolean) => {
    const next = defaultConsent(analytics)
    writeCookieConsent(next)
    setConsent(next)
  }, [])

  return { consent, ready, save }
}

/** Gates optional analytics until the visitor opts in. */
export function AnalyticsGate({ children }: { children: ReactNode }) {
  const { consent, ready } = useCookieConsent()
  if (!ready || !consent?.analytics) return null
  return <>{children}</>
}

export function CookieConsentBanner() {
  const { consent, ready, save } = useCookieConsent()
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [analyticsDraft, setAnalyticsDraft] = useState(false)
  const [forceOpen, setForceOpen] = useState(false)

  useEffect(() => {
    const openPrefs = () => {
      const current = readCookieConsent()
      setAnalyticsDraft(current?.analytics ?? false)
      setPrefsOpen(true)
      setForceOpen(true)
    }
    window.addEventListener("ensura:open-cookie-prefs", openPrefs)
    return () => window.removeEventListener("ensura:open-cookie-prefs", openPrefs)
  }, [])

  const visible = ready && (forceOpen || consent === null)
  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="ensura-cookie-title"
      aria-describedby="ensura-cookie-desc"
      className="fixed inset-x-0 bottom-0 z-[80] p-3 sm:p-5"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-3xl border border-ensura-navy/10 bg-ensura-canvas/95 shadow-[0_-12px_48px_-24px_rgba(16,38,63,0.45)] backdrop-blur-md">
        <div className="border-s-[3px] border-ensura-teal px-4 py-4 sm:px-6 sm:py-5">
          <p
            id="ensura-cookie-title"
            className="text-sm font-semibold tracking-tight text-ensura-ink"
          >
            שימוש בעוגיות
          </p>
          <p
            id="ensura-cookie-desc"
            className="mt-2 text-sm leading-relaxed text-ensura-navy/65 text-pretty"
          >
            אנו משתמשים בעוגיות הכרחיות להפעלת הפורטל והאבטחה. עוגיות מדידה מופעלות רק אם
            תאשרו. פירוט ב{" "}
            <Link href="/privacy" className="font-medium text-ensura-teal hover:underline">
              מדיניות הפרטיות
            </Link>
            .
          </p>

          {prefsOpen ? (
            <div className="mt-4 space-y-3 border-t border-ensura-navy/8 pt-4">
              <label className="flex items-start gap-3 text-sm text-ensura-navy/70">
                <input
                  type="checkbox"
                  checked
                  disabled
                  className="mt-0.5 size-4 rounded border-ensura-navy/25"
                />
                <span>
                  <span className="font-medium text-ensura-ink">הכרחיות</span> — התחברות,
                  אבטחה ותפקוד בסיסי (תמיד פעילות).
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 text-sm text-ensura-navy/70">
                <input
                  type="checkbox"
                  checked={analyticsDraft}
                  onChange={(e) => setAnalyticsDraft(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-ensura-navy/25 text-ensura-teal focus-visible:ring-2 focus-visible:ring-ensura-teal/30"
                />
                <span>
                  <span className="font-medium text-ensura-ink">מדידה</span> — סטטיסטיקות
                  שימוש אנונימיות לשיפור השירות.
                </span>
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    save(analyticsDraft)
                    setPrefsOpen(false)
                    setForceOpen(false)
                  }}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ensura-navy px-4 text-sm font-medium text-white touch-manipulation hover:bg-ensura-navy/90"
                >
                  שמירת בחירה
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setAnalyticsDraft(consent?.analytics ?? false)
                  setPrefsOpen(true)
                }}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center rounded-lg border border-ensura-navy/15 bg-transparent px-4 text-sm font-medium text-ensura-ink touch-manipulation",
                  "hover:border-ensura-navy/25 hover:bg-white/60",
                )}
              >
                התאמה אישית
              </button>
              <button
                type="button"
                onClick={() => {
                  save(false)
                  setForceOpen(false)
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ensura-navy/15 bg-white px-4 text-sm font-medium text-ensura-ink touch-manipulation hover:bg-ensura-canvas"
              >
                הכרחיות בלבד
              </button>
              <button
                type="button"
                onClick={() => {
                  save(true)
                  setForceOpen(false)
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ensura-teal px-4 text-sm font-semibold text-white touch-manipulation hover:bg-ensura-teal/90"
              >
                אישור הכל
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function openCookiePreferences() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event("ensura:open-cookie-prefs"))
}
