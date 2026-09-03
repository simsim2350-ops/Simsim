import { useMemo, useState } from 'react'
import { MUTED, BORDER, ACCENT } from '../../theme'

// ============================================================================
// محدّد مزايا الباقة — يستبدل حقل «المزايا» النصي الحر بربط حقيقي بسجل القدرات
// (feature_flags عبر admin_list_capabilities). لا يخزّن شيئاً بنفسه: الحفظ
// الفعلي (plan_features) يتم في PlansTab.save عبر admin_set_plan_feature /
// admin_delete_plan_feature الموجودتين مسبقاً. هذا المكوّن محلي الحالة فقط
// (قائمة المفاتيح المُختارة) حتى الحفظ. يعرض قدرات type='feature' فقط —
// الحدود الرقمية (type='limit') تبقى في شاشة «الحدود» الحالية.
// ============================================================================
const GREEN = '#22C55E'
const rowStyle = { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', cursor: 'pointer', minHeight: '44px' }
const toggleTrack = (on) => ({ width: '40px', height: '22px', borderRadius: '100px', background: on ? GREEN : '#374151', position: 'relative', flexShrink: 0, transition: 'background .15s' })
const toggleThumb = (on) => ({ position: 'absolute', top: '3px', insetInlineStart: on ? '19px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'inset-inline-start .15s' })

export default function PlanFeatureSelector({ capabilities, categories, selected, onChange, disabled }) {
  const [query, setQuery] = useState('')

  const featureCaps = useMemo(() => capabilities.filter((c) => c.type === 'feature'), [capabilities])
  const selectedSet = useMemo(() => new Set(selected || []), [selected])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return featureCaps
    return featureCaps.filter((c) => c.name?.toLowerCase().includes(q) || c.public_label?.toLowerCase().includes(q) || c.key.includes(q))
  }, [featureCaps, query])

  const byCategory = useMemo(() => {
    const m = {}
    filtered.forEach((c) => { (m[c.category_key || ''] ||= []).push(c) })
    return m
  }, [filtered])

  const categoryLabel = (key) => {
    const cat = categories.find((c) => c.key === key)
    return cat ? `${cat.icon || ''} ${cat.name}` : '— بلا فئة'
  }

  const toggle = (key) => {
    if (disabled) return
    const next = selectedSet.has(key) ? selected.filter((k) => k !== key) : [...(selected || []), key]
    onChange(next)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
        <input
          className="admin-input" placeholder="ابحث عن ميزة…" value={query}
          onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: '160px' }}
        />
        <span style={{ fontSize: '11.5px', color: MUTED, whiteSpace: 'nowrap' }}>
          <b style={{ color: GREEN }}>{selected?.length || 0}</b> ميزة مُختارة
        </span>
      </div>
      <div style={{ fontSize: '11px', color: MUTED, marginBottom: '10px', lineHeight: 1.6 }}>
        الحدود الرقمية (عدد المنتجات/الفروع/الموظفين) تُدار من شاشة «الحدود» — القائمة هنا للمزايا فقط.
      </div>
      {Object.keys(byCategory).length === 0 ? (
        <div style={{ color: MUTED, padding: '20px', textAlign: 'center', fontSize: '13px' }}>لا نتائج</div>
      ) : Object.keys(byCategory).sort().map((ck) => (
        <div key={ck} style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11.5px', color: MUTED, fontWeight: '800', marginBottom: '5px' }}>{categoryLabel(ck)}</div>
          <div style={{ background: '#0D0F15', border: `1px solid ${BORDER}`, borderRadius: '11px', overflow: 'hidden' }}>
            {byCategory[ck].map((c, i) => {
              const on = selectedSet.has(c.key)
              return (
                <div key={c.key} onClick={() => toggle(c.key)}
                  style={{ ...rowStyle, borderTop: i ? `1px solid ${BORDER}` : 'none', opacity: disabled ? 0.6 : 1 }}>
                  <span style={{ fontSize: '15px' }}>{c.icon || '•'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: 'white', fontWeight: '600' }}>{c.name}</div>
                    {c.is_public
                      ? <div style={{ fontSize: '10.5px', color: ACCENT, marginTop: '1px' }}>عام · يظهر للعملاء باسم «{c.public_label || c.name}»</div>
                      : <div style={{ fontSize: '10.5px', color: MUTED, marginTop: '1px' }}>داخلي فقط</div>}
                  </div>
                  <span style={toggleTrack(on)}><span style={toggleThumb(on)} /></span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
