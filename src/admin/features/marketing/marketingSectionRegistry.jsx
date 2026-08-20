import { z } from 'zod'

const href = z.string().trim().min(1).max(500).refine((value) => value.startsWith('/') || value.startsWith('#') || /^https?:\/\//i.test(value) || /^mailto:|^tel:/i.test(value), 'رابط غير صالح')
const text = (max = 180) => z.string().trim().min(1, 'الحقل مطلوب').max(max)
const optional = (max = 360) => z.string().trim().max(max).optional().or(z.literal(''))
const cta = z.object({ label: text(80), href, trackingId: z.string().trim().max(62).optional().or(z.literal('')) })
const heading = text(120)
const basic = { eyebrow: optional(90), heading, description: optional(600) }

export const SECTION_TYPES = ['HERO', 'PROBLEM', 'BENEFITS', 'STEPS', 'MENU_PREVIEW', 'FEATURES', 'TRUST', 'PRICING', 'FAQ', 'CTA', 'VIDEO', 'IMAGE_TEXT', 'TESTIMONIALS', 'STATS', 'LOGOS', 'COMPARISON', 'CONTACT']

export const EMPTY_CONTENT = {
  HERO: { heading: '', description: '', primaryCta: { label: '', href: '/register', trackingId: 'hero-cta' }, secondaryCta: { label: '', href: '/login', trackingId: 'hero-secondary' }, proof: '', imageUrl: '', imageAlt: '' },
  PROBLEM: { heading: '', description: '', items: [''] }, BENEFITS: { heading: '', description: '', items: [''], imageUrl: '', imageAlt: '' },
  STEPS: { heading: '', steps: [{ number: '1', title: '', description: '' }] }, MENU_PREVIEW: { heading: '', description: '', points: [''], imageUrl: '', imageAlt: '' },
  FEATURES: { heading: '', description: '', items: [{ title: '', description: '', icon: '' }] }, TRUST: { heading: '', description: '', items: [''] },
  PRICING: { heading: '', description: '', source: 'plans', planOrder: [], hiddenPlanIds: [], badges: {}, primaryCta: { label: 'ابدأ الآن', href: '/register', trackingId: 'pricing-cta' } },
  FAQ: { heading: '', description: '', items: [{ question: '', answer: '' }] }, CTA: { heading: '', description: '', primaryCta: { label: '', href: '/register', trackingId: 'final-cta' }, imageUrl: '' },
  VIDEO: { heading: '', description: '', videoUrl: '', posterUrl: '', caption: '', primaryCta: { label: '', href: '/register', trackingId: 'video-cta' } },
  IMAGE_TEXT: { heading: '', description: '', imageUrl: '', imageAlt: '', imagePosition: 'end', primaryCta: { label: '', href: '/register', trackingId: 'image-text-cta' } },
  TESTIMONIALS: { heading: '', description: '', items: [{ quote: '', name: '', role: '', avatarUrl: '' }] }, STATS: { heading: '', description: '', items: [{ value: '', label: '', description: '' }] },
  LOGOS: { heading: '', description: '', items: [{ name: '', logoUrl: '', href: '' }] }, COMPARISON: { heading: '', description: '', columns: ['الميزة', 'سمسم'], rows: [{ label: '', values: [''] }] },
  CONTACT: { heading: '', description: '', email: '', phone: '', address: '', primaryCta: { label: '', href: '/register', trackingId: 'contact-cta' } },
}

export const sectionSchemas = {
  HERO: z.object({ ...basic, description: text(360), primaryCta: cta, secondaryCta: cta.optional(), proof: optional(160), imageUrl: optional(500), imageAlt: optional(180) }),
  PROBLEM: z.object({ ...basic, items: z.array(text()).min(1).max(8) }), BENEFITS: z.object({ ...basic, items: z.array(text()).min(1).max(10), imageUrl: optional(500), imageAlt: optional(180) }),
  STEPS: z.object({ eyebrow: optional(90), heading, steps: z.array(z.object({ number: text(8), title: text(100), description: text(240) })).min(1).max(6) }),
  MENU_PREVIEW: z.object({ ...basic, points: z.array(text()).min(1).max(6), imageUrl: optional(500), imageAlt: optional(180) }),
  FEATURES: z.object({ ...basic, items: z.array(z.object({ title: text(100), description: text(240), icon: optional(40) })).min(1).max(18) }), TRUST: z.object({ ...basic, items: z.array(text()).min(1).max(12) }),
  PRICING: z.object({ ...basic, source: z.literal('plans'), planOrder: z.array(z.string()).optional(), hiddenPlanIds: z.array(z.string()).optional(), badges: z.record(z.string()).optional(), primaryCta: cta.optional() }),
  FAQ: z.object({ ...basic, items: z.array(z.object({ question: text(180), answer: text(1200) })).min(1).max(20) }), CTA: z.object({ ...basic, primaryCta: cta, imageUrl: optional(500) }),
  VIDEO: z.object({ ...basic, videoUrl: href, posterUrl: optional(500), caption: optional(240), primaryCta: cta.optional() }), IMAGE_TEXT: z.object({ ...basic, description: text(600), imageUrl: href, imageAlt: text(180), imagePosition: z.enum(['start', 'end']), primaryCta: cta.optional() }),
  TESTIMONIALS: z.object({ ...basic, items: z.array(z.object({ quote: text(600), name: text(120), role: optional(140), avatarUrl: optional(500) })).min(1).max(12) }), STATS: z.object({ ...basic, items: z.array(z.object({ value: text(32), label: text(100), description: optional(160) })).min(1).max(8) }),
  LOGOS: z.object({ ...basic, items: z.array(z.object({ name: text(100), logoUrl: href, href: optional(500) })).min(1).max(24) }), COMPARISON: z.object({ ...basic, columns: z.array(text(80)).min(2).max(5), rows: z.array(z.object({ label: text(120), values: z.array(z.union([z.boolean(), text(120)])).min(1).max(5) })).min(1).max(20) }),
  CONTACT: z.object({ ...basic, email: z.string().trim().email().optional().or(z.literal('')), phone: optional(60), address: optional(300), primaryCta: cta.optional() }),
}

export function validateSection(type, content) {
  return sectionSchemas[type]?.safeParse(content) || { success: false, error: { issues: [{ message: 'نوع قسم غير مدعوم' }] } }
}

const inputStyle = { width: '100%', marginTop: 4 }
function Field({ label, value, onChange, multiline = false, type = 'text', placeholder = '' }) {
  const Tag = multiline ? 'textarea' : 'input'
  return <label style={{ display: 'block', color: '#D1D5DB', fontSize: 12, marginTop: 9 }}>{label}<Tag className={multiline ? 'admin-textarea' : 'admin-input'} type={multiline ? undefined : type} value={value || ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} style={{ ...inputStyle, minHeight: multiline ? 78 : undefined, resize: multiline ? 'vertical' : undefined }} /></label>
}

function CtaFields({ value = {}, onChange, title = 'CTA' }) {
  const update = (key, next) => onChange({ ...value, [key]: next })
  return <fieldset style={{ border: '1px solid #323643', borderRadius: 9, marginTop: 12, padding: '4px 10px 10px' }}><legend style={{ color: '#FFB27F', fontSize: 11 }}>{title}</legend><Field label="النص" value={value.label} onChange={(next) => update('label', next)} /><Field label="الرابط" value={value.href} onChange={(next) => update('href', next)} placeholder="/register أو https://…" /><Field label="معرف القياس" value={value.trackingId} onChange={(next) => update('trackingId', next)} /></fieldset>
}

function TextList({ label, values = [], onChange }) {
  const update = (index, next) => onChange(values.map((item, position) => position === index ? next : item))
  return <section style={{ marginTop: 12 }}><strong style={{ color: 'white', fontSize: 12 }}>{label}</strong>{values.map((item, index) => <div key={index} style={{ display: 'flex', gap: 6, alignItems: 'end' }}><div style={{ flex: 1 }}><Field label={`عنصر ${index + 1}`} value={item} onChange={(next) => update(index, next)} /></div><button type="button" onClick={() => onChange(values.filter((_, position) => position !== index))} style={{ marginBottom: 3 }}>×</button></div>)}<button type="button" onClick={() => onChange([...values, ''])} style={{ marginTop: 8 }}>+ إضافة</button></section>
}

const LIST_FIELDS = {
  STEPS: [['number', 'الرقم'], ['title', 'العنوان'], ['description', 'الوصف']], FEATURES: [['title', 'العنوان'], ['description', 'الوصف'], ['icon', 'الرمز']], FAQ: [['question', 'السؤال'], ['answer', 'الإجابة']],
  TESTIMONIALS: [['quote', 'النص'], ['name', 'الاسم'], ['role', 'الدور'], ['avatarUrl', 'رابط الصورة']], STATS: [['value', 'القيمة'], ['label', 'التسمية'], ['description', 'الوصف']], LOGOS: [['name', 'الاسم'], ['logoUrl', 'رابط الشعار'], ['href', 'الرابط']],
  COMPARISON: [['label', 'الميزة'], ['values', 'القيم مفصولة بفاصلة']],
}

function ObjectList({ type, label, values = [], onChange }) {
  const fields = LIST_FIELDS[type] || []
  const update = (index, key, next) => onChange(values.map((item, position) => {
    if (position !== index) return item
    return { ...item, [key]: key === 'values' ? next.split(',').map((value) => value.trim()) : next }
  }))
  const blank = Object.fromEntries(fields.map(([key]) => [key, key === 'values' ? [''] : '']))
  return <section style={{ marginTop: 12 }}><strong style={{ color: 'white', fontSize: 12 }}>{label}</strong>{values.map((item, index) => <article key={index} style={{ padding: 10, marginTop: 8, background: '#161923', borderRadius: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: MUTED, fontSize: 11 }}>عنصر {index + 1}</span><button type="button" onClick={() => onChange(values.filter((_, position) => position !== index))}>حذف</button></div>{fields.map(([key, fieldLabel]) => <Field key={key} label={fieldLabel} multiline={['description', 'answer', 'quote'].includes(key)} value={Array.isArray(item[key]) ? item[key].join(', ') : item[key]} onChange={(next) => update(index, key, next)} />)}</article>)}<button type="button" onClick={() => onChange([...values, blank])} style={{ marginTop: 8 }}>+ إضافة</button></section>
}

export function TypedSectionFields({ type, content, onChange }) {
  const value = content || {}
  const update = (key, next) => onChange({ ...value, [key]: next })
  const has = (...types) => types.includes(type)
  const simpleWithImage = has('HERO', 'BENEFITS', 'MENU_PREVIEW', 'CTA', 'IMAGE_TEXT')
  return <div>
    {!has('PRICING') && <Field label="العنوان الصغير" value={value.eyebrow} onChange={(next) => update('eyebrow', next)} />}
    <Field label="العنوان" value={value.heading} onChange={(next) => update('heading', next)} />
    {(!has('STEPS') && !has('TRUST')) && <Field label="الوصف" multiline value={value.description} onChange={(next) => update('description', next)} />}
    {simpleWithImage && <><Field label="رابط الصورة" value={value.imageUrl} onChange={(next) => update('imageUrl', next)} /><Field label="النص البديل للصورة" value={value.imageAlt} onChange={(next) => update('imageAlt', next)} /></>}
    {has('HERO') && <><Field label="إثبات/ملاحظة" value={value.proof} onChange={(next) => update('proof', next)} /><CtaFields value={value.primaryCta} onChange={(next) => update('primaryCta', next)} title="CTA الرئيسي" /><CtaFields value={value.secondaryCta} onChange={(next) => update('secondaryCta', next)} title="CTA الثانوي" /></>}
    {has('PROBLEM', 'BENEFITS', 'TRUST') && <TextList label="العناصر" values={value.items || []} onChange={(next) => update('items', next)} />}
    {has('MENU_PREVIEW') && <TextList label="نقاط المعاينة" values={value.points || []} onChange={(next) => update('points', next)} />}
    {has('STEPS', 'FEATURES', 'FAQ', 'TESTIMONIALS', 'STATS', 'LOGOS', 'COMPARISON') && <ObjectList type={type} label="العناصر" values={value.rows || value.items || []} onChange={(next) => update(type === 'COMPARISON' ? 'rows' : 'items', next)} />}
    {has('PRICING') && <><p style={{ color: MUTED, fontSize: 12 }}>الأسعار والمزايا تُقرأ من سجل الباقات المركزي. يمكنك التحكم بعرض القسم وCTA فقط.</p><CtaFields value={value.primaryCta} onChange={(next) => update('primaryCta', next)} /></>}
    {has('CTA', 'VIDEO', 'IMAGE_TEXT', 'CONTACT') && <CtaFields value={value.primaryCta} onChange={(next) => update('primaryCta', next)} />}
    {has('VIDEO') && <><Field label="رابط الفيديو" value={value.videoUrl} onChange={(next) => update('videoUrl', next)} /><Field label="رابط صورة الغلاف" value={value.posterUrl} onChange={(next) => update('posterUrl', next)} /><Field label="النص البديل" value={value.caption} onChange={(next) => update('caption', next)} /></>}
    {has('IMAGE_TEXT') && <label style={{ display: 'block', color: '#D1D5DB', fontSize: 12, marginTop: 9 }}>موضع الصورة<select className="admin-input" value={value.imagePosition || 'end'} onChange={(event) => update('imagePosition', event.target.value)} style={inputStyle}><option value="end">بعد النص</option><option value="start">قبل النص</option></select></label>}
    {has('COMPARISON') && <TextList label="عناوين الأعمدة" values={value.columns || []} onChange={(next) => update('columns', next)} />}
    {has('CONTACT') && <><Field label="البريد" type="email" value={value.email} onChange={(next) => update('email', next)} /><Field label="الهاتف" value={value.phone} onChange={(next) => update('phone', next)} /><Field label="العنوان" multiline value={value.address} onChange={(next) => update('address', next)} /></>}
  </div>
}
