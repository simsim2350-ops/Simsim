import Link from 'next/link'
import type { MarketingSection } from '@/lib/marketing-types'
import { appUrl, isSaasRoute } from '@/lib/urls'
import { getDemoRestaurantPreview } from '@/lib/demo-restaurant'
import { DemoPhone } from './DemoPhone'
import { getDemoMenu } from '@/lib/demo-menu'
import { MenuPreviewInteractive } from './MenuPreviewInteractive'
import { FaqAccordion } from './FaqAccordion'
import { PricingGrid } from './PricingGrid'
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

// ---------------------------------------------------------------------
// Shared helpers still used by section types outside the old-site migration
// scope (VIDEO/IMAGE_TEXT/TESTIMONIALS/STATS/LOGOS/COMPARISON/CONTACT).
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// Helpers for the sections migrated from the old site (src/components/landing/*) — same CMS
// content-reading logic as above, but old ss-* markup/classes from src/pages/landing.css.
// ---------------------------------------------------------------------
function SsCta({ cta, className = 'ss-btn ss-btn--primary ss-btn--lg' }: { cta: unknown; className?: string }) {
  const value = recordValue(cta)
  const label = stringValue(value.label)
  const href = stringValue(value.href, '#')
  const trackingId = stringValue(value.trackingId)
  if (!label) return null
  const props = { className, 'data-track-id': trackingId || undefined }
  if (isSaasRoute(href)) return <a href={appUrl(href)} {...props}>{label}</a>
  return href.startsWith('/') ? <Link href={href} {...props}>{label}</Link> : <a href={href} {...props}>{label}</a>
}

function SsSectionHead({ eyebrow, heading, description, className = '' }: AnyRecord & { className?: string }) {
  return <div className={`ss-section-head ss-reveal${className ? ` ${className}` : ''}`}>
    {stringValue(eyebrow) && <span className="ss-eyebrow">{stringValue(eyebrow)}</span>}
    {stringValue(heading) && <h2>{stringValue(heading)}</h2>}
    {stringValue(description) && <p>{stringValue(description)}</p>}
  </div>
}

async function Hero({ content }: { content: AnyRecord }) {
  const hasImage = Boolean(stringValue(content.imageUrl))
  // لا صورة CMS لهذا القسم حالياً في أي محتوى منشور — بدلاً من الانهيار لعمود واحد فارغ، نعرض
  // معاينة حية للقراءة فقط لمطعم العرض التجريبي (DemoPhone)، بنفس فكرة PhoneMockup بالموقع القديم.
  const demo = hasImage ? null : await getDemoRestaurantPreview()
  const hasVisual = hasImage || Boolean(demo)
  const proof = stringValue(content.proof)
  return (
    <section id="hero" className="ss-hero">
      <div className={`ss-container ss-hero__grid${hasVisual ? '' : ' no-visual'}`}>
        <div className="ss-hero__copy ss-reveal">
          {stringValue(content.eyebrow) && <span className="ss-eyebrow ss-hero__badge">{stringValue(content.eyebrow)}</span>}
          <h1>{stringValue(content.heading)}</h1>
          <p className="ss-hero__sub">{stringValue(content.description)}</p>
          <div className="ss-hero__cta">
            <SsCta cta={content.primaryCta} />
            <SsCta cta={content.secondaryCta} className="ss-btn ss-btn--ghost ss-btn--lg" />
          </div>
          {proof && (
            <div className="ss-hero__trust">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M20 6 9 17l-5-5" /></svg>
              <span>{proof}</span>
            </div>
          )}
        </div>
        {hasVisual && (
          <div className="ss-hero__visual ss-reveal" data-delay="1">
            <div className="ss-phone__glow" />
            {hasImage ? (
              <SectionImage src={content.imageUrl} alt={content.imageAlt} className="hero-media" />
            ) : demo && (
              <>
                <div className="ss-float ss-float--slow"><DemoPhone data={demo} /></div>
                <div className="ss-hero__qr ss-float" aria-hidden="true">
                  <svg width="48" height="48" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#0F1117" /><g fill="#fff"><rect x="10" y="10" width="16" height="16" rx="2" fill="none" stroke="#fff" strokeWidth="3" /><rect x="15" y="15" width="6" height="6" /><rect x="38" y="10" width="16" height="16" rx="2" fill="none" stroke="#fff" strokeWidth="3" /><rect x="43" y="15" width="6" height="6" /><rect x="10" y="38" width="16" height="16" rx="2" fill="none" stroke="#fff" strokeWidth="3" /><rect x="15" y="43" width="6" height="6" /><rect x="34" y="34" width="5" height="5" /><rect x="43" y="34" width="5" height="5" /><rect x="52" y="34" width="4" height="5" /><rect x="34" y="43" width="5" height="5" /><rect x="43" y="43" width="5" height="5" /><rect x="49" y="49" width="7" height="7" /><rect x="34" y="52" width="5" height="4" /></g></svg>
                  <span>امسح واطلب</span>
                </div>
                <div className="ss-hero__pill-float ss-float ss-float--slow" aria-hidden="true">
                  <span className="ss-ic">🔔</span>
                  <span>طلب جديد وصل!</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function Problem({ content }: { content: AnyRecord }) {
  const items = listValue(content.items)
  return (
    <section className="ss-section ss-problem" id="problem">
      <div className="ss-container">
        <SsSectionHead {...content} />
        <div className="ss-problem__grid">
          {items.map((item, index) => (
            <div className="ss-pain ss-reveal" data-delay={index % 3} key={index}>
              <span className="ss-pain__ic">—</span>
              <span className="ss-pain__t">{stringValue(item)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// أرقام سمسم الأربعة كما في src/components/landing/Benefits.jsx بالموقع القديم — نص ثابت غير
// مرتبط بـCMS (نفس حال النسخة القديمة)، يُعرض بدلاً من عمود فارغ حين لا توجد صورة CMS لهذا القسم.
const BENEFIT_STATS = [
  { value: 'دقائق', label: 'تنشئ منيوك كاملاً', accent: true },
  { value: '0 ﷼', label: 'للبدء بدون بطاقة', accent: false },
  { value: 'QR', label: 'جاهز للطباعة فوراً', accent: false },
  { value: '24/7', label: 'منيوك متاح دائماً', accent: true },
]

function Benefits({ content }: { content: AnyRecord }) {
  const hasImage = Boolean(stringValue(content.imageUrl))
  const items = listValue(content.items)
  return (
    <section className="ss-section" id="benefits">
      <div className="ss-container ss-value__wrap">
        <div className="ss-value__copy ss-reveal">
          {stringValue(content.eyebrow) && <span className="ss-eyebrow">{stringValue(content.eyebrow)}</span>}
          <h2>{stringValue(content.heading)}</h2>
          {stringValue(content.description) && <p>{stringValue(content.description)}</p>}
          <ul className="ss-value__list">
            {items.map((item, index) => (
              <li className="ss-value__row" key={index}>
                <span className="ss-value__check">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                {stringValue(item)}
              </li>
            ))}
          </ul>
        </div>
        {hasImage ? (
          <SectionImage src={content.imageUrl} alt={content.imageAlt} />
        ) : (
          <div className="ss-value__cards ss-reveal" data-delay="1">
            {BENEFIT_STATS.map((stat) => (
              <div className={`ss-value__card${stat.accent ? ' ss-value__card--accent' : ''}`} key={stat.value}>
                <div className="ss-num">{stat.value}</div>
                <div className="ss-lbl">{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function Steps({ content }: { content: AnyRecord }) {
  const steps = listValue(content.steps)
  return (
    <section id="how-it-works" className="ss-section">
      <div className="ss-container">
        <SsSectionHead {...content} />
        <div className="ss-steps">
          {steps.map((item, index) => {
            const step = recordValue(item)
            return (
              <div className="ss-step ss-reveal" data-delay={index} key={index}>
                <div className="ss-step__num">{stringValue(step.number, String(index + 1))}</div>
                <h3 className="ss-step__t">{stringValue(step.title)}</h3>
                <p className="ss-step__d">{stringValue(step.description)}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

async function MenuPreview({ content }: { content: AnyRecord }) {
  const hasImage = Boolean(stringValue(content.imageUrl))
  // نفس فكرة Hero: لا صورة CMS لهذا القسم حالياً، فبدلاً من عمود فارغ نعرض معاينة تفاعلية حقيقية
  // (بلا أي كتابة بيانات) لمنيو مطعم العرض التجريبي — نسخة عميل خفيف من InteractiveDemo القديم.
  const demo = hasImage ? null : await getDemoMenu()
  const points = listValue(content.points).map((item) => stringValue(item))
  const pointsList = (
    <ul className="ss-preview__points">
      {points.map((point, index) => <li className="ss-preview__point" key={index}><span className="ss-ic">✓</span><p>{point}</p></li>)}
    </ul>
  )
  return (
    <section className="ss-section ss-preview" id="menu-preview">
      <div className="ss-container">
        <SsSectionHead {...content} />
        <div className="ss-preview__wrap">
          {demo ? (
            <MenuPreviewInteractive data={demo} points={points} />
          ) : (
            <>
              <div className="ss-preview__phone ss-reveal">{hasImage && <SectionImage src={content.imageUrl} alt={content.imageAlt} className="marketing-image preview-media" />}</div>
              <div className="ss-reveal" data-delay="1">
                {pointsList}
                <div className="ss-preview__cta ss-reveal"><a href={appUrl('/register')} className="ss-btn ss-btn--primary ss-btn--lg">أنشئ منيو مطعمك مجاناً 🚀</a></div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function Features({ content, isFirstOfType }: { content: AnyRecord; isFirstOfType?: boolean }) {
  const items = listValue(content.items)
  return (
    <section id={isFirstOfType === false ? undefined : 'features'} className="ss-section ss-problem">
      <div className="ss-container">
        <SsSectionHead {...content} />
        <div className={`ss-feat-group ss-reveal${isFirstOfType === false ? ' ss-feat-group--growth' : ''}`}>
          <span className={`ss-feat-group__label${isFirstOfType === false ? ' ss-feat-group__label--growth' : ''}`}>{stringValue(content.eyebrow) || 'المزايا'}</span>
        </div>
        <div className="ss-features__grid">
          {items.map((item, index) => {
            const feature = recordValue(item)
            return (
              <div className={`ss-feature${isFirstOfType === false ? ' ss-feature--growth' : ''} ss-reveal`} data-delay={index % 3} key={index}>
                <div className="ss-feature__ic">{stringValue(feature.icon, '✦')}</div>
                <h3 className="ss-feature__t">{stringValue(feature.title)}</h3>
                <p className="ss-feature__d">{stringValue(feature.description)}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function Trust({ content }: { content: AnyRecord }) {
  const items = listValue(content.items)
  return (
    <section className="ss-section ss-section--tight ss-trust" id="trust">
      <div className="ss-container">
        <SsSectionHead {...content} />
        <div className="ss-trust__chips ss-reveal">
          {items.map((item, index) => <span className="ss-trust__chip" key={index}>{stringValue(item)}</span>)}
        </div>
      </div>
    </section>
  )
}

function Pricing({ content, plans = [] }: { content: AnyRecord; plans?: PublicPlan[] }) {
  const hidden = new Set(listValue(content.hiddenPlanIds).map(String))
  const order = listValue(content.planOrder).map(String)
  const badges = recordValue(content.badges) as Record<string, string>
  const listed = plans.filter((plan) => !hidden.has(plan.id)).sort((left, right) => {
    const a = order.indexOf(left.id); const b = order.indexOf(right.id)
    return (a < 0 ? Number.MAX_SAFE_INTEGER : a) - (b < 0 ? Number.MAX_SAFE_INTEGER : b) || left.sortOrder - right.sortOrder
  })
  const primaryCta = recordValue(content.primaryCta)
  return (
    <section id="pricing" className="ss-section">
      <div className="ss-container">
        <SsSectionHead {...content} />
        {listed.length ? (
          <PricingGrid
            plans={listed}
            badges={badges}
            cta={{
              label: stringValue(primaryCta.label, 'ابدأ الآن'),
              href: stringValue(primaryCta.href, '/register'),
              trackingId: stringValue(primaryCta.trackingId),
            }}
          />
        ) : (
          <div className="ss-pricing__empty">
            <strong>{stringValue(content.emptyHeading, 'ستُعلن الباقات قريبًا.')}</strong>
            <p>{stringValue(content.emptyDescription, 'لا تظهر الباقات قبل تفعيلها في إعدادات الفوترة.')}</p>
          </div>
        )}
      </div>
    </section>
  )
}

function Faq({ content }: { content: AnyRecord }) {
  const items = listValue(content.items).map((item) => {
    const faq = recordValue(item)
    return { question: stringValue(faq.question), answer: stringValue(faq.answer) }
  })
  return (
    <section className="ss-section ss-problem" id="faq">
      <div className="ss-container">
        <SsSectionHead {...content} />
        <FaqAccordion items={items} />
      </div>
    </section>
  )
}

function FinalCta({ content }: { content: AnyRecord }) {
  return (
    <section className="ss-final" id="final-cta">
      <div className="ss-container">
        <div className="ss-final__box ss-reveal">
          {stringValue(content.imageUrl) && <SectionImage src={content.imageUrl} alt={content.heading} />}
          <h2>{stringValue(content.heading)}</h2>
          <p>{stringValue(content.description)}</p>
          <SsCta cta={content.primaryCta} />
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------
// Section types outside the old-site migration scope — unchanged.
// ---------------------------------------------------------------------
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
