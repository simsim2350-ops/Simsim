import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AdminShell from '../../AdminShell'
import { ACCENT, BORDER, MUTED } from '../../theme'
import Button from '../../components/ui/Button'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { SkeletonRows } from '../../components/ui/Skeleton'
import {
  archiveMarketingPage, createMarketingDraft, createMarketingPage, createMarketingPreviewToken, deleteMarketingPage, duplicateMarketingPage,
  getMarketingRevision, listMarketingPages, listMarketingRevisions, publishMarketingRevision, restoreMarketingPage, restoreMarketingRevision,
  revalidateMarketing, saveMarketingDraft, scheduleMarketingRevision, unpublishMarketingPage,
} from './marketingApi'
import { EMPTY_CONTENT, SECTION_TYPES, TypedSectionFields, validateSection } from './marketingSectionRegistry'
import MarketingSettings from './MarketingSettings'
import MarketingMediaLibrary from './MarketingMediaLibrary'

const CARD = '#12141C'
const buttonStyle = { background: 'transparent', color: '#D1D5DB', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '5px 8px', cursor: 'pointer', fontSize: 11 }
const parseDateTime = (value) => value ? new Date(value).toISOString().slice(0, 16) : ''
const clone = (value) => JSON.parse(JSON.stringify(value))

function SortableSectionCard({ section, index, total, onChange, onMove, onDuplicate, onDelete }) {
  const [expanded, setExpanded] = useState(index === 0)
  const [validation, setValidation] = useState('')
  const sortable = useSortable({ id: section.id })
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, opacity: sortable.isDragging ? 0.5 : 1 }
  const updateContent = (content) => {
    const result = validateSection(section.type, content)
    setValidation(result.success ? '' : result.error.issues[0]?.message || 'تحقق من الحقول')
    onChange({ ...section, content })
  }
  return <article ref={sortable.setNodeRef} style={{ ...style, background: '#0D0F15', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 13 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" {...sortable.attributes} {...sortable.listeners} aria-label="اسحب لترتيب القسم" title="اسحب لترتيب القسم" style={{ ...buttonStyle, cursor: 'grab' }}>⠿</button>
      <button type="button" onClick={() => setExpanded((value) => !value)} style={{ ...buttonStyle, color: 'white', fontWeight: 800 }}>{expanded ? '−' : '+'} {section.type}</button>
      <span style={{ color: MUTED, fontSize: 11 }}>القسم {index + 1}</span>
      <label style={{ marginRight: 'auto', color: '#D1D5DB', fontSize: 12, cursor: 'pointer' }}><input type="checkbox" checked={section.isVisible !== false} onChange={(event) => onChange({ ...section, isVisible: event.target.checked })} style={{ accentColor: ACCENT, marginLeft: 6 }} /> ظاهر</label>
      <button type="button" disabled={index === 0} onClick={() => onMove(index, -1)} style={buttonStyle}>↑</button>
      <button type="button" disabled={index === total - 1} onClick={() => onMove(index, 1)} style={buttonStyle}>↓</button>
      <button type="button" onClick={onDuplicate} style={buttonStyle}>نسخ</button>
      <button type="button" onClick={onDelete} style={{ ...buttonStyle, color: '#F87171' }}>حذف</button>
    </div>
    {expanded && <div style={{ marginTop: 10 }}><TypedSectionFields type={section.type} content={section.content || {}} onChange={updateContent} />{validation && <p style={{ color: '#FCA5A5', fontSize: 11, margin: '9px 0 0' }}>{validation}</p>}</div>}
  </article>
}

function RevisionList({ revisions, currentId, onRestore, busy }) {
  if (!revisions.length) return null
  return <section style={{ marginTop: 18, borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}><strong style={{ color: 'white', fontSize: 13 }}>الإصدارات</strong><div style={{ display: 'grid', gap: 7, marginTop: 9 }}>{revisions.map((revision) => <article key={revision.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 9, border: `1px solid ${revision.id === currentId ? ACCENT : BORDER}`, borderRadius: 9 }}><div style={{ flex: 1 }}><strong style={{ display: 'block', color: 'white', fontSize: 12 }}>#{revision.revisionNumber} · {revision.title}</strong><span style={{ color: MUTED, fontSize: 10 }}>{revision.status}{revision.publishedAt ? ` · ${new Date(revision.publishedAt).toLocaleString('ar-SA')}` : ''}</span></div><button type="button" disabled={busy || revision.id === currentId} onClick={() => onRestore(revision)} style={buttonStyle}>استعادة إلى مسودة</button></article>)}</div></section>
}

export default function Marketing() {
  const [locale, setLocale] = useState('ar')
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState(null)
  const [draft, setDraft] = useState(null)
  const [revisions, setRevisions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [scheduleAt, setScheduleAt] = useState('')
  const [dirty, setDirty] = useState(false)
  const [tab, setTab] = useState('pages')

  const load = () => {
    setLoading(true); setError(null)
    return listMarketingPages(locale).then(setRows).catch((reason) => setError(reason?.message || 'تعذر تحميل صفحات الموقع')).finally(() => setLoading(false))
  }
  useEffect(() => { load(); setSelected(null); setDraft(null); setRevisions([]); setDirty(false) }, [locale])
  useEffect(() => {
    const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const openEditor = async (page) => {
    if (dirty && !window.confirm('لديك تغييرات غير محفوظة. هل تريد ترك المسودة؟')) return
    setBusy(true)
    try {
      const draftId = await createMarketingDraft(page.id, locale)
      const [value, versionRows] = await Promise.all([getMarketingRevision(draftId), listMarketingRevisions(page.id, locale)])
      if (!value) throw new Error('تعذّر تحميل المسودة')
      setSelected(page); setDraft({ ...value, sections: [...(value.sections || [])].sort((a, b) => a.sortOrder - b.sortOrder) }); setRevisions(versionRows); setScheduleAt(parseDateTime(value.scheduledFor)); setDirty(false)
    } catch (reason) { toast.error(reason?.message || 'تعذّر إنشاء المسودة') } finally { setBusy(false) }
  }

  const updateDraft = (next) => { setDraft(next); setDirty(true) }
  const updateSection = (index, next) => updateDraft({ ...draft, sections: draft.sections.map((section, position) => position === index ? next : section) })
  const normalize = (sections) => sections.map((section, index) => ({ ...section, sortOrder: index }))
  const moveSection = (index, delta) => {
    const target = index + delta
    if (target < 0 || target >= draft.sections.length) return
    const sections = [...draft.sections]; [sections[index], sections[target]] = [sections[target], sections[index]]
    updateDraft({ ...draft, sections: normalize(sections) })
  }
  const dragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const oldIndex = draft.sections.findIndex((section) => section.id === active.id)
    const newIndex = draft.sections.findIndex((section) => section.id === over.id)
    updateDraft({ ...draft, sections: normalize(arrayMove(draft.sections, oldIndex, newIndex)) })
  }
  const addSection = (type) => updateDraft({ ...draft, sections: [...draft.sections, { id: `new-${crypto.randomUUID()}`, type, content: clone(EMPTY_CONTENT[type]), settings: {}, analyticsId: '', sortOrder: draft.sections.length, isVisible: true }] })
  const duplicateSection = (index) => {
    const source = draft.sections[index]
    const copy = { ...clone(source), id: `new-${crypto.randomUUID()}`, content: clone(source.content) }
    const sections = [...draft.sections]; sections.splice(index + 1, 0, copy)
    updateDraft({ ...draft, sections: normalize(sections) })
  }
  const removeSection = (index) => updateDraft({ ...draft, sections: normalize(draft.sections.filter((_, position) => position !== index)) })
  const prepareDraft = () => ({ ...draft, sections: normalize(draft.sections).map((section) => ({ ...section, id: String(section.id).startsWith('new-') ? undefined : section.id })) })

  const validateDraft = () => {
    if (!draft?.title?.trim()) return 'عنوان الصفحة مطلوب'
    for (const section of draft.sections) {
      const result = validateSection(section.type, section.content)
      if (!result.success) return `القسم ${section.type}: ${result.error.issues[0]?.message || 'بيانات غير صالحة'}`
    }
    return ''
  }
  const save = async () => {
    const invalid = validateDraft()
    if (invalid) { toast.error(invalid); return false }
    setBusy(true)
    try { await saveMarketingDraft(prepareDraft()); toast.success('حُفظت المسودة'); await load(); setDirty(false); return true }
    catch (reason) { toast.error(reason?.message || 'فشل حفظ المسودة'); return false } finally { setBusy(false) }
  }
  const publish = async () => {
    if (!window.confirm('سيظهر المحتوى المنشور للعامة بعد إبطال الكاش. هل تريد المتابعة؟')) return
    const saved = await save(); if (!saved) return
    setBusy(true)
    try { await publishMarketingRevision(draft.id); await revalidateMarketing({ kind: 'page', slug: selected.slug, locale }); toast.success('نُشرت المراجعة وأُبطل كاش الصفحة الموجّه.'); await openEditor(selected) }
    catch (reason) { toast.error(reason?.message || 'فشل النشر') } finally { setBusy(false) }
  }
  const schedule = async () => {
    if (!scheduleAt) return toast.error('اختر موعد النشر')
    const saved = await save(); if (!saved) return
    setBusy(true)
    try { await scheduleMarketingRevision(draft.id, new Date(scheduleAt).toISOString()); toast.success('جُدول النشر'); await openEditor(selected) }
    catch (reason) { toast.error(reason?.message || 'فشل جدولة النشر') } finally { setBusy(false) }
  }
  const preview = async () => {
    setBusy(true)
    try {
      const token = await createMarketingPreviewToken(draft.id)
      const previewBase = import.meta.env.VITE_MARKETING_SITE_URL || 'http://localhost:3000'
      const url = `${previewBase.replace(/\/$/, '')}/preview?token=${encodeURIComponent(token)}`
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url)
      else window.prompt('انسخ رابط المعاينة', url)
      toast.success('رابط المعاينة صالح لمدة 30 دقيقة.')
    } catch (reason) { toast.error(reason?.message || 'فشل إنشاء رمز المعاينة') } finally { setBusy(false) }
  }
  const restoreRevision = async (revision) => {
    if (!window.confirm(`استعادة الإصدار #${revision.revisionNumber} إلى مسودة جديدة؟`)) return
    setBusy(true)
    try { const draftId = await restoreMarketingRevision(revision.id); const value = await getMarketingRevision(draftId); setDraft({ ...value, sections: [...(value.sections || [])].sort((a, b) => a.sortOrder - b.sortOrder) }); setDirty(false); setRevisions(await listMarketingRevisions(selected.id, locale)); toast.success('أنشئت مسودة من الإصدار السابق') }
    catch (reason) { toast.error(reason?.message || 'فشل الاستعادة') } finally { setBusy(false) }
  }

  const createPage = async () => {
    const slug = window.prompt('Slug الصفحة (مثال: features)')?.trim().toLowerCase(); if (!slug) return
    const title = window.prompt('عنوان الصفحة')?.trim(); if (!title) return
    setBusy(true)
    try { const created = await createMarketingPage(slug, title, locale); await load(); const page = { id: created.pageId, slug: created.slug }; await openEditor(page); toast.success('أُنشئت صفحة جديدة كمسودة') }
    catch (reason) { toast.error(reason?.message || 'فشل إنشاء الصفحة') } finally { setBusy(false) }
  }
  const duplicatePage = async (page) => {
    const slug = window.prompt('Slug للنسخة الجديدة')?.trim().toLowerCase(); if (!slug) return
    setBusy(true)
    try { await duplicateMarketingPage(page.id, slug, locale); await load(); toast.success('أُنشئت نسخة كمسودة') } catch (reason) { toast.error(reason?.message || 'فشل نسخ الصفحة') } finally { setBusy(false) }
  }
  const pageAction = async (action, page) => {
    const labels = { archive: 'أرشفة', restore: 'استعادة', unpublish: 'إلغاء نشر', delete: 'حذف نهائي' }
    if (!window.confirm(`${labels[action]} الصفحة ${page.slug}؟`)) return
    setBusy(true)
    try {
      if (action === 'archive') await archiveMarketingPage(page.id)
      if (action === 'restore') await restoreMarketingPage(page.id)
      if (action === 'unpublish') await unpublishMarketingPage(page.id, locale)
      if (action === 'delete') await deleteMarketingPage(page.id)
      if (['archive', 'unpublish', 'delete'].includes(action)) await revalidateMarketing({ kind: 'page', slug: page.slug, locale })
      if (selected?.id === page.id) { setSelected(null); setDraft(null); setRevisions([]); setDirty(false) }
      await load(); toast.success(`تم ${labels[action]} الصفحة`)
    } catch (reason) { toast.error(reason?.message || `فشل ${labels[action]}`) } finally { setBusy(false) }
  }

  const description = useMemo(() => locale === 'ar' ? 'إدارة صفحات التسويق وإصداراتها وأقسامها من دون تعديل الكود. الباقات والأسعار تبقى في سجل الفوترة المركزي.' : 'Manage pages, typed sections, revisions, and publishing.', [locale])
  return <AdminShell active="marketing" title="إدارة الموقع التسويقي"><div style={{ padding: 20, maxWidth: 1380, margin: '0 auto' }}>
    <p style={{ margin: '0 0 16px', color: MUTED, fontSize: 12.5, lineHeight: 1.7 }}>{description}</p>
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>{[['ar', 'العربية'], ['en', 'English']].map(([code, label]) => <Button key={code} variant={locale === code ? 'primary' : 'neutral'} onClick={() => { if (dirty && !window.confirm('لديك تغييرات غير محفوظة. تغيير اللغة؟')) return; setLocale(code) }}>{label}</Button>)}<Button variant={tab === 'pages' ? 'primary' : 'neutral'} onClick={() => setTab('pages')}>الصفحات</Button><Button variant={tab === 'settings' ? 'primary' : 'neutral'} onClick={() => setTab('settings')}>الإعدادات</Button><Button variant={tab === 'media' ? 'primary' : 'neutral'} onClick={() => setTab('media')}>الوسائط</Button><span style={{ marginRight: 'auto' }} />{tab === 'pages' && <Button variant="neutral" disabled={busy} onClick={createPage}>+ صفحة جديدة</Button>}</div>
    {tab === 'settings' ? <MarketingSettings locale={locale} /> : tab === 'media' ? <MarketingMediaLibrary locale={locale} /> : loading ? <SkeletonRows count={3} /> : error ? <ErrorState msg={error} onRetry={load} /> : <div style={{ display: 'grid', gridTemplateColumns: draft ? 'minmax(265px, .28fr) minmax(0, 1fr)' : '1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 10 }}>{rows.length === 0 ? <EmptyState msg="لا توجد صفحات لهذا النطاق اللغوي." /> : rows.map((page) => <article key={page.id} style={{ background: CARD, border: `1px solid ${selected?.id === page.id ? ACCENT : BORDER}`, borderRadius: 13, padding: 14, opacity: page.lifecycleStatus === 'archived' ? .65 : 1 }}><strong style={{ display: 'block', color: 'white', fontSize: 14 }}>{page.draftTitle || page.publishedTitle || page.slug}</strong><span style={{ display: 'block', color: MUTED, fontSize: 11, margin: '4px 0 12px' }}>/{page.slug} · {page.lifecycleStatus === 'archived' ? 'مؤرشفة' : page.publishedRevisionId ? 'منشورة' : 'مسودة'} · {page.revisionCount || 0} إصدارات</span><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{page.lifecycleStatus === 'archived' ? <Button variant="neutral" disabled={busy} onClick={() => pageAction('restore', page)}>استعادة</Button> : <><Button variant="neutral" disabled={busy} onClick={() => openEditor(page)}>تحرير</Button><button type="button" onClick={() => duplicatePage(page)} style={buttonStyle}>نسخ</button>{page.publishedRevisionId && <button type="button" onClick={() => pageAction('unpublish', page)} style={buttonStyle}>إلغاء نشر</button>}<button type="button" onClick={() => pageAction('archive', page)} style={buttonStyle}>أرشفة</button></>}</div></article>)}</div>
      {draft && <section style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 15, padding: 16 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 15 }}><strong style={{ color: 'white', fontSize: 15 }}>مسودة: {selected?.slug}</strong><span style={{ color: '#FFB27F', fontSize: 11 }}>إصدار #{draft.revisionNumber}</span>{dirty && <span style={{ color: '#FCD34D', fontSize: 11 }}>تغييرات غير محفوظة</span>}<div style={{ marginRight: 'auto', display: 'flex', gap: 7, flexWrap: 'wrap' }}><Button variant="neutral" disabled={busy} onClick={preview}>معاينة</Button><Button variant="neutral" disabled={busy} onClick={save}>حفظ</Button><Button variant="primary" disabled={busy} onClick={publish}>نشر الآن</Button></div></div>
        <label style={{ display: 'block', color: '#D1D5DB', fontSize: 12, marginBottom: 6 }}>عنوان الصفحة</label><input className="admin-input" value={draft.title || ''} onChange={(event) => updateDraft({ ...draft, title: event.target.value })} />
        <label style={{ display: 'block', color: '#D1D5DB', fontSize: 12, margin: '13px 0 6px' }}>وصف SEO</label><textarea className="admin-textarea" value={draft.description || ''} onChange={(event) => updateDraft({ ...draft, description: event.target.value })} style={{ minHeight: 64, resize: 'vertical' }} />
        <label style={{ display: 'block', color: '#D1D5DB', fontSize: 12, margin: '13px 0 6px' }}>SEO</label><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input className="admin-input" value={draft.seo?.title || ''} placeholder="SEO Title" onChange={(event) => updateDraft({ ...draft, seo: { ...(draft.seo || {}), title: event.target.value } })} /><input className="admin-input" value={draft.seo?.canonicalPath || ''} placeholder="/page-path" onChange={(event) => updateDraft({ ...draft, seo: { ...(draft.seo || {}), canonicalPath: event.target.value } })} /></div><textarea className="admin-textarea" value={draft.seo?.description || ''} placeholder="SEO Description" onChange={(event) => updateDraft({ ...draft, seo: { ...(draft.seo || {}), description: event.target.value } })} style={{ minHeight: 58, marginTop: 7, resize: 'vertical' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '20px 0 10px' }}><strong style={{ color: 'white', fontSize: 14 }}>الأقسام</strong><select className="admin-input" value="" onChange={(event) => { if (event.target.value) addSection(event.target.value); event.target.value = '' }} style={{ width: 210, marginRight: 'auto' }}><option value="">+ أضف قسمًا typed</option>{SECTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
        <DndContext collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={draft.sections.map((section) => section.id)} strategy={verticalListSortingStrategy}><div style={{ display: 'grid', gap: 10 }}>{draft.sections.map((section, index) => <SortableSectionCard key={section.id} section={section} index={index} total={draft.sections.length} onChange={(next) => updateSection(index, next)} onMove={moveSection} onDuplicate={() => duplicateSection(index)} onDelete={() => removeSection(index)} />)}</div></SortableContext></DndContext>
        <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 18, paddingTop: 16, display: 'flex', alignItems: 'end', gap: 9, flexWrap: 'wrap' }}><label style={{ color: '#D1D5DB', fontSize: 12 }}>جدولة النشر<input type="datetime-local" className="admin-input" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} style={{ display: 'block', marginTop: 5, width: 210 }} /></label><Button variant="neutral" disabled={busy} onClick={schedule}>جدولة</Button><span style={{ color: MUTED, fontSize: 11 }}>لا يظهر التعديل للعامة قبل النشر أو الموعد المجدول.</span></div>
        <RevisionList revisions={revisions} currentId={draft.id} onRestore={restoreRevision} busy={busy} />
      </section>}
    </div>}
  </div></AdminShell>
}
