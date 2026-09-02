'use client'

import { useRef, useState } from 'react'
import type { z } from 'zod'
import type { publicPlanSchema } from '@/lib/marketing-schemas'

type PublicPlan = z.infer<typeof publicPlanSchema>
type Cta = { label: string; href: string; trackingId?: string }

// منقول من src/components/landing/Pricing.jsx بالموقع القديم: رسالة toast قصيرة (ss-locktip) عند
// الضغط على ميزة مقفلة، بدل إخفائها. «مقفلة» هنا = feature.included=false من بيانات الباقات
// الحقيقية عبر Supabase (publicPlanSchema)، بدل حقل plan.isPaid الثابت قديماً — الحقل موجود أصلاً
// بالمخطط لكن لم تكن الواجهة تقرأه (كل الميزات كانت تُعرض بعلامة ✓ بلا تمييز).
function CheckIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
}
function LockIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
}

export function PricingGrid({ plans, badges, cta }: { plans: PublicPlan[]; badges: Record<string, string>; cta: Cta }) {
  const [tip, setTip] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const showLockTip = () => {
    setTip(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setTip(false), 3200)
  }

  return (
    <>
      <div className="ss-pricing__grid">
        {plans.map((plan, index) => {
          const badge = badges[plan.id]
          return (
            <div className={`ss-plan${badge ? ' ss-plan--featured' : ''} ss-reveal`} data-delay={index % 3} key={plan.id}>
              {badge && <span className="ss-plan__tag">✨ {badge}</span>}
              <div className="ss-plan__name">{plan.name}</div>

              <div className="ss-plan__price">
                <span className="amt">{plan.price.toLocaleString('ar-SA')} ﷼</span>
                <span className="per">{plan.billingCycle}</span>
              </div>

              <ul className="ss-plan__feats">
                {plan.features.map((feature) => (
                  <li className={`ss-plan__feat${feature.included ? '' : ' ss-plan__feat--locked'}`} key={feature.key}>
                    {feature.included
                      ? <span style={{ color: 'var(--ss-success)' }}><CheckIcon /></span>
                      : (
                        <button type="button" onClick={showLockTip} className="lock" aria-label={`${feature.name} — متاحة في باقات أخرى`}
                          style={{ background: 'none', border: 'none', padding: 0, display: 'inline-flex', cursor: 'pointer' }}>
                          <LockIcon />
                        </button>
                      )}
                    <span>{feature.name}</span>
                  </li>
                ))}
              </ul>

              <div className="ss-plan__cta">
                <a href={cta.href} className="ss-btn ss-btn--primary ss-btn--block" data-track-id={cta.trackingId}>{cta.label}</a>
              </div>
            </div>
          )
        })}
      </div>

      <p className="ss-pricing__note">جميع الأسعار بالريال السعودي.</p>

      {tip && (
        <div className="ss-locktip" role="status">
          <span>🔒 هذه الميزة متاحة في باقة أخرى.</span>
          <a href="#pricing">عرض الباقات</a>
        </div>
      )}
    </>
  )
}
