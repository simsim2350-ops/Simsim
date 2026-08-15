import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  listPlans, listCapabilities, listPlanFeatures,
  setPlanFeature, deletePlanFeature, can,
} from '../catalogApi'

// ============================================================================
// 📏 الحدود — الشاشة الثالثة. مسؤولية واحدة: أرقام كل باقة (كم منتج/فرع/مستخدم…).
// اختر باقة → اضبط الرقم لكل حدّ. فارغ = بلا حد (يرِث الافتراضي). يعرض النوع limit فقط.
// ============================================================================
const CARD = '#12141C', BORDER = 'rgba(255,255,255,0.08)', MUTED = '#9CA3AF', ACCENT = '#FF6A00'
const inputStyle = { background: '#0B0D12', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '9px 12px', color: 'white', fontFamily: 'Tajawal,sans-serif', fontSize: '13px', outline: 'none' }
const btn = (bg) => ({ padding: '8px 13px', borderRadius: '9px', border: 'none', cursor: 'pointer', fontFamily: 'Tajawal,sans-serif', fontWeight: '800', fontSize: '12px', color: 'white', background: bg })
const Loading = () => <div style={{ color: MUTED, textAlign: 'center', padding: '48px', fontSize: '13px' }}>جارٍ التحميل…</div>

export default function Limits() {
  const [plans, setPlans] = useState([])
  const [limits, setLimits] = useState([]) // capabilities من نوع limit
  const [canWrite, setCanWrite] = useState(false)
  const [loading, setLoading] = useState(true)
  const [planId, setPlanId] = useState('')
  const [vals, setVals] = useState({})   // key -> نص القيمة في الحقل
  const [saved, setSaved] = useState({})  // key -> القيمة المحفوظة (للمقارنة)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const [p, c, w] = await Promise.all([listPlans().catch(() => []), listCapabilities(), can('manage_flags')])
        setPlans(p); setLimits(c.filter((x) => x.type === 'limit')); setCanWrite(w)
        if (p.length) setPlanId(p[0].id)
      } catch (e) { toast.error(e.message) } finally { setLoading(false) }
    })()
  }, [])

  useEffect(() => {
    if (!planId) return
    listPlanFeatures(planId).then((rows) => {
      const m = {}; rows.forEach((r) => { if (r.value != null) m[r.feature_key] = String(r.value) })
      setVals(m); setSaved(m)
    }).catch((e) => toast.error(e.message))
  }, [planId])

  async function saveOne(key) {
    if (!canWrite) return
    const raw = (vals[key] ?? '').trim()
    setBusy(key)
    try {
      if (raw === '') { await deletePlanFeature(planId, key); setSaved((s) => { const n = { ...s }; delete n[key]; return n }) }
      else {
        const num = Number(raw)
        if (!Number.isFinite(num) || num < 0) { toast.error('أدخل رقماً صحيحاً موجباً'); setBusy(''); return }
        await setPlanFeature(planId, key, true, num); setSaved((s) => ({ ...s, [key]: String(num) }))
      }
      toast.success('حُفظ الحد')
    } catch (e) { toast.error(e.message) } finally { setBusy('') }
  }

  if (loading) return <Loading />
  if (plans.length === 0) return <div style={{ color: MUTED, padding: '40px', textAlign: 'center', fontSize: '13px' }}>لا توجد باقات بعد. أنشئ باقة من صفحة «الفوترة» أولاً.</div>
  if (limits.length === 0) return <div style={{ color: MUTED, padding: '40px', textAlign: 'center', fontSize: '13px' }}>لا توجد قدرات من نوع «حد» بعد.</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <span style={{ color: MUTED, fontSize: '13px', fontWeight: '700' }}>الباقة:</span>
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} style={{ ...inputStyle, minWidth: '200px' }}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.billing_cycle === 'yearly' ? 'سنوية' : 'شهرية'})</option>)}
        </select>
      </div>
      <div style={{ fontSize: '11.5px', color: MUTED, marginBottom: '14px' }}>اترك الحقل فارغاً = بلا حد (غير محدود). الرقم يُفرَض فعلياً في قاعدة البيانات لمطاعم هذه الباقة.</div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '12px', overflow: 'hidden' }}>
        {limits.map((c, i) => {
          const changed = (vals[c.key] ?? '') !== (saved[c.key] ?? '')
          return (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 14px', borderTop: i ? `1px solid ${BORDER}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13.5px', color: 'white', fontWeight: '700' }}>{c.icon || '📏'} {c.name}</div>
                <div style={{ fontSize: '10.5px', color: MUTED }}>{c.metric || '—'}{c.unit ? ` · ${c.unit}` : ''}</div>
              </div>
              <input type="number" min="0" disabled={!canWrite} value={vals[c.key] ?? ''}
                onChange={(e) => setVals((v) => ({ ...v, [c.key]: e.target.value }))}
                placeholder="بلا حد" style={{ ...inputStyle, width: '110px', textAlign: 'center' }} />
              {canWrite && <button onClick={() => saveOne(c.key)} disabled={!changed || busy === c.key} style={{ ...btn(changed ? ACCENT : '#374151'), opacity: (!changed || busy === c.key) ? 0.6 : 1 }}>{busy === c.key ? '…' : 'حفظ'}</button>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
