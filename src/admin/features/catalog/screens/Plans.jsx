import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  listPlans, listCategories, listCapabilities, listPlanFeatures,
  setPlanFeature, deletePlanFeature, can,
} from '../catalogApi'

// ============================================================================
// 📦 الباقات — الشاشة الثانية. مسؤولية واحدة: «أي ميزات تدخل في كل باقة؟»
// اختر باقة → شغّل/أطفئ ضمّ كل ميزة إليها. القيَم الرقمية (الحدود) في شاشة «الحدود».
// يعرض ميزات النوع feature فقط (الميزات القابلة للتشغيل/الإطفاء).
// ============================================================================
const CARD = '#12141C', BORDER = 'rgba(255,255,255,0.08)', MUTED = '#9CA3AF', ACCENT = '#FF6A00', GREEN = '#22C55E'
const inputStyle = { background: '#0B0D12', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '9px 12px', color: 'white', fontFamily: 'Tajawal,sans-serif', fontSize: '13px', outline: 'none' }
const Loading = () => <div style={{ color: MUTED, textAlign: 'center', padding: '48px', fontSize: '13px' }}>جارٍ التحميل…</div>

export default function Plans() {
  const [plans, setPlans] = useState([])
  const [caps, setCaps] = useState([])
  const [cats, setCats] = useState([])
  const [canWrite, setCanWrite] = useState(false)
  const [loading, setLoading] = useState(true)
  const [planId, setPlanId] = useState('')
  const [included, setIncluded] = useState({}) // key -> is_included
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const [p, c, cat, w] = await Promise.all([listPlans().catch(() => []), listCapabilities(), listCategories(), can('manage_flags')])
        setPlans(p); setCaps(c.filter((x) => x.type === 'feature')); setCats(cat); setCanWrite(w)
        if (p.length) setPlanId(p[0].id)
      } catch (e) { toast.error(e.message) } finally { setLoading(false) }
    })()
  }, [])

  useEffect(() => {
    if (!planId) { setIncluded({}); return }
    listPlanFeatures(planId).then((rows) => {
      const m = {}; rows.forEach((r) => { m[r.feature_key] = r.is_included }); setIncluded(m)
    }).catch((e) => toast.error(e.message))
  }, [planId])

  async function toggle(key) {
    if (!canWrite || busy) return
    const isOn = included[key] === true
    setBusy(true)
    try {
      if (isOn) { await deletePlanFeature(planId, key); setIncluded((m) => { const n = { ...m }; delete n[key]; return n }) }
      else { await setPlanFeature(planId, key, true, null); setIncluded((m) => ({ ...m, [key]: true })) }
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  if (loading) return <Loading />
  if (plans.length === 0) return <div style={{ color: MUTED, padding: '40px', textAlign: 'center', fontSize: '13px' }}>لا توجد باقات بعد. أنشئ باقة من صفحة «الفوترة» أولاً.</div>

  const catName = (k) => { const c = cats.find((x) => x.key === k); return c ? `${c.icon || ''} ${c.name}` : '— بلا فئة' }
  const byCat = {}; caps.forEach((c) => (byCat[c.category_key || ''] ||= []).push(c))
  const includedCount = Object.values(included).filter((v) => v === true).length

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <span style={{ color: MUTED, fontSize: '13px', fontWeight: '700' }}>الباقة:</span>
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} style={{ ...inputStyle, minWidth: '200px' }}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.billing_cycle === 'yearly' ? 'سنوية' : 'شهرية'})</option>)}
        </select>
        <span style={{ marginRight: 'auto', color: MUTED, fontSize: '12px' }}>مُضمَّنة: <b style={{ color: GREEN }}>{includedCount}</b> ميزة</span>
      </div>
      <div style={{ fontSize: '11.5px', color: MUTED, marginBottom: '14px', lineHeight: 1.7 }}>
        شغّل الميزة لتدخل في هذه الباقة. الميزة غير المُضمَّنة يرِثها المطعم من الإعداد العام (أو تُحجب لو أُطفئت عامّاً).
      </div>

      {Object.keys(byCat).sort().map((ck) => (
        <div key={ck} style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: MUTED, fontWeight: '800', marginBottom: '6px' }}>{catName(ck)}</div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '12px', overflow: 'hidden' }}>
            {byCat[ck].map((c, i) => {
              const on = included[c.key] === true
              return (
                <div key={c.key} onClick={() => toggle(c.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', borderTop: i ? `1px solid ${BORDER}` : 'none', cursor: canWrite ? 'pointer' : 'default' }}>
                  <span style={{ fontSize: '15px' }}>{c.icon || '•'}</span>
                  <span style={{ flex: 1, fontSize: '13.5px', color: 'white', fontWeight: '600' }}>{c.name}</span>
                  <span style={{ width: '44px', height: '24px', borderRadius: '100px', background: on ? GREEN : '#374151', position: 'relative', transition: 'background .15s', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: '3px', left: on ? '3px' : '23px', width: '18px', height: '18px', borderRadius: '50%', background: 'white', transition: 'left .15s' }} />
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {caps.length === 0 && <div style={{ color: MUTED, padding: '32px', textAlign: 'center', fontSize: '13px' }}>لا ميزات (نوع feature) بعد.</div>}
    </div>
  )
}
