'use client'

import { useMemo, useRef, useState } from 'react'
import type { z } from 'zod'
import type { publicPlanSchema } from '@/lib/marketing-schemas'

type PublicPlan = z.infer<typeof publicPlanSchema>
type Cta = { label: string; href: string; trackingId?: string }
type Cycle = 'monthly' | 'yearly'

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

const fmt = (n: number) => n.toLocaleString('ar-SA')

export function PricingGrid({ plans, badges, cta }: { plans: PublicPlan[]; badges: Record<string, string>; cta: Cta }) {
  const [tip, setTip] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  // شهري افتراضياً — لا يوجد قرار تجاري مُلزم بعرض السنوي أولاً؛ يمكن تغييره بسطر واحد لاحقاً.
  const [cycle, setCycle] = useState<Cycle>('monthly')

  const showLockTip = () => {
    setTip(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setTip(false), 3200)
  }

  // كل السعرين يصلان مسبقاً من marketing_public_plans في استدعاء واحد — التبديل هنا محلي فقط،
  // بلا طلب إضافي، وبلا أي ثابت سعر داخل الواجهة (كل رقم من plan.monthly/plan.yearly الحقيقيين).
  const visible = useMemo(() => plans.filter((plan) => plan[cycle] != null), [plans, cycle])
  const hasYearly = useMemo(() => plans.some((plan) => plan.yearly != null), [plans])
  const hasMonthly = useMemo(() => plans.some((plan) => plan.monthly != null), [plans])

  return (
    <>
      {(hasMonthly && hasYearly) && (
        <div className="ss-billing-toggle" role="tablist" aria-label="دورة الفوترة">
          <button type="button" role="tab" aria-selected={cycle === 'monthly'} className={cycle === 'monthly' ? 'is-active' : ''} onClick={() => setCycle('monthly')}>شهري</button>
          <button type="button" role="tab" aria-selected={cycle === 'yearly'} className={cycle === 'yearly' ? 'is-active' : ''} onClick={() => setCycle('yearly')}>سنوي <span className="ss-billing-toggle__hint">وفر أكثر</span></button>
        </div>
      )}

      {visible.length ? (
        <div className="ss-pricing__grid">
          {visible.map((plan, index) => {
            const cyclePrice = plan[cycle]!
            const badgeText = badges[plan.id] || (plan.isRecommended ? 'الأكثر طلباً' : '')
            const featured = Boolean(badgeText)
            const savingsPercent = cycle === 'yearly' ? plan.yearly?.savingsPercent : null
            return (
              <div className={`ss-plan${featured ? ' ss-plan--featured' : ''} ss-reveal`} data-delay={index % 3} key={plan.id}>
                {badgeText && <span className="ss-plan__tag">✨ {badgeText}</span>}
                <div className="ss-plan__name">{plan.name}</div>
                {plan.description && <p className="ss-plan__desc">{plan.description}</p>}

                <div className="ss-plan__price">
                  <span className="amt">{fmt(cyclePrice.price)} ﷼</span>
                  <span className="per">{cycle === 'monthly' ? 'شهرياً' : 'سنوياً'}</span>
                </div>
                {cycle === 'yearly' && cyclePrice.monthlyEquivalent != null && (
                  <p className="ss-plan__equiv">
                    يعادل {fmt(cyclePrice.monthlyEquivalent)} ﷼/شهرياً
                    {savingsPercent != null && savingsPercent > 0 && <span className="ss-plan__savings"> · وفّر {savingsPercent}%</span>}
                  </p>
                )}

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
                  <a href={cta.href} className="ss-btn ss-btn--primary ss-btn--block" data-track-id={cta.trackingId}>{plan.ctaText || cta.label}</a>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="ss-pricing__empty">
          <strong>لا توجد باقات بهذه الدورة حالياً.</strong>
          <p>جرّب الدورة الأخرى أعلاه.</p>
        </div>
      )}

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
