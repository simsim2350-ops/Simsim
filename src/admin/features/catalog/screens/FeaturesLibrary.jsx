import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  listCategories, listCapabilities, capabilityDetail,
  upsertCapability, deleteCapability, can,
} from '../catalogApi'

// ============================================================================
// 📚 مكتبة الميزات — الشاشة الأولى لسجل القدرات (Product Design).
// مسؤولية واحدة: تعريف الميزات فقط (الاسم/الوصف/الفئة/الأيقونة/النوع/التشغيل الافتراضي).
// الحقول التقنية (الأب/التبعيات/الإصدار/الوسوم/الحالات) تعيش في «إعدادات متقدمة».
// عند التعديل: نجلب القدرة كاملة وندمج تغييرات الهوية فوقها — فلا تُمَس الحقول التقنية
// (الحفظ في الخلفية يستبدل الكل، فالدمج ضروري للحفاظ عليها).
// ============================================================================
const CARD = '#12141C', BORDER = 'rgba(255,255,255,0.08)', MUTED = '#9CA3AF', ACCENT = '#7C3AED'
const TYPE_AR = { feature: 'ميزة', limit: 'حد', option: 'خيار', mode: 'وضع' }
const TYPES = ['feature', 'limit', 'option', 'mode']

const inputStyle = {
  background: '#0B0D12', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '9px 12px',
  color: 'white', fontFamily: 'Tajawal,sans-serif', fontSize: '13px', outline: 'none', width: '100%',
}
const btn = (bg) => ({ padding: '9px 15px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '12.5px', color: 'white', background: bg })
const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', direction: 'ltr', fontSize: '12px' }
const Loading = () => <div style={{ color: MUTED, textAlign: 'center', padding: '48px', fontSize: '13px' }}>جارٍ التحميل…</div>

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: '12px' }}>
      <span style={{ display: 'block', fontSize: '11.5px', color: MUTED, fontWeight: '700', marginBottom: '6px' }}>{label}</span>
      {children}
    </label>
  )
}

const EMPTY = { key: '', name: '', description: '', category_key: '', icon: '', type: 'feature', enabled_global: true }

export default function FeaturesLibrary() {
  const [cats, setCats] = useState([])
  const [caps, setCaps] = useState([])
  const [loading, setLoading] = useState(true)
  const [canWrite, setCanWrite] = useState(false)
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null) // { mode:'new'|'edit', full? }
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      const [c, f, w] = await Promise.all([listCategories(), listCapabilities(), can('manage_flags')])
      setCats(c); setCaps(f); setCanWrite(w)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const openNew = () => { setForm(EMPTY); setModal({ mode: 'new' }) }
  const openEdit = async (key) => {
    try {
      const d = await capabilityDetail(key)
      const c = d.capability || {}
      setForm({ key: c.key, name: c.name || '', description: c.description || '', category_key: c.category_key || '', icon: c.icon || '', type: c.type || 'feature', enabled_global: !!c.enabled_global })
      setModal({ mode: 'edit', full: c }) // نحتفظ بالقدرة كاملة للدمج
    } catch (e) { toast.error(e.message) }
  }

  async function save() {
    if (!form.name?.trim()) { toast.error('الاسم مطلوب'); return }
    if (modal.mode === 'new' && !/^[a-z][a-z0-9_]*$/.test(form.key)) { toast.error('المفتاح: أحرف إنجليزية صغيرة و_ فقط'); return }
    setSaving(true)
    try {
      const identity = { name: form.name, description: form.description || null, category_key: form.category_key || null, icon: form.icon || null, type: form.type, enabled_global: form.type === 'feature' ? !!form.enabled_global : false }
      // دمج: للجديد فقط الهوية (الخلفية تكمل الافتراضيات)؛ للتعديل نبني فوق القدرة الكاملة (حفظ الحقول التقنية)
      const payload = modal.mode === 'new' ? { key: form.key, ...identity } : { ...modal.full, ...identity }
      await upsertCapability(payload)
      toast.success('حُفظت الميزة')
      setModal(null); await reload()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function remove(key) {
    if (!window.confirm(`حذف الميزة «${key}»؟`)) return
    try { await deleteCapability(key); toast.success('حُذفت'); await reload() } catch (e) { toast.error(e.message) }
  }

  if (loading) return <Loading />

  const ql = q.trim().toLowerCase()
  const filtered = caps.filter((c) => !ql || c.key.toLowerCase().includes(ql) || (c.name || '').toLowerCase().includes(ql))
  const catName = (k) => cats.find((c) => c.key === k) ? `${cats.find((c) => c.key === k).icon || ''} ${cats.find((c) => c.key === k).name}` : '— بلا فئة'
  const byCat = {}
  for (const c of filtered) (byCat[c.category_key || ''] ||= []).push(c)

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
        <input placeholder="🔍 بحث…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, maxWidth: '240px' }} />
        {canWrite && <button onClick={openNew} style={{ ...btn(ACCENT), marginRight: 'auto' }}>+ ميزة جديدة</button>}
      </div>

      {Object.keys(byCat).sort().map((ck) => (
        <div key={ck} style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: MUTED, fontWeight: '800', marginBottom: '6px' }}>{catName(ck)}</div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '12px', overflow: 'hidden' }}>
            {byCat[ck].map((c, i) => (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', borderTop: i ? `1px solid ${BORDER}` : 'none' }}>
                <span style={{ fontSize: '16px' }}>{c.icon || '•'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13.5px', color: 'white', fontWeight: '700' }}>{c.name}</div>
                  <div style={{ ...mono, color: MUTED, fontSize: '10.5px' }}>{c.key}</div>
                </div>
                <span style={{ fontSize: '11px', color: '#C4B5FD', background: 'rgba(124,58,237,0.15)', borderRadius: '6px', padding: '2px 8px' }}>{TYPE_AR[c.type] || c.type}</span>
                {canWrite && <button onClick={() => openEdit(c.key)} style={btn('#374151')}>تعديل</button>}
                {canWrite && <button onClick={() => remove(c.key)} style={btn('#7F1D1D')}>حذف</button>}
              </div>
            ))}
          </div>
        </div>
      ))}
      {filtered.length === 0 && <div style={{ color: MUTED, padding: '32px', textAlign: 'center', fontSize: '13px' }}>لا ميزات مطابقة.</div>}

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.65)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '20px', width: '100%', maxWidth: '440px', maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '15px', fontWeight: '900', color: 'white', fontFamily: 'Cairo,sans-serif', marginBottom: '16px' }}>
              {modal.mode === 'new' ? '+ ميزة جديدة' : `تعديل: ${form.name}`}
            </div>
            {modal.mode === 'new' && (
              <Field label="المفتاح (إنجليزي صغير، مثل online_orders)"><input value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} style={{ ...inputStyle, ...mono }} /></Field>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Field label="الاسم"><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} /></Field>
              <Field label="الأيقونة"><input value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} style={inputStyle} placeholder="📋" /></Field>
            </div>
            <Field label="الوصف"><input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={inputStyle} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Field label="الفئة"><select value={form.category_key} onChange={(e) => setForm((f) => ({ ...f, category_key: e.target.value }))} style={inputStyle}><option value="">—</option>{cats.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select></Field>
              <Field label="النوع"><select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} style={inputStyle}>{TYPES.map((t) => <option key={t} value={t}>{TYPE_AR[t]}</option>)}</select></Field>
            </div>
            {form.type === 'feature' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: MUTED, fontSize: '12.5px', margin: '4px 0 14px' }}>
                <input type="checkbox" checked={form.enabled_global} onChange={(e) => setForm((f) => ({ ...f, enabled_global: e.target.checked }))} /> مفعّلة افتراضياً لكل المطاعم
              </label>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => setModal(null)} style={{ ...btn('#374151'), flex: 1 }}>إلغاء</button>
              <button onClick={save} disabled={saving} style={{ ...btn(ACCENT), flex: 2, opacity: saving ? 0.7 : 1 }}>{saving ? 'جارٍ الحفظ…' : 'حفظ'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
