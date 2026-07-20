import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Heebo, Manrope } from 'next/font/google'
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
  colorScheme: 'light dark',
  themeColor: '#F4F7F8',
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
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
