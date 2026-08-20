import { useEffect, useState } from 'react'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { ACCENT, BORDER, MUTED } from '../../theme'
import Button from '../../components/ui/Button'
import { getMarketingSettings, openMarketingSettingsDraft, publishMarketingSettings, revalidateMarketing, saveMarketingSettings } from './marketingApi'

const DEFAULT_SETTINGS = {
  brandName: 'سمسم', logoPath: '/simsim-s.svg',
  navigation: [{ label: 'الرئيسية', href: '#hero' }],
  primaryCta: { label: 'ابدأ مجاناً', href: '/register', trackingId: 'nav-signup' }, secondaryCta: { label: 'تسجيل الدخول', href: '/login', trackingId: 'nav-login' },
  contact: { email: '', phone: '', address: '', social: [] },
  seo: { title: '', description: '', canonicalPath: '/', keywords: [] },
  footer: { description: '', navigation: [], legal: [], copyright: '' },
}

const linkSchema = z.object({ label: z.string().trim().min(1).max(80), href: z.string().trim().min(1).max(500) })
const settingsSchema = z.object({
  brandName: z.string().trim().min(1).max(80), logoPath: z.string().trim().min(1).max(500), navigation: z.array(linkSchema).max(10),
  primaryCta: z.object({ label: z.string().trim().min(1), href: z.string().trim().min(1), trackingId: z.string().optional() }), secondaryCta: z.object({ label: z.string().trim().min(1), href: z.string().trim().min(1), trackingId: z.string().optional() }),
  contact: z.object({ email: z.string().email().optional().or(z.literal('')), phone: z.string().max(60).optional(), address: z.string().max(300).optional(), social: z.array(linkSchema).max(12).optional() }).optional(),
  seo: z.object({ title: z.string().max(160), description: z.string().max(320), canonicalPath: z.string().max(500), keywords: z.array(z.string().max(80)).max(24) }).optional(),
  footer: z.object({ description: z.string().max(360), navigation: z.array(linkSchema).max(10), legal: z.array(linkSchema).max(10), copyright: z.string().max(180) }),
})

const inputStyle = { width: '100%', marginTop: 4 }
function Field({ label, value, onChange, multiline = false, type = 'text' }) { const Tag = multiline ? 'textarea' : 'input'; return <label style={{ display: 'block', color: '#D1D5DB', fontSize: 12, marginTop: 9 }}>{label}<Tag className={multiline ? 'admin-textarea' : 'admin-input'} type={multiline ? undefined : type} value={value || ''} onChange={(event) => onChange(event.target.value)} style={{ ...inputStyle, minHeight: multiline ? 74 : undefined, resize: multiline ? 'vertical' : undefined }} /></label> }
function LinkList({ title, value = [], onChange }) { const edit = (index, key, next) => onChange(value.map((item, position) => position === index ? { ...item, [key]: next } : item)); return <section style={{ marginTop: 14 }}><strong style={{ color: 'white', fontSize: 13 }}>{title}</strong>{value.map((item, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 7, marginTop: 7 }}><input className="admin-input" value={item.label || ''} placeholder="النص" onChange={(event) => edit(index, 'label', event.target.value)} /><input className="admin-input" value={item.href || ''} placeholder="الرابط" onChange={(event) => edit(index, 'href', event.target.value)} /><button type="button" onClick={() => onChange(value.filter((_, position) => position !== index))}>×</button></div>)}<button type="button" onClick={() => onChange([...value, { label: '', href: '' }])} style={{ marginTop: 7 }}>+ رابط</button></section> }
function CtaFields({ title, value, onChange }) { const update = (key, next) => onChange({ ...value, [key]: next }); return <fieldset style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: '3px 10px 10px', marginTop: 12 }}><legend style={{ color: '#FFB27F', fontSize: 11 }}>{title}</legend><Field label="النص" value={value?.label} onChange={(next) => update('label', next)} /><Field label="الرابط" value={value?.href} onChange={(next) => update('href', next)} /><Field label="معرف القياس" value={value?.trackingId} onChange={(next) => update('trackingId', next)} /></fieldset> }

export default function MarketingSettings({ locale }) {
  const [revision, setRevision] = useState(null)
  const [data, setData] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const load = async () => {
    setLoading(true)
    try { const id = await openMarketingSettingsDraft(locale); const value = await getMarketingSettings(locale); setRevision(value || { id }); setData({ ...DEFAULT_SETTINGS, ...(value?.data || {}), footer: { ...DEFAULT_SETTINGS.footer, ...(value?.data?.footer || {}) }, seo: { ...DEFAULT_SETTINGS.seo, ...(value?.data?.seo || {}) }, contact: { ...DEFAULT_SETTINGS.contact, ...(value?.data?.contact || {}) } }); setDirty(false) }
    catch (error) { toast.error(error?.message || 'تعذر تحميل إعدادات الموقع') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [locale])
  const update = (next) => { setData(next); setDirty(true) }
  const save = async () => {
    const parsed = settingsSchema.safeParse(data)
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message || 'تحقق من الإعدادات'); return false }
    setBusy(true)
    try { await saveMarketingSettings(revision.id, parsed.data); setDirty(false); toast.success('حُفظت مسودة الإعدادات'); return true } catch (error) { toast.error(error?.message || 'فشل حفظ الإعدادات'); return false } finally { setBusy(false) }
  }
  const publish = async () => {
    if (!window.confirm('نشر إعدادات الموقع العامة؟')) return
    const saved = await save(); if (!saved) return; setBusy(true)
    try { await publishMarketingSettings(revision.id); await revalidateMarketing({ kind: 'settings', locale }); toast.success('نُشرت إعدادات الموقع وأُبطل كاش الإعدادات الموجّه.') } catch (error) { toast.error(error?.message || 'فشل نشر الإعدادات') } finally { setBusy(false) }
  }
  if (loading) return <p style={{ color: MUTED }}>جارٍ تحميل إعدادات الموقع…</p>
  return <section style={{ background: '#12141C', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, maxWidth: 980 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><strong style={{ color: 'white' }}>الإعدادات العامة · {locale}</strong>{dirty && <span style={{ color: '#FCD34D', fontSize: 11 }}>تغييرات غير محفوظة</span>}<div style={{ marginRight: 'auto', display: 'flex', gap: 7 }}><Button variant="neutral" disabled={busy} onClick={save}>حفظ</Button><Button variant="primary" disabled={busy} onClick={publish}>نشر الإعدادات</Button></div></div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}><Field label="اسم العلامة" value={data.brandName} onChange={(next) => update({ ...data, brandName: next })} /><Field label="رابط الشعار" value={data.logoPath} onChange={(next) => update({ ...data, logoPath: next })} /></div>
    <CtaFields title="CTA الرئيسي" value={data.primaryCta} onChange={(next) => update({ ...data, primaryCta: next })} /><CtaFields title="CTA الثانوي" value={data.secondaryCta} onChange={(next) => update({ ...data, secondaryCta: next })} />
    <LinkList title="تنقل الرأس" value={data.navigation} onChange={(next) => update({ ...data, navigation: next })} />
    <section style={{ marginTop: 18, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}><strong style={{ color: 'white', fontSize: 13 }}>SEO عام</strong><Field label="العنوان الافتراضي" value={data.seo?.title} onChange={(next) => update({ ...data, seo: { ...data.seo, title: next } })} /><Field label="الوصف الافتراضي" multiline value={data.seo?.description} onChange={(next) => update({ ...data, seo: { ...data.seo, description: next } })} /><Field label="Canonical path" value={data.seo?.canonicalPath} onChange={(next) => update({ ...data, seo: { ...data.seo, canonicalPath: next } })} /><Field label="Keywords (مفصولة بفاصلة)" value={(data.seo?.keywords || []).join(', ')} onChange={(next) => update({ ...data, seo: { ...data.seo, keywords: next.split(',').map((item) => item.trim()).filter(Boolean) } })} /></section>
    <section style={{ marginTop: 18, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}><strong style={{ color: 'white', fontSize: 13 }}>التذييل</strong><Field label="الوصف" multiline value={data.footer?.description} onChange={(next) => update({ ...data, footer: { ...data.footer, description: next } })} /><Field label="حقوق النشر" value={data.footer?.copyright} onChange={(next) => update({ ...data, footer: { ...data.footer, copyright: next } })} /><LinkList title="روابط التذييل" value={data.footer?.navigation || []} onChange={(next) => update({ ...data, footer: { ...data.footer, navigation: next } })} /><LinkList title="روابط قانونية" value={data.footer?.legal || []} onChange={(next) => update({ ...data, footer: { ...data.footer, legal: next } })} /></section>
    <section style={{ marginTop: 18, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}><strong style={{ color: 'white', fontSize: 13 }}>التواصل</strong><Field label="البريد" type="email" value={data.contact?.email} onChange={(next) => update({ ...data, contact: { ...data.contact, email: next } })} /><Field label="الهاتف" value={data.contact?.phone} onChange={(next) => update({ ...data, contact: { ...data.contact, phone: next } })} /><Field label="العنوان" multiline value={data.contact?.address} onChange={(next) => update({ ...data, contact: { ...data.contact, address: next } })} /><LinkList title="روابط التواصل" value={data.contact?.social || []} onChange={(next) => update({ ...data, contact: { ...data.contact, social: next } })} /></section>
  </section>
}
