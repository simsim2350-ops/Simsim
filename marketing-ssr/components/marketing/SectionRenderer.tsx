import Link from 'next/link'
import type { MarketingSection } from '@/lib/marketing-types'
import { appUrl, isSaasRoute } from '@/lib/urls'
import type { z } from 'zod'
import type { publicPlanSchema } from '@/lib/marketing-schemas'

type PublicPlan = z.infer<typeof publicPlanSchema>

type AnyRecord = Record<string, unknown>

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function listValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function Cta({ cta, className = 'button button-primary' }: { cta: unknown; className?: string }) {
  const value = (cta && typeof cta === 'object' ? cta : {}) as AnyRecord
  const label = stringValue(value.label)
  const href = stringValue(value.href, '#')
  const trackingId = stringValue(value.trackingId)
  if (!label) return null
  const props = { className, 'data-track-id': trackingId || undefined }
  if (isSaasRoute(href)) return <a href={appUrl(href)} {...props}>{label}</a>
  return href.startsWith('/') ? <Link href={href} {...props}>{label}</Link> : <a href={href} {...props}>{label}</a>
}

function SectionHeading({ eyebrow, heading, description }: AnyRecord) {
  return <header className="section-heading">
    {stringValue(eyebrow) && <p className="eyebrow">{stringValue(eyebrow)}</p>}
    <h2>{stringValue(heading)}</h2>
    {stringValue(description) && <p>{stringValue(description)}</p>}
  </header>
}

function Hero({ content }: { content: AnyRecord }) {
  return <section id="hero" className="hero section">
    <div className="container hero-grid">
      <div>
        <p className="eyebrow">{stringValue(content.eyebrow)}</p>
        <h1>{stringValue(content.heading)}</h1>
        <p className="hero-copy">{stringValue(content.description)}</p>
        <div className="actions"><Cta cta={content.primaryCta} /><Cta cta={content.secondaryCta} className="button button-secondary" /></div>
        <p className="hero-proof">{stringValue(content.proof)}</p>
      </div>
      <div className="hero-card" aria-label="معاينة منيو سمسم">
        <div className="phone-top"><span>SIMSIM</span><span>● ● ●</span></div>
        <div className="menu-cover" />
        <div className="menu-content"><strong>قهوة سمسم</strong><small>منيو رقمي سريع وسهل</small><div className="menu-tabs"><span>الأكثر طلباً</span><span>القهوة</span><span>الحلويات</span></div><div className="menu-row"><span>لاتيه ساخن</span><b>14 ﷼</b></div><div className="menu-row"><span>كرواسون بالزبدة</span><b>10 ﷼</b></div></div>
      </div>
    </div>
  </section>
}

function Problem({ content }: { content: AnyRecord }) {
  return <section className="section muted-section"><div className="container"><SectionHeading {...content} /><ul className="pain-grid">{listValue(content.items).map((item, index) => <li key={index}><span>—</span>{stringValue(item)}</li>)}</ul></div></section>
}

function Benefits({ content }: { content: AnyRecord }) {
  return <section className="section"><div className="container"><SectionHeading {...content} /><div className="benefit-layout"><div className="benefit-mark">س</div><ul className="check-list">{listValue(content.items).map((item, index) => <li key={index}><span>✓</span>{stringValue(item)}</li>)}</ul></div></div></section>
}

function Steps({ content }: { content: AnyRecord }) {
  return <section id="how-it-works" className="section muted-section"><div className="container"><SectionHeading {...content} /><ol className="step-grid">{listValue(content.steps).map((item, index) => { const step = (item || {}) as AnyRecord; return <li key={index}><span>{stringValue(step.number)}</span><h3>{stringValue(step.title)}</h3><p>{stringValue(step.description)}</p></li> })}</ol></div></section>
}

function MenuPreview({ content }: { content: AnyRecord }) {
  return <section className="section"><div className="container preview-grid"><div className="preview-card"><div className="preview-qr">QR</div><div><b>شارك رابط منيوك وQR Code</b><p>وصول أسرع وتجربة أوضح لكل عميل.</p></div></div><div><SectionHeading {...content} /><ul className="check-list">{listValue(content.points).map((item, index) => <li key={index}><span>✓</span>{stringValue(item)}</li>)}</ul></div></div></section>
}

function Features({ content }: { content: AnyRecord }) {
  return <section id="features" className="section muted-section"><div className="container"><SectionHeading {...content} /><div className="feature-grid">{listValue(content.items).map((item, index) => { const feature = (item || {}) as AnyRecord; return <article key={index}><div className="feature-icon">✦</div><h3>{stringValue(feature.title)}</h3><p>{stringValue(feature.description)}</p></article> })}</div></div></section>
}

function Trust({ content }: { content: AnyRecord }) {
  return <section className="section trust"><div className="container"><SectionHeading {...content} /><div className="trust-list">{listValue(content.items).map((item, index) => <span key={index}>{stringValue(item)}</span>)}</div></div></section>
}

function Pricing({ content, plans = [] }: { content: AnyRecord; plans?: PublicPlan[] }) {
  return <section id="pricing" className="section muted-section"><div className="container"><SectionHeading {...content} />{plans.length ? <div className="pricing-grid">{plans.map((plan) => <article className="plan-card" key={plan.id}><p className="plan-cycle">{plan.billingCycle === 'yearly' ? 'سنوي' : 'شهري'}</p><h3>{plan.name}</h3><p className="plan-price"><b>{plan.price.toLocaleString('ar-SA')}</b> <span>﷼</span></p><ul>{plan.features.map((feature) => <li key={feature.key}>✓ {feature.name}</li>)}</ul><a className="button button-primary" href={appUrl('/register')} data-track-id={`pricing-${plan.id}-signup`}>ابدأ الآن</a></article>)}</div> : <div className="pricing-notice"><strong>ستُعلن الباقات قريبًا.</strong><p>يقرأ هذا القسم سجل الفوترة المركزي مباشرة؛ لن تُعرض أي باقة قبل تفعيلها في لوحة Super Admin.</p></div>}</div></section>
}

function Faq({ content }: { content: AnyRecord }) {
  return <section id="faq" className="section"><div className="container narrow"><SectionHeading {...content} /><div className="faq-list">{listValue(content.items).map((item, index) => { const faq = (item || {}) as AnyRecord; return <details key={index}><summary>{stringValue(faq.question)}</summary><p>{stringValue(faq.answer)}</p></details> })}</div></div></section>
}

function FinalCta({ content }: { content: AnyRecord }) {
  return <section className="section"><div className="container"><div className="final-cta"><h2>{stringValue(content.heading)}</h2><p>{stringValue(content.description)}</p><Cta cta={content.primaryCta} /></div></div></section>
}

const registry: Record<string, (props: { content: AnyRecord; plans?: PublicPlan[] }) => React.ReactNode> = {
  HERO: Hero,
  PROBLEM: Problem,
  BENEFITS: Benefits,
  STEPS: Steps,
  MENU_PREVIEW: MenuPreview,
  FEATURES: Features,
  TRUST: Trust,
  PRICING: Pricing,
  FAQ: Faq,
  CTA: FinalCta,
}

export function SectionRenderer({ section, plans = [] }: { section: MarketingSection; plans?: PublicPlan[] }) {
  if (!section.isVisible) return null
  const Component = registry[section.type]
  if (!Component) {
    console.error('[marketing] unknown section type', section.type)
    return null
  }
  return <Component content={section.content as AnyRecord} plans={plans} />
}
