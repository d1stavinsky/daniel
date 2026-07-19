import { SiteHeader } from "@/components/landing/site-header"
import { Hero } from "@/components/landing/hero"
import { Advantage } from "@/components/landing/advantage"
import { LoginCta } from "@/components/landing/login-cta"
import { SiteFooter } from "@/components/landing/site-footer"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <Hero />
        <Advantage />
        <LoginCta />
      </main>
      <SiteFooter />
    </div>
  )
}
