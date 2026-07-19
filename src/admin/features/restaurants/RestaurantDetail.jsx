import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import AdminShell from '../../AdminShell'
import { useAuthStore } from '../../../store/authStore'
import { getRestaurant, setRestaurantActive, setRestaurantPlan } from './restaurantsApi'

const PLAN_OPTIONS = ['starter', 'pro', 'business']

const CARD = '#12141C', BORDER = 'rgba(255,255,255,0.08)', MUTED = '#9CA3AF', ACCENT = '#7C3AED'
const num = (v) => Number(v) || 0
const fmt = (v) => num(v).toLocaleString('en-US', { maximumFractionDigits: 0 })

// تفاصيل مطعم (قراءة فقط) — M3.1. الإدارة (تعليق/تفعيل/خطة) تأتي في M3.2.
export default function RestaurantDetail() {
  const { id } = useParams()
  const { platformRole } = useAuthStore()
  const canManage = platformRole === 'super_admin'
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [planSel, setPlanSel] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null) // { title, msg, action }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try { const data = await getRestaurant(id); if (!cancelled) { setD(data); setPlanSel(data?.subscription_plan || '') } }
      catch (e) { if (!cancelled) setError(e?.message || 'تعذّر التحميل') }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [id])

  const runConfirm = async () => {
    if (!confirm) return
    setBusy(true)
    try { await confirm.action(); toast.success('تم بنجاح') }
    catch (e) { toast.error(e?.message || 'فشل الإجراء') }
    finally { setBusy(false); setConfirm(null) }
  }
  const askToggleActive = () => setConfirm({
    title: d.is_active ? 'تعليق المطعم' : 'تفعيل المطعم',
    msg: d.is_active ? 'سيتوقّف المطعم عن استقبال الطلبات فوراً.' : 'سيعود المطعم للعمل.',
    action: async () => { const nv = await setRestaurantActive(d.id, !d.is_active); setD(x => ({ ...x, is_active: nv })) },
  })
  const askApplyPlan = () => setConfirm({
    title: 'تغيير الخطة',
    msg: `تغيير خطة «${d.name}» إلى «${planSel}»؟`,
    action: async () => { const nv = await setRestaurantPlan(d.id, planSel); setD(x => ({ ...x, subscription_plan: nv })) },
  })

  const daily = d?.daily || []
  const maxOrders = Math.max(...daily.map(x => num(x.orders)), 1)

  const Section = ({ title, children }) => (
    <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:'14px', padding:'16px', marginBottom:'12px' }}>
      <div style={{ fontSize:'13px', fontWeight:'800', color:'white', fontFamily:'Cairo,sans-serif', marginBottom:'12px' }}>{title}</div>
      {children}
    </div>
  )

  return (
    <AdminShell active="restaurants" title="تفاصيل المطعم">
      <div style={{ padding:'20px', maxWidth:'1000px', margin:'0 auto' }}>
        <Link to="/admin/restaurants" style={{ color:MUTED, fontSize:'12.5px', textDecoration:'none', fontWeight:'700' }}>← كل المطاعم</Link>

        {error ? (
          <div style={{ marginTop:'14px', background:'#3B1113', border:'1px solid #7F1D1D', borderRadius:'12px', padding:'16px', color:'#FCA5A5', fontSize:'13px' }}>⚠️ {error}</div>
        ) : loading ? (
          <div style={{ color:MUTED, textAlign:'center', padding:'48px', fontSize:'13px' }}>جارٍ التحميل…</div>
        ) : !d ? (
          <div style={{ color:MUTED, textAlign:'center', padding:'48px', fontSize:'13px' }}>المطعم غير موجود</div>
        ) : (
          <div style={{ marginTop:'14px' }}>
            {/* رأس */}
            <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:'14px', padding:'18px', marginBottom:'12px', display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap' }}>
              <div style={{ width:'52px', height:'52px', borderRadius:'13px', background:'rgba(124,58,237,0.15)', border:`1px solid ${ACCENT}55`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px' }}>🏪</div>
              <div style={{ flex:1, minWidth:'180px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap', marginBottom:'4px' }}>
                  <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', color:'white' }}>{d.name}</span>
                  <span style={{ fontSize:'10px', fontWeight:'800', color: d.is_active ? '#6EE7B7' : '#FCA5A5', background: d.is_active ? 'rgba(16,185,129,0.12)':'rgba(239,68,68,0.12)', borderRadius:'100px', padding:'2px 9px' }}>{d.is_active ? 'نشط' : 'معلّق'}</span>
                  <span style={{ fontSize:'10px', fontWeight:'800', color:'#C4B5FD', background:'rgba(124,58,237,0.12)', borderRadius:'100px', padding:'2px 9px' }}>{d.subscription_plan || '—'}</span>
                </div>
                <div style={{ fontSize:'12px', color:MUTED, display:'flex', gap:'10px', flexWrap:'wrap' }}>
                  <span style={{ direction:'ltr' }}>/{d.slug}</span>
                  {d.owner_email && <span style={{ direction:'ltr' }}>· {d.owner_email}</span>}
                  {d.phone && <span style={{ direction:'ltr' }}>· {d.phone}</span>}
                </div>
              </div>
            </div>

            {/* مقاييس */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:'12px', marginBottom:'12px' }}>
              {[
                { label:'الطلبات', val: fmt(d.orders_total), sub:`${fmt(d.orders_30d)} آخر 30ي` },
                { label:'الإيراد (مكتمل)', val:`${fmt(d.revenue_total)} ﷼` },
                { label:'العملاء', val: fmt(d.customers_count) },
                { label:'الفروع', val: fmt(d.branches_count) },
              ].map(k => (
                <div key={k.label} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:'14px', padding:'14px' }}>
                  <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'19px', color:'white', marginBottom:'2px' }}>{k.val}</div>
                  <div style={{ fontSize:'12px', color:'#D1D5DB', fontWeight:'700' }}>{k.label}</div>
                  {k.sub && <div style={{ fontSize:'10.5px', color:MUTED, marginTop:'3px' }}>{k.sub}</div>}
                </div>
              ))}
            </div>

            {/* إجراءات الإدارة (super_admin فقط) */}
            {canManage && (
              <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:'14px', padding:'16px', marginBottom:'12px' }}>
                <div style={{ fontSize:'13px', fontWeight:'800', color:'white', fontFamily:'Cairo,sans-serif', marginBottom:'12px' }}>⚙️ إجراءات الإدارة</div>
                <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'center' }}>
                  <button onClick={askToggleActive} disabled={busy} style={{ padding:'10px 16px', borderRadius:'11px', border:'none', cursor:'pointer', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12.5px', color:'white', background: d.is_active ? '#B91C1C' : '#059669' }}>
                    {d.is_active ? '⏸ تعليق المطعم' : '▶ تفعيل المطعم'}
                  </button>
                  <span style={{ width:'1px', height:'26px', background:BORDER }}/>
                  <select value={planSel} onChange={e => setPlanSel(e.target.value)} style={{ background:'#0B0D12', border:`1px solid ${BORDER}`, color:'white', borderRadius:'10px', padding:'9px 12px', fontFamily:'Tajawal,sans-serif', fontSize:'13px' }}>
                    {[...new Set([...(d.subscription_plan ? [d.subscription_plan] : []), ...PLAN_OPTIONS])].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button onClick={askApplyPlan} disabled={busy || !planSel || planSel === d.subscription_plan}
                    style={{ padding:'9px 14px', borderRadius:'10px', border:`1px solid ${ACCENT}`, background:'transparent', color:'#C4B5FD', cursor:'pointer', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12.5px', opacity: (!planSel || planSel === d.subscription_plan) ? 0.5 : 1 }}>
                    تطبيق الخطة
                  </button>
                </div>
              </div>
            )}

            {/* الفروع */}
            <Section title={`🏢 الفروع (${(d.branches||[]).length})`}>
              {(d.branches||[]).length === 0 ? <div style={{ color:MUTED, fontSize:'12px' }}>لا فروع</div> : (
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {d.branches.map(b => (
                    <div key={b.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 0', borderBottom:`1px solid ${BORDER}` }}>
                      <span>{b.is_primary ? '🏠' : '🏢'}</span>
                      <span style={{ flex:1, fontSize:'13px', fontWeight:'700', color:'white' }}>{b.name}</span>
                      {b.address && <span style={{ fontSize:'11px', color:MUTED }}>{b.address}</span>}
                      <span style={{ fontSize:'10px', fontWeight:'800', color: b.is_active ? '#6EE7B7' : '#FCA5A5' }}>{b.is_active ? (b.is_paused ? 'موقوف مؤقتاً' : 'نشط') : 'معطّل'}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'12px' }}>
              {/* مخطّط الطلبات */}
              <Section title="📈 الطلبات — آخر 14 يوماً">
                {daily.length === 0 ? <div style={{ color:MUTED, fontSize:'12px' }}>لا بيانات</div> : (
                  <div style={{ display:'flex', alignItems:'flex-end', gap:'5px', height:'110px' }}>
                    {daily.map((x,i) => (
                      <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', height:'100%', justifyContent:'flex-end' }}>
                        <div style={{ fontSize:'9px', color:MUTED }}>{num(x.orders) || ''}</div>
                        <div title={x.d} style={{ width:'100%', borderRadius:'4px 4px 0 0', background: i===daily.length-1 ? ACCENT : 'rgba(124,58,237,0.4)', height:`${Math.max((num(x.orders)/maxOrders)*88, num(x.orders)>0?6:0)}%` }}/>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* الأصناف الأكثر */}
              <Section title="🏆 الأكثر طلباً">
                {(d.top_products||[]).length === 0 ? <div style={{ color:MUTED, fontSize:'12px' }}>لا بيانات</div> : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
                    {d.top_products.map((p,i) => (
                      <div key={p.name+i} style={{ display:'flex', justifyContent:'space-between', gap:'8px' }}>
                        <span style={{ fontSize:'12.5px', color:'#D1D5DB', fontWeight:'700', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
                        <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', color:'white', fontSize:'13px' }}>{fmt(p.count)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          </div>
        )}

        {/* نافذة تأكيد الإجراء */}
        {confirm && (
          <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
            <div onClick={() => !busy && setConfirm(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.65)' }}/>
            <div style={{ position:'relative', background:CARD, border:`1px solid ${BORDER}`, borderRadius:'16px', padding:'20px', maxWidth:'360px', width:'100%' }}>
              <div style={{ fontSize:'15px', fontWeight:'900', color:'white', fontFamily:'Cairo,sans-serif', marginBottom:'8px' }}>{confirm.title}</div>
              <div style={{ fontSize:'13px', color:MUTED, lineHeight:1.7, marginBottom:'18px' }}>{confirm.msg}</div>
              <div style={{ display:'flex', gap:'10px' }}>
                <button onClick={runConfirm} disabled={busy} style={{ flex:1, padding:'11px', borderRadius:'11px', border:'none', background:ACCENT, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', cursor:'pointer' }}>{busy ? '…' : 'تأكيد'}</button>
                <button onClick={() => setConfirm(null)} disabled={busy} style={{ flex:1, padding:'11px', borderRadius:'11px', border:`1px solid ${BORDER}`, background:'transparent', color:'#D1D5DB', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}>إلغاء</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  )
}
