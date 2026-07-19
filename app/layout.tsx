import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'AXIS · ניהול תביעות',
  description: 'AXIS – מחברים משפט, טכנולוגיה ושקט נפשי לעסק שלך. ניהול תביעות פרימיום למוסכים וסוכנויות ביטוח.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#22262e',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} bg-background`}>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
