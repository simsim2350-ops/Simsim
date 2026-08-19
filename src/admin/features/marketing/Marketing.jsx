import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import AdminShell from '../../AdminShell'
import { ACCENT, BORDER, MUTED } from '../../theme'
import Button from '../../components/ui/Button'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { SkeletonRows } from '../../components/ui/Skeleton'
import {
  createMarketingDraft,
  createMarketingPreviewToken,
  getMarketingRevision,
  listMarketingPages,
  publishMarketingRevision,
  saveMarketingDraft,
  scheduleMarketingRevision,
  listMarketingMedia,
  uploadMarketingMedia,
} from './marketingApi'

const CARD = '#12141C'
const SECTION_TYPES = ['HERO', 'PROBLEM', 'BENEFITS', 'STEPS', 'MENU_PREVIEW', 'FEATURES', 'TRUST', 'PRICING', 'FAQ', 'CTA']
const EMPTY_CONTENT = {
  HERO: { heading: '', description: '', primaryCta: { label: '', href: '/register', trackingId: 'new-hero-cta' } },
  PROBLEM: { heading: '', items: [] }, BENEFITS: { heading: '', items: [] }, STEPS: { heading: '', steps: [] },
  MENU_PREVIEW: { heading: '', points: [] }, FEATURES: { heading: '', items: [] }, TRUST: { heading: '', items: [] },
  PRICING: { heading: '', source: 'plans' }, FAQ: { heading: '', items: [] }, CTA: { heading: '', primaryCta: { label: '', href: '/register', trackingId: 'new-cta' } },
}

const parseDateTime = (value) => value ? new Date(value).toISOString().slice(0, 16) : ''

function SectionEditor({ section, index, total, onChange, onMove, onDelete }) {
  const [raw, setRaw] = useState(() => JSON.stringify(section.content || {}, null, 2))
  const [invalid, setInvalid] = useState('')
  useEffect(() => { setRaw(JSON.stringify(section.content || {}, null, 2)); setInvalid('') }, [section.id])
  const commit = () => {
    try {
      const content = JSON.parse(raw)
      if (!content || Array.isArray(content) || typeof content !== 'object') throw new Error('يجب أن يكون المحتوى كائناً JSON')
      onChange({ ...section, content }); setInvalid('')
    } catch (error) { setInvalid(error.message || 'JSON غير صالح') }
  }
  return <article style={{ background: '#0D0F15', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 13 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
      <strong style={{ color: 'white', fontSize: 13 }}>{section.type}</strong>
      <span style={{ color: MUTED, fontSize: 11 }}>القسم {index + 1}</span>
      <label style={{ marginRight: 'auto', color: '#D1D5DB', fontSize: 12, cursor: 'pointer' }}><input type="checkbox" checked={section.isVisible !== false} onChange={(e) => onChange({ ...section, isVisible: e.target.checked })} style={{ accentColor: ACCENT, marginLeft: 6 }} /> ظاهر</label>
      <Button variant="neutral" disabled={index === 0} onClick={() => onMove(index, -1)}>↑</Button>
      <Button variant="neutral" disabled={index === total - 1} onClick={() => onMove(index, 1)}>↓</Button>
      <Button variant="danger" onClick={onDelete}>حذف</Button>
    </div>
    <textarea className="admin-textarea" dir="ltr" value={raw} onChange={(e) => setRaw(e.target.value)} onBlur={commit} style={{ minHeight: 158, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, lineHeight: 1.55, resize: 'vertical' }} aria-label={`محتوى قسم ${section.type}`} />
    {invalid && <div style={{ color: '#F87171', fontSize: 11, marginTop: 6 }}>{invalid}</div>}
  </article>
}

export default function Marketing() {
  const [locale, setLocale] = useState('ar')
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [scheduleAt, setScheduleAt] = useState('')
  const [media, setMedia] = useState([])
  const [mediaBusy, setMediaBusy] = useState(false)

  const load = () => {
    setLoading(true); setError(null)
    listMarketingPages(locale).then(setRows).catch((e) => setError(e?.message || 'تعذر تحميل صفحات الموقع')).finally(() => setLoading(false))
  }
  useEffect(() => { load(); setSelected(null); setDraft(null); listMarketingMedia().then(setMedia).catch(() => setMedia([])) }, [locale])

  const openEditor = async (page) => {
    setBusy(true)
    try {
      const draftId = await createMarketingDraft(page.id, locale)
      const value = await getMarketingRevision(draftId)
      if (!value) throw new Error('تعذّر تحميل المسودة')
      setSelected(page); setDraft({ ...value, sections: [...(value.sections || [])].sort((a, b) => a.sortOrder - b.sortOrder) })
    } catch (e) { toast.error(e?.message || 'تعذّر إنشاء المسودة') } finally { setBusy(false) }
  }

  const updateSection = (index, next) => setDraft((current) => ({ ...current, sections: current.sections.map((section, position) => position === index ? next : section) }))
  const moveSection = (index, delta) => setDraft((current) => {
    const sections = [...current.sections]; const target = index + delta
    if (target < 0 || target >= sections.length) return current
    ;[sections[index], sections[target]] = [sections[target], sections[index]]
    return { ...current, sections: sections.map((section, position) => ({ ...section, sortOrder: position })) }
  })
  const addSection = (type) => setDraft((current) => ({ ...current, sections: [...current.sections, { id: `new-${Date.now()}`, type, content: EMPTY_CONTENT[type], settings: {}, analyticsId: '', sortOrder: current.sections.length, isVisible: true }] }))
  const removeSection = (index) => setDraft((current) => ({ ...current, sections: current.sections.filter((_, position) => position !== index).map((section, position) => ({ ...section, sortOrder: position })) }))

  const prepareDraft = () => ({ ...draft, sections: draft.sections.map((section, index) => ({ ...section, sortOrder: index, id: String(section.id).startsWith('new-') ? undefined : section.id })) })
  const save = async () => {
    if (!draft?.title?.trim()) { toast.error('عنوان الصفحة مطلوب'); return false }
    setBusy(true)
    try { await saveMarketingDraft(prepareDraft()); toast.success('حُفظت المسودة'); load(); return true }
    catch (e) { toast.error(e?.message || 'فشل حفظ المسودة'); return false } finally { setBusy(false) }
  }
  const publish = async () => {
    const saved = await save()
    if (!saved) return
    setBusy(true)
    try { await publishMarketingRevision(draft.id); toast.success('نُشرت المراجعة'); load() }
    catch (e) { toast.error(e?.message || 'فشل النشر') } finally { setBusy(false) }
  }
  const schedule = async () => {
    if (!scheduleAt) return toast.error('اختر موعد النشر')
    const saved = await save()
    if (!saved) return
    setBusy(true)
    try { await scheduleMarketingRevision(draft.id, new Date(scheduleAt).toISOString()); toast.success('جُدول النشر'); load() }
    catch (e) { toast.error(e?.message || 'فشل جدولة النشر') } finally { setBusy(false) }
  }
  const uploadMedia = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return toast.error('اختر صورة حتى 10 MB')
    setMediaBusy(true)
    try {
      const asset = await uploadMarketingMedia(file)
      setMedia((current) => [asset, ...current])
      toast.success('رُفعت الصورة ويمكن نسخ رابطها إلى محتوى القسم.')
    } catch (e) { toast.error(e?.message || 'فشل رفع الصورة') } finally { setMediaBusy(false); event.target.value = '' }
  }

  const preview = async () => {
    setBusy(true)
    try {
      const token = await createMarketingPreviewToken(draft.id)
      const previewBase = import.meta.env.VITE_MARKETING_SITE_URL || 'http://localhost:3000'
      const url = `${previewBase.replace(/\/$/, '')}/preview?token=${encodeURIComponent(token)}`
      await navigator.clipboard?.writeText(url)
      toast.success('نُسخ رابط المعاينة (صالح لمدة 30 دقيقة).')
    } catch (e) { toast.error(e?.message || 'فشل إنشاء رمز المعاينة') } finally { setBusy(false) }
  }

  const description = useMemo(() => locale === 'ar' ? 'تحرير الموقع التسويقي المنشور عبر مسودات وإصدارات منفصلة. الأسعار تُقرأ من سجل الفوترة ولا تُحرر من هنا.' : 'Marketing CMS', [locale])
  return <AdminShell active="marketing" title="إدارة الموقع التسويقي">
    <div style={{ padding: 20, maxWidth: 1260, margin: '0 auto' }}>
      <p style={{ margin: '0 0 16px', color: MUTED, fontSize: 12.5, lineHeight: 1.7 }}>{description}</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['ar', 'العربية'], ['en', 'English']].map(([code, label]) => <Button key={code} variant={locale === code ? 'primary' : 'neutral'} onClick={() => setLocale(code)}>{label}</Button>)}
      </div>
      <section style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 13, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: media.length ? 12 : 0 }}><strong style={{ color: 'white', fontSize: 13 }}>مكتبة الوسائط</strong><label style={{ marginRight: 'auto', color: '#FFB27F', fontSize: 12, fontWeight: 800, cursor: mediaBusy ? 'wait' : 'pointer' }}><input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml" onChange={uploadMedia} disabled={mediaBusy} style={{ display: 'none' }} />{mediaBusy ? 'جارٍ الرفع…' : '+ ارفع صورة'}</label></div>
        {media.length > 0 && <div style={{ display: 'flex', gap: 9, overflowX: 'auto', paddingBottom: 2 }}>{media.slice(0, 12).map((asset) => { const url = asset.metadata?.publicUrl || `${import.meta.env.VITE_SUPABASE_URL || ''}/storage/v1/object/public/${asset.bucket}/${asset.object_path}`; return <button key={asset.id} type="button" title="انسخ الرابط" onClick={() => { void navigator.clipboard?.writeText(url); toast.success('نُسخ رابط الصورة') }} style={{ flex: '0 0 auto', width: 78, height: 78, padding: 0, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', background: '#0B0B0F', cursor: 'pointer' }}><img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></button> })}</div>}
      </section>
      {loading ? <SkeletonRows count={3} /> : error ? <ErrorState msg={error} onRetry={load} /> : rows.length === 0 ? <EmptyState msg="لا توجد صفحات تسويقية لهذا النطاق اللغوي." /> : (
        <div style={{ display: 'grid', gridTemplateColumns: draft ? 'minmax(230px, .32fr) minmax(0, 1fr)' : '1fr', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            {rows.map((page) => <article key={page.id} style={{ background: CARD, border: `1px solid ${selected?.id === page.id ? ACCENT : BORDER}`, borderRadius: 13, padding: 14 }}>
              <strong style={{ display: 'block', color: 'white', fontSize: 14 }}>{page.draftTitle || page.publishedTitle || page.slug}</strong>
              <span style={{ display: 'block', color: MUTED, fontSize: 11, margin: '4px 0 12px' }}>/{page.slug} · {page.publishedRevisionId ? 'منشورة' : 'غير منشورة'}</span>
              <Button variant="neutral" disabled={busy} onClick={() => openEditor(page)}>تحرير مسودة</Button>
            </article>)}
          </div>
          {draft && <section style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 15, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 15 }}>
              <strong style={{ color: 'white', fontSize: 15 }}>مسودة: {selected?.slug}</strong><span style={{ color: '#FFB27F', fontSize: 11 }}>إصدار #{draft.revisionNumber}</span>
              <div style={{ marginRight: 'auto', display: 'flex', gap: 7, flexWrap: 'wrap' }}><Button variant="neutral" disabled={busy} onClick={preview}>معاينة</Button><Button variant="neutral" disabled={busy} onClick={save}>حفظ</Button><Button variant="primary" disabled={busy} onClick={publish}>نشر الآن</Button></div>
            </div>
            <label style={{ display: 'block', color: '#D1D5DB', fontSize: 12, marginBottom: 6 }}>عنوان الصفحة</label><input className="admin-input" value={draft.title || ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <label style={{ display: 'block', color: '#D1D5DB', fontSize: 12, margin: '13px 0 6px' }}>وصف SEO</label><textarea className="admin-textarea" value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} style={{ minHeight: 64, resize: 'vertical' }} />
            <label style={{ display: 'block', color: '#D1D5DB', fontSize: 12, margin: '13px 0 6px' }}>SEO (JSON)</label><textarea className="admin-textarea" dir="ltr" value={JSON.stringify(draft.seo || {}, null, 2)} onChange={(e) => { try { setDraft({ ...draft, seo: JSON.parse(e.target.value) }) } catch {} }} style={{ minHeight: 125, fontFamily: 'ui-monospace,monospace', fontSize: 11.5, resize: 'vertical' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '20px 0 10px' }}><strong style={{ color: 'white', fontSize: 14 }}>الأقسام</strong><select className="admin-input" value="" onChange={(e) => { if (e.target.value) addSection(e.target.value); e.target.value = '' }} style={{ width: 190, marginRight: 'auto' }}><option value="">+ أضف قسماً</option>{SECTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
            <div style={{ display: 'grid', gap: 10 }}>{draft.sections.map((section, index) => <SectionEditor key={section.id} section={section} index={index} total={draft.sections.length} onChange={(next) => updateSection(index, next)} onMove={moveSection} onDelete={() => removeSection(index)} />)}</div>
            <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 18, paddingTop: 16, display: 'flex', alignItems: 'end', gap: 9, flexWrap: 'wrap' }}><label style={{ color: '#D1D5DB', fontSize: 12 }}>جدولة النشر<input type="datetime-local" className="admin-input" value={scheduleAt || parseDateTime(draft.scheduledFor)} onChange={(e) => setScheduleAt(e.target.value)} style={{ display: 'block', marginTop: 5, width: 210 }} /></label><Button variant="neutral" disabled={busy} onClick={schedule}>جدولة</Button><span style={{ color: MUTED, fontSize: 11 }}>لا يظهر أي تعديل للعامة قبل النشر أو حلول الموعد المجدول.</span></div>
          </section>}
        </div>
      )}
    </div>
  </AdminShell>
}
