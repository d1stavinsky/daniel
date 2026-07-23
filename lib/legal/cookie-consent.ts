/** Cookie consent categories for ENSURA marketing + portal surfaces. */

export type CookieConsentState = {
  /** Always true — session/auth and security cookies required to run the product. */
  necessary: true
  /** Optional analytics (e.g. Vercel Analytics). */
  analytics: boolean
  updatedAt: string
}

export const COOKIE_CONSENT_KEY = "ensura.cookie-consent.v1"
export const COOKIE_CONSENT_EVENT = "ensura:cookie-consent"

export function defaultConsent(analytics = false): CookieConsentState {
  return {
    necessary: true,
    analytics,
    updatedAt: new Date().toISOString(),
  }
}

export function readCookieConsent(): CookieConsentState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CookieConsentState>
    if (typeof parsed.analytics !== "boolean") return null
    return {
      necessary: true,
      analytics: parsed.analytics,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function writeCookieConsent(state: CookieConsentState): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(state))
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: state }))
}
