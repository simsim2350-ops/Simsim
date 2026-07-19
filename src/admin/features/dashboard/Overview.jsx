import { useEffect, useState } from 'react'
import AdminShell from '../../AdminShell'
import { platformOverview } from './dashboardApi'

const CARD = '#12141C', BORDER = 'rgba(255,255,255,0.08)', MUTED = '#9CA3AF', ACCENT = '#7C3AED'
const num = (v) => Number(v) || 0
const fmt = (v) => num(v).toLocaleString('en-US', { maximumFractionDigits: 0 })

// لوحة مؤشّرات المنصّة (M2). المقاييس عبر كل المطاعم عبر خدمة واحدة قابلة للاستبدال بجداول ملخّص عند التوسّع.
export default function Overview() {
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try { const data = await platformOverview(); if (!cancelled) setD(data) }
      catch (e) { if (!cancelled) setError(e?.message || 'تعذّر التحميل') }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  const kpis = d ? [
    { icon:'🏪', label:'المطاعم',        val: fmt(d.restaurants_total), sub:`${fmt(d.restaurants_active)} نشط · +${fmt(d.restaurants_new_30d)} جديد (30ي)` },
    { icon:'🧾', label:'الطلبات',        val: fmt(d.orders_total),      sub:`${fmt(d.orders_30d)} آخر 30ي · ${fmt(d.orders_today)} اليوم` },
    { icon:'💰', label:'إيراد المنصّة',  val: `${fmt(d.revenue_total)} ﷼`, sub:`${fmt(d.revenue_30d)} ﷼ آخر 30ي (مكتمل)` },
    { icon:'👥', label:'العملاء',        val: fmt(d.customers_total),   sub:'عبر كل المطاعم' },
  ] : []

  const daily = d?.daily || []
  const maxOrders = Math.max(...daily.map(x => num(x.orders)), 1)
  const plans = d?.plans ? Object.entries(d.plans) : []

  return (
    <AdminShell active="overview" title="نظرة عامة">
      <div style={{ padding:'20px', maxWidth:'1100px', margin:'0 auto' }}>
        {error ? (
          <div style={{ background:'#3B1113', border:'1px solid #7F1D1D', borderRadius:'12px', padding:'16px', color:'#FCA5A5', fontSize:'13px' }}>⚠️ {error}</div>
        ) : loading ? (
          <div style={{ color:MUTED, textAlign:'center', padding:'48px', fontSize:'13px' }}>جارٍ التحميل…</div>
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(210px, 1fr))', gap:'12px', marginBottom:'16px' }}>
              {kpis.map(k => (
                <div key={k.label} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:'14px', padding:'16px' }}>
                  <div style={{ width:'38px', height:'38px', borderRadius:'11px', background:'rgba(124,58,237,0.15)', border:`1px solid ${ACCENT}55`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', marginBottom:'10px' }}>{k.icon}</div>
                  <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'22px', color:'white', marginBottom:'3px' }}>{k.val}</div>
                  <div style={{ fontSize:'12.5px', color:'#D1D5DB', fontWeight:'700', marginBottom:'4px' }}>{k.label}</div>
                  <div style={{ fontSize:'11px', color:MUTED }}>{k.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'12px' }}>
              {/* مخطّط الطلبات اليومية (14ي) */}
              <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:'14px', padding:'16px', minWidth:0 }}>
                <div style={{ fontSize:'13px', fontWeight:'800', color:'white', fontFamily:'Cairo,sans-serif', marginBottom:'14px' }}>📈 الطلبات — آخر 14 يوماً</div>
                {daily.length === 0 ? <div style={{ color:MUTED, fontSize:'12px' }}>لا بيانات</div> : (
                  <div style={{ display:'flex', alignItems:'flex-end', gap:'5px', height:'120px' }}>
                    {daily.map((x, i) => (
                      <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', height:'100%', justifyContent:'flex-end' }}>
                        <div style={{ fontSize:'9px', color:MUTED }}>{num(x.orders) || ''}</div>
                        <div title={x.d} style={{ width:'100%', borderRadius:'4px 4px 0 0', background: i===daily.length-1 ? ACCENT : 'rgba(124,58,237,0.4)', height:`${Math.max((num(x.orders)/maxOrders)*90, num(x.orders)>0?6:0)}%` }}/>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* الخطط (اشتراكات) */}
              <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:'14px', padding:'16px' }}>
                <div style={{ fontSize:'13px', fontWeight:'800', color:'white', fontFamily:'Cairo,sans-serif', marginBottom:'14px' }}>💳 الخطط</div>
                {plans.length === 0 ? <div style={{ color:MUTED, fontSize:'12px' }}>لا بيانات</div> : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                    {plans.map(([plan, cnt]) => (
                      <div key={plan} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:'12.5px', color:'#D1D5DB', fontWeight:'700' }}>{plan}</span>
                        <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', color:'white', fontSize:'14px' }}>{fmt(cnt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  )
}
