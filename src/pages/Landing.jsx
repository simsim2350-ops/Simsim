import { useEffect } from 'react'
import './landing.css'
import useReveal from '../hooks/useReveal'
import Navbar from '../components/landing/Navbar'
import Hero from '../components/landing/Hero'
import ProblemSection from '../components/landing/ProblemSection'
import HowItWorks from '../components/landing/HowItWorks'
import Features from '../components/landing/Features'
import MenuPreview from '../components/landing/MenuPreview'
import Benefits from '../components/landing/Benefits'
import Trust from '../components/landing/Trust'
import Pricing from '../components/landing/Pricing'
import FAQ from '../components/landing/FAQ'
import FinalCTA from '../components/landing/FinalCTA'
import Footer from '../components/landing/Footer'

// الموقع التسويقي الرسمي لمنصّة سمسم (Marketing Website).
// صفحة عامة على الجذر «/» — منفصلة تماماً عن اللوحة والمنيو.
export default function Landing() {
  useReveal()

  // تمرير سلس للروابط الداخلية (#) مع احترام تفضيل تقليل الحركة.
  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.documentElement.style.scrollBehavior = reduce ? 'auto' : 'smooth'
    return () => { document.documentElement.style.scrollBehavior = prev }
  }, [])

  return (
    <div className="ss-landing">
      <Navbar />
      <main>
        <Hero />
        <ProblemSection />
        <HowItWorks />
        <Features />
        <MenuPreview />
        <Benefits />
        <Trust />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
