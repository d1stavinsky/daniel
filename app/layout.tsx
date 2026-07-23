import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Heebo, Manrope } from 'next/font/google'
import { AnalyticsGate, CookieConsentBanner } from '@/components/legal/cookie-consent'
import './globals.css'

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'אינשורה | ENSURA – ניהול תביעות רכב. פשוט יותר.',
  description:
    'אינשורה מנהלת עבור מוסכים וסוכנויות ביטוח את כל תהליך התביעה — עם מעטפת מקצועית, מעקב דיגיטלי וכל הגורמים במקום אחד.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F7F8' },
    { media: '(prefers-color-scheme: dark)', color: '#10263F' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${manrope.variable} bg-background`}
    >
      <body className="font-sans antialiased">
        <a
          href="#main-content"
          className="sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:m-0 focus:inline-flex focus:h-auto focus:w-auto focus:overflow-visible focus:rounded-lg focus:bg-ensura-navy focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:[clip:auto]"
        >
          דילוג לתוכן הראשי
        </a>
        {children}
        <CookieConsentBanner />
        {process.env.NODE_ENV === 'production' && (
          <AnalyticsGate>
            <Analytics />
          </AnalyticsGate>
        )}
      </body>
    </html>
  )
}
