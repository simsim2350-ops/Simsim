import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  listRestaurants, listCategories, listCapabilities, listRestaurantOverrides,
  setOverride, can,
} from '../catalogApi'

// ============================================================================
// 🏪 تخصيص المطاعم — الشاشة الرابعة. مسؤولية واحدة: استثناء لمطعم بعينه.
// اختر مطعماً → لكل قدرة: وراثة (الافتراضي) / تفعيل / تعطيل (للميزات) أو قيمة (للحدود).
// التخصيص يتجاوز الباقة والافتراضي لهذا المطعم فقط.
// ============================================================================
const CARD = '#12141C', BORDER = 'rgba(255,255,255,0.08)', MUTED = '#9CA3AF', ACCENT = '#FF6A00', GREEN = '#22C55E', RED = '#EF4444'
const inputStyle = { background: '#0B0D12', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '9px 12px', color: 'white', fontFamily: 'Tajawal,sans-serif', fontSize: '13px', outline: 'none' }
const seg = (active, color) => ({ padding: '6px 11px', borderRadius: '8px', border: `1.5px solid ${active ? color : BORDER}`, background: active ? color : 'transparent', color: active ? 'white' : MUTED, cursor: 'pointer', fontSize: '11.5px', fontWeight: '700', fontFamily: 'Tajawal,sans-serif' })
const TYPE_AR = { feature: 'ميزة', limit: 'حد', option: 'خيار', mode: 'وضع' }
const Loading = () => <div style={{ color: MUTED, textAlign: 'center', padding: '48px', fontSize: '13px' }}>جارٍ التحميل…</div>

export default function RestaurantOverrides() {
  const [rests, setRests] = useState([])
  const [caps, setCaps] = useState([])
  const [cats, setCats] = useState([])
  const [canWrite, setCanWrite] = useState(false)
  const [loading, setLoading] = useState(true)
  const [rid, setRid] = useState('')
  const [ov, setOv] = useState({})   // key -> { enabled, value }
  const [valDraft, setValDraft] = useState({}) // key -> نص القيمة (للحدود/الأوضاع)
  const [q, setQ] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const [r, c, cat, w] = await Promise.all([
          listRestaurants({ limit: 100 }).then((x) => x.rows).catch(() => []),
          listCapabilities(), listCategories(), can('manage_flags'),
        ])
        setRests(r); setCaps(c); setCats(cat); setCanWrite(w)
        if (r.length) setRid(r[0].id)
      } catch (e) { toast.error(e.message) } finally { setLoading(false) }
    })()
  }, [])

  async function loadOverrides(id) {
    const rows = await listRestaurantOverrides(id)
    const m = {}, d = {}
    rows.forEach((r) => { m[r.key] = { enabled: r.enabled, value: r.value }; if (r.value != null) d[r.key] = String(r.value) })
    setOv(m); setValDraft(d)
  }
  useEffect(() => { if (rid) loadOverrides(rid).catch((e) => toast.error(e.message)) }, [rid])

  async function apply(key, value) {
    if (!canWrite) return
    try { await setOverride(rid, key, value); await loadOverrides(rid); toast.success(value === null ? 'أُزيل التخصيص' : 'حُفظ التخصيص') }
    catch (e) { toast.error(e.message) }
  }

  if (loading) return <Loading />
  if (rests.length === 0) return <div style={{ color: MUTED, padding: '40px', textAlign: 'center', fontSize: '13px' }}>لا مطاعم.</div>

  const ql = q.trim().toLowerCase()
  const filtered = caps.filter((c) => !ql || c.key.toLowerCase().includes(ql) || (c.name || '').toLowerCase().includes(ql))
  const catName = (k) => { const c = cats.find((x) => x.key === k); return c ? `${c.icon || ''} ${c.name}` : '— بلا فئة' }
  const byCat = {}; filtered.forEach((c) => (byCat[c.category_key || ''] ||= []).push(c))
  const overrideCount = Object.keys(ov).length

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
        <span style={{ color: MUTED, fontSize: '13px', fontWeight: '700' }}>المطعم:</span>
        <select value={rid} onChange={(e) => setRid(e.target.value)} style={{ ...inputStyle, minWidth: '200px' }}>
          {rests.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <input placeholder="🔍 بحث في القدرات…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, maxWidth: '200px' }} />
        <span style={{ marginRight: 'auto', color: MUTED, fontSize: '12px' }}>تخصيصات هذا المطعم: <b style={{ color: '#FFB27F' }}>{overrideCount}</b></span>
      </div>
      <div style={{ fontSize: '11.5px', color: MUTED, marginBottom: '14px' }}>«وراثة» = يتبع الباقة/الافتراضي. أي تخصيص هنا يخصّ هذا المطعم وحده.</div>

      {Object.keys(byCat).sort().map((ck) => (
        <div key={ck} style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: MUTED, fontWeight: '800', marginBottom: '6px' }}>{catName(ck)}</div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '12px', overflow: 'hidden' }}>
            {byCat[ck].map((c, i) => {
              const o = ov[c.key]
              const isFeature = c.type === 'feature'
              return (
                <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', borderTop: i ? `1px solid ${BORDER}` : 'none', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <span style={{ fontSize: '13.5px', color: 'white', fontWeight: '600' }}>{c.icon || '•'} {c.name}</span>
                    <span style={{ fontSize: '10px', color: MUTED, marginRight: '6px' }}>{TYPE_AR[c.type] || c.type}</span>
                  </div>
                  {isFeature ? (
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button disabled={!canWrite} onClick={() => apply(c.key, null)} style={seg(o == null, '#374151')}>وراثة</button>
                      <button disabled={!canWrite} onClick={() => apply(c.key, true)} style={seg(o?.enabled === true, GREEN)}>تفعيل</button>
                      <button disabled={!canWrite} onClick={() => apply(c.key, false)} style={seg(o?.enabled === false, RED)}>تعطيل</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                      <input disabled={!canWrite} value={valDraft[c.key] ?? ''} onChange={(e) => setValDraft((v) => ({ ...v, [c.key]: e.target.value }))}
                        placeholder={o ? '' : 'وراثة'} style={{ ...inputStyle, width: '90px', textAlign: 'center' }} />
                      {canWrite && <button onClick={() => { const raw = (valDraft[c.key] ?? '').trim(); apply(c.key, raw === '' ? null : (isNaN(Number(raw)) ? raw : Number(raw))) }} style={seg(false, ACCENT)}>حفظ</button>}
                      {canWrite && o && <button onClick={() => apply(c.key, null)} style={seg(false, '#374151')}>وراثة</button>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
