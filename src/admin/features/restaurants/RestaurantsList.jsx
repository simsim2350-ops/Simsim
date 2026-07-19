import { useEffect, useMemo, useState } from 'react'
import AdminShell from '../../AdminShell'
import { listRestaurants } from './restaurantsApi'

const CARD = '#12141C', BORDER = 'rgba(255,255,255,0.08)', MUTED = '#9CA3AF', ACCENT = '#7C3AED'

// وحدة «المطاعم» — قائمة للقراءة فقط (Walking Skeleton كامل: حارس → قشرة → خدمة → RPC → DB).
// الإدارة (تعليق/تفعيل/تغيير خطة/تعمّق) تأتي في M3 (إدارة المطاعم).
export default function RestaurantsList() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try { const data = await listRestaurants(); if (!cancelled) setRows(data) }
      catch (e) { if (!cancelled) setError(e?.message || 'تعذّر التحميل') }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(r => [r.name, r.slug, r.owner_email].filter(Boolean).join(' ').toLowerCase().includes(s))
  }, [rows, q])

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('ar', { day:'numeric', month:'short', year:'numeric' }) : '—'

  return (
    <AdminShell active="restaurants" title="المطاعم">
      <div style={{ padding:'20px', maxWidth:'1100px', margin:'0 auto' }}>

        <div style={{ display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap', marginBottom:'16px' }}>
          <div style={{ fontSize:'13px', color:MUTED, fontWeight:'700' }}>
            {loading ? 'جارٍ التحميل…' : `${filtered.length} من ${rows.length} مطعم`}
          </div>
          <div style={{ flex:1 }}/>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم / الرابط / البريد…"
            style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:'11px', padding:'9px 13px', color:'white',
                     fontFamily:'Tajawal,sans-serif', fontSize:'13px', outline:'none', minWidth:'220px' }}/>
        </div>

        {error ? (
          <div style={{ background:'#3B1113', border:'1px solid #7F1D1D', borderRadius:'12px', padding:'16px', color:'#FCA5A5', fontSize:'13px' }}>
            ⚠️ {error}
          </div>
        ) : loading ? (
          <div style={{ color:MUTED, textAlign:'center', padding:'48px', fontSize:'13px' }}>جارٍ التحميل…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color:MUTED, textAlign:'center', padding:'48px', fontSize:'13px' }}>لا توجد نتائج</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {filtered.map(r => (
              <div key={r.id} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:'14px', padding:'14px 16px', display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap' }}>
                <div style={{ width:'42px', height:'42px', borderRadius:'11px', background:'rgba(124,58,237,0.15)', border:`1px solid ${ACCENT}55`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0 }}>🏪</div>
                <div style={{ flex:1, minWidth:'160px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap', marginBottom:'3px' }}>
                    <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', color:'white' }}>{r.name}</span>
                    <span style={{ fontSize:'10px', fontWeight:'800', color: r.is_active ? '#6EE7B7' : '#FCA5A5', background: r.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', borderRadius:'100px', padding:'2px 9px' }}>
                      {r.is_active ? 'نشط' : 'معلّق'}
                    </span>
                    <span style={{ fontSize:'10px', fontWeight:'800', color:'#C4B5FD', background:'rgba(124,58,237,0.12)', borderRadius:'100px', padding:'2px 9px' }}>{r.subscription_plan || '—'}</span>
                  </div>
                  <div style={{ fontSize:'11.5px', color:MUTED, display:'flex', gap:'8px', flexWrap:'wrap' }}>
                    <span style={{ direction:'ltr' }}>/{r.slug}</span>
                    {r.owner_email && <span style={{ direction:'ltr' }}>· {r.owner_email}</span>}
                    <span>· أُنشئ {fmtDate(r.created_at)}</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:'18px', flexShrink:0 }}>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', color:'white' }}>{r.orders_count}</div>
                    <div style={{ fontSize:'10px', color:MUTED }}>طلب</div>
                  </div>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', color:'white' }}>{r.branches_count}</div>
                    <div style={{ fontSize:'10px', color:MUTED }}>فرع</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
