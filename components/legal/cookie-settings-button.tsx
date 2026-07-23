"use client"

import { openCookiePreferences } from "@/components/legal/cookie-consent"

export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={() => openCookiePreferences()}
      className="inline-flex min-h-10 items-center text-sm text-ensura-navy/65 touch-manipulation transition-colors hover:text-ensura-teal"
    >
      הגדרות עוגיות
    </button>
  )
}
