import Link from 'next/link'
import type { MarketingSection } from '@/lib/marketing-types'
import { appUrl, isSaasRoute } from '@/lib/urls'
import { getDemoRestaurantPreview } from '@/lib/demo-restaurant'
import { DemoPhone } from './DemoPhone'
import { getDemoMenu } from '@/lib/demo-menu'
import { InteractiveMenuDemo } from './InteractiveMenuDemo'
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

function recordValue(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {}
}

function Cta({ cta, className = 'button button-primary' }: { cta: unknown; className?: string }) {
  const value = recordValue(cta)
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
    {stringValue(heading) && <h2>{stringValue(heading)}</h2>}
    {stringValue(description) && <p>{stringValue(description)}</p>}
  </header>
}

function SectionImage({ src, alt, className = 'marketing-image' }: { src: unknown; alt: unknown; className?: string }) {
  const url = stringValue(src)
  return url ? <img className={className} src={url} alt={stringValue(alt)} loading="lazy" /> : null
}

async function Hero({ content }: { content: AnyRecord }) {
  const hasImage = Boolean(stringValue(content.imageUrl))
  // لا صورة CMS لهذا القسم حالياً في أي محتوى منشور — بدلاً من الانهيار لعمود واحد فارغ، نعرض
  // معاينة حية للقراءة فقط لمطعم العرض التجريبي (نفس فكرة PhoneMockup بالموقع القديم، لكن SSR بحت).
  const demo = hasImage ? null : await getDemoRestaurantPreview()
  const hasVisual = hasImage || Boolean(demo)
  return <section id="hero" className="hero section"><div className={`container hero-grid${hasVisual ? '' : ' no-image'}`}><div>
    <p className="eyebrow">{stringValue(content.eyebrow)}</p><h1>{stringValue(content.heading)}</h1><p className="hero-copy">{stringValue(content.description)}</p>
    <div className="actions"><Cta cta={content.primaryCta} /><Cta cta={content.secondaryCta} className="button button-secondary" /></div>
    {stringValue(content.proof) && <p className="hero-proof">{stringValue(content.proof)}</p>}
  </div>{hasImage && <SectionImage src={content.imageUrl} alt={content.imageAlt} className="hero-media" />}{!hasImage && demo && <DemoPhone data={demo} />}</div></section>
}

function Problem({ content }: { content: AnyRecord }) {
  return <section className="section muted-section"><div className="container"><SectionHeading {...content} /><ul className="pain-grid">{listValue(content.items).map((item, index) => <li key={index}><span>—</span>{stringValue(item)}</li>)}</ul></div></section>
}

// أرقام سمسم الأربعة كما في src/components/landing/Benefits.jsx بالموقع القديم — نص ثابت غير
// مرتبط بـCMS (نفس حال النسخة القديمة)، يُعرض بدلاً من عمود فارغ حين لا توجد صورة CMS لهذا القسم.
const BENEFIT_STATS = [
  { value: 'دقائق', label: 'تنشئ منيوك كاملاً' },
  { value: '0 ﷼', label: 'للبدء بدون بطاقة' },
  { value: 'QR', label: 'جاهز للطباعة فوراً' },
  { value: '24/7', label: 'منيوك متاح دائماً' },
]

function Benefits({ content }: { content: AnyRecord }) {
  const hasImage = Boolean(stringValue(content.imageUrl))
  return <section className="section"><div className="container benefit-layout"><div><SectionHeading {...content} /><ul className="check-list">{listValue(content.items).map((item, index) => <li key={index}><span>✓</span>{stringValue(item)}</li>)}</ul></div>{hasImage ? <SectionImage src={content.imageUrl} alt={content.imageAlt} /> : <div className="stats-grid">{BENEFIT_STATS.map((stat) => <article key={stat.value}><strong>{stat.value}</strong><h3>{stat.label}</h3></article>)}</div>}</div></section>
}

function Steps({ content }: { content: AnyRecord }) {
  return <section id="how-it-works" className="section muted-section"><div className="container"><SectionHeading {...content} /><ol className="step-grid">{listValue(content.steps).map((item, index) => { const step = recordValue(item); return <li key={index}><span>{stringValue(step.number, String(index + 1))}</span><h3>{stringValue(step.title)}</h3><p>{stringValue(step.description)}</p></li> })}</ol></div></section>
}

async function MenuPreview({ content }: { content: AnyRecord }) {
  const hasImage = Boolean(stringValue(content.imageUrl))
  // نفس فكرة Hero: لا صورة CMS لهذا القسم حالياً، فبدلاً من عمود فارغ نعرض معاينة تفاعلية حقيقية
  // (بلا أي كتابة بيانات) لمنيو مطعم العرض التجريبي — نسخة SSR + عميل خفيف من InteractiveDemo القديم.
  const demo = hasImage ? null : await getDemoMenu()
  const hasVisual = hasImage || Boolean(demo)
  return <section className="section"><div className={`container preview-grid${hasVisual ? '' : ' no-image'}`}>{hasImage && <SectionImage src={content.imageUrl} alt={content.imageAlt} className="marketing-image preview-media" />}{!hasImage && demo && <InteractiveMenuDemo data={demo} />}<div><SectionHeading {...content} /><ul className="check-list">{listValue(content.points).map((item, index) => <li key={index}><span>✓</span>{stringValue(item)}</li>)}</ul></div></div></section>
}

function Features({ content, isFirstOfType }: { content: AnyRecord; isFirstOfType?: boolean }) {
  // A page may carry two FEATURES sections (e.g. "Basics" then "Growth"), each with its own
  // CMS-driven eyebrow/heading acting as the group label — only the first gets the #features
  // anchor id, so multiple instances stay valid HTML and the nav link still targets the top one.
  return <section id={isFirstOfType === false ? undefined : 'features'} className="section muted-section"><div className="container"><SectionHeading {...content} /><div className="feature-grid">{listValue(content.items).map((item, index) => { const feature = recordValue(item); return <article key={index}><div className="feature-icon">{stringValue(feature.icon, '✦')}</div><h3>{stringValue(feature.title)}</h3><p>{stringValue(feature.description)}</p></article> })}</div></div></section>
}

function Trust({ content }: { content: AnyRecord }) {
  return <section className="section trust"><div className="container"><SectionHeading {...content} /><div className="trust-list">{listValue(content.items).map((item, index) => <span key={index}>{stringValue(item)}</span>)}</div></div></section>
}

function Pricing({ content, plans = [] }: { content: AnyRecord; plans?: PublicPlan[] }) {
  const hidden = new Set(listValue(content.hiddenPlanIds).map(String))
  const order = listValue(content.planOrder).map(String)
  const badges = recordValue(content.badges)
  const listed = plans.filter((plan) => !hidden.has(plan.id)).sort((left, right) => {
    const a = order.indexOf(left.id); const b = order.indexOf(right.id)
    return (a < 0 ? Number.MAX_SAFE_INTEGER : a) - (b < 0 ? Number.MAX_SAFE_INTEGER : b) || left.sortOrder - right.sortOrder
  })
  return <section id="pricing" className="section muted-section"><div className="container"><SectionHeading {...content} />{listed.length ? <div className="pricing-grid">{listed.map((plan) => <article className="plan-card" key={plan.id}>{stringValue(badges[plan.id]) && <p className="plan-badge">{stringValue(badges[plan.id])}</p>}<p className="plan-cycle">{plan.billingCycle}</p><h3>{plan.name}</h3><p className="plan-price"><b>{plan.price.toLocaleString('ar-SA')}</b> <span>﷼</span></p><ul>{plan.features.map((feature) => <li key={feature.key}>✓ {feature.name}</li>)}</ul><Cta cta={content.primaryCta || { label: 'ابدأ الآن', href: '/register', trackingId: `pricing-${plan.id}-signup` }} /></article>)}</div> : <div className="pricing-notice"><strong>{stringValue(content.emptyHeading, 'ستُعلن الباقات قريبًا.')}</strong><p>{stringValue(content.emptyDescription, 'لا تظهر الباقات قبل تفعيلها في إعدادات الفوترة.')}</p></div>}</div></section>
}

function Faq({ content }: { content: AnyRecord }) {
  return <section id="faq" className="section"><div className="container narrow"><SectionHeading {...content} /><div className="faq-list">{listValue(content.items).map((item, index) => { const faq = recordValue(item); return <details key={index}><summary>{stringValue(faq.question)}</summary><p>{stringValue(faq.answer)}</p></details> })}</div></div></section>
}

function FinalCta({ content }: { content: AnyRecord }) {
  return <section className="section"><div className="container"><div className="final-cta"><SectionImage src={content.imageUrl} alt={content.heading} /><h2>{stringValue(content.heading)}</h2><p>{stringValue(content.description)}</p><Cta cta={content.primaryCta} /></div></div></section>
}

function Video({ content }: { content: AnyRecord }) {
  const url = stringValue(content.videoUrl)
  return <section className="section muted-section"><div className="container narrow"><SectionHeading {...content} />{url && <video className="marketing-video" controls preload="metadata" poster={stringValue(content.posterUrl) || undefined}><source src={url} />{stringValue(content.caption, 'متصفحك لا يدعم عرض الفيديو.')}</video>}<Cta cta={content.primaryCta} /></div></section>
}

function ImageText({ content }: { content: AnyRecord }) {
  const end = stringValue(content.imagePosition, 'end') === 'end'
  const image = <SectionImage src={content.imageUrl} alt={content.imageAlt} />
  const copy = <div><SectionHeading {...content} /><Cta cta={content.primaryCta} /></div>
  return <section className="section"><div className="container image-text-grid">{end ? <>{copy}{image}</> : <>{image}{copy}</>}</div></section>
}

function Testimonials({ content }: { content: AnyRecord }) {
  return <section className="section muted-section"><div className="container"><SectionHeading {...content} /><div className="testimonial-grid">{listValue(content.items).map((item, index) => { const testimonial = recordValue(item); return <figure key={index}><blockquote>“{stringValue(testimonial.quote)}”</blockquote><figcaption>{stringValue(testimonial.avatarUrl) && <img src={stringValue(testimonial.avatarUrl)} alt="" loading="lazy" />}<div><b>{stringValue(testimonial.name)}</b><span>{stringValue(testimonial.role)}</span></div></figcaption></figure> })}</div></div></section>
}

function Stats({ content }: { content: AnyRecord }) {
  return <section className="section"><div className="container"><SectionHeading {...content} /><div className="stats-grid">{listValue(content.items).map((item, index) => { const stat = recordValue(item); return <article key={index}><strong>{stringValue(stat.value)}</strong><h3>{stringValue(stat.label)}</h3>{stringValue(stat.description) && <p>{stringValue(stat.description)}</p>}</article> })}</div></div></section>
}

function Logos({ content }: { content: AnyRecord }) {
  return <section className="section muted-section"><div className="container"><SectionHeading {...content} /><div className="logo-grid">{listValue(content.items).map((item, index) => { const logo = recordValue(item); const body = <img src={stringValue(logo.logoUrl)} alt={stringValue(logo.name)} loading="lazy" />; return stringValue(logo.href) ? <a key={index} href={stringValue(logo.href)} aria-label={stringValue(logo.name)}>{body}</a> : <div key={index}>{body}</div> })}</div></div></section>
}

function Comparison({ content }: { content: AnyRecord }) {
  const columns = listValue(content.columns).map((value) => stringValue(value))
  return <section className="section"><div className="container"><SectionHeading {...content} /><div className="comparison-wrap"><table className="comparison-table"><thead><tr>{columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead><tbody>{listValue(content.rows).map((item, index) => { const row = recordValue(item); return <tr key={index}><th>{stringValue(row.label)}</th>{listValue(row.values).map((value, valueIndex) => <td key={valueIndex}>{typeof value === 'boolean' ? (value ? '✓' : '—') : stringValue(value)}</td>)}</tr> })}</tbody></table></div></div></section>
}

function Contact({ content }: { content: AnyRecord }) {
  const email = stringValue(content.email); const phone = stringValue(content.phone); const address = stringValue(content.address)
  return <section className="section muted-section"><div className="container narrow"><SectionHeading {...content} /><div className="contact-grid">{email && <a href={`mailto:${email}`}>{email}</a>}{phone && <a href={`tel:${phone}`}>{phone}</a>}{address && <p>{address}</p>}</div><Cta cta={content.primaryCta} /></div></section>
}

const registry: Record<string, (props: { content: AnyRecord; plans?: PublicPlan[]; isFirstOfType?: boolean }) => React.ReactNode | Promise<React.ReactNode>> = {
  HERO: Hero, PROBLEM: Problem, BENEFITS: Benefits, STEPS: Steps, MENU_PREVIEW: MenuPreview, FEATURES: Features, TRUST: Trust, PRICING: Pricing, FAQ: Faq, CTA: FinalCta,
  VIDEO: Video, IMAGE_TEXT: ImageText, TESTIMONIALS: Testimonials, STATS: Stats, LOGOS: Logos, COMPARISON: Comparison, CONTACT: Contact,
}

export function SectionRenderer({ section, plans = [], isFirstOfType }: { section: MarketingSection; plans?: PublicPlan[]; isFirstOfType?: boolean }) {
  if (!section.isVisible) return null
  const Component = registry[section.type]
  if (!Component) {
    console.error('[marketing] unknown section type', section.type)
    return null
  }
  return <Component content={section.content as AnyRecord} plans={plans} isFirstOfType={isFirstOfType} />
}
