'use client'

import { useEffect } from 'react'

// منقول من src/hooks/useReveal.js + تأثير التمرير السلس بـsrc/pages/Landing.jsx بالموقع القديم.
// يُركَّب مرة واحدة داخل .ss-landing: يكشف كل عنصر .ss-reveal عند دخوله الشاشة، ويفعّل التمرير
// السلس للروابط الداخلية (#) مع احترام prefers-reduced-motion.
export function RevealOnScroll() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.ss-reveal'))
    if (!('IntersectionObserver' in window) || els.length === 0) {
      els.forEach((el) => el.classList.add('is-visible'))
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            io.unobserve(entry.target)
          }
        })
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })
      els.forEach((el) => io.observe(el))
      return () => io.disconnect()
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const prev = root.style.scrollBehavior
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    root.style.scrollBehavior = reduce ? 'auto' : 'smooth'
    return () => { root.style.scrollBehavior = prev }
  }, [])

  return null
}
