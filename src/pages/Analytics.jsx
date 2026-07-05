import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import { useBreakpoint } from '../hooks/useBreakpoint'

const PERIOD_DAYS = { week: 7, month: 30, quarter: 90 }
const STATUS_LABELS = { pending:'انتظار', preparing:'تحضير', ready:'جاهز', completed:'مكتمل', cancelled:'ملغي' }
const STATUS_COLORS = { pending:'#F59E0B', preparing:'#3B82F6', ready:'#10B981', completed:'#6B7280', cancelled:'#EF4444' }
const TYPE_LABELS = { dine_in:'محلي', takeaway:'سفري', delivery:'توصيل' }
const TYPE_COLORS = { dine_in:'#7C3AED', takeaway:'#F59E0B', delivery:'#0EA5E9' }

// نفكّ الضريبة من الإجمالي (شامل ض.ق.م 15%) — متوافق مع كل الطلبات
const breakdown = (o) => {
  const deliv = Number(o.delivery_fee) || 0
  const gross = Math.max(0, (Number(o.total) || 0) - deliv)
  const net = gross / 1.15
  return { total: Number(o.total) || 0, net, tax: gross - net, deliv }
}

export default function Analytics() {
  const navigate = useNavigate()
  const { user, restaurant, isOwner, membership } = useAuthStore()
  const branchLocked = !isOwner && membership?.branch_scope && membership.branch_scope !== 'all'
  const { isMobile, isDesktop } = useBreakpoint()
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('week')
  const [branches, setBranches] = useState([])
  const [branchFilter, setBranchFilter] = useState('all')
  const [raw, setRaw] = useState({ cur: [], prev: [] })

  useEffect(() => { if (restaurant) fetchBranches() }, [restaurant])
  useEffect(() => { if (restaurant) fetchAnalytics() }, [restaurant, period])

  const fetchBranches = async () => {
    const { data } = await supabase.from('branches').select('id,name').eq('restaurant_id', restaurant.id).order('sort_order')
    if (data) setBranches(data)
  }

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const days = PERIOD_DAYS[period] || 7
      const now = new Date()
      const from = new Date(now); from.setDate(now.getDate() - days)
      const prevFrom = new Date(from); prevFrom.setDate(from.getDate() - days)
      const [{ data: cur }, { data: prev }] = await Promise.all([
        supabase.from('orders').select('*').eq('restaurant_id', restaurant.id).gte('created_at', from.toISOString()).order('created_at', { ascending: true }),
        supabase.from('orders').select('total,status,created_at,branch_id,delivery_fee').eq('restaurant_id', restaurant.id).gte('created_at', prevFrom.toISOString()).lt('created_at', from.toISOString()),
      ])
      setRaw({ cur: cur || [], prev: prev || [] })
    } finally { setLoading(false) }
  }

  const go = (path, state) => navigate(path, state ? { state } : undefined)

  // ===== الحسابات =====
  const inBranch = (o) => branchFilter === 'all' ? true : branchFilter === '__none__' ? !o.branch_id : o.branch_id === branchFilter
  const orders = raw.cur.filter(inBranch)
  const prevOrders = raw.prev.filter(inBranch)
  const completed = orders.filter(o => o.status === 'completed')
  const cancelled = orders.filter(o => o.status === 'cancelled')

  const revenue = completed.reduce((s, o) => s + (Number(o.total) || 0), 0)
  const netSales = completed.reduce((s, o) => s + breakdown(o).net, 0)
  const taxCollected = completed.reduce((s, o) => s + breakdown(o).tax, 0)
  const prevRevenue = prevOrders.filter(o => o.status === 'completed').reduce((s, o) => s + (Number(o.total) || 0), 0)
  const totalOrders = orders.length
  const prevTotalOrders = prevOrders.length
  const avgOrder = completed.length > 0 ? revenue / completed.length : 0
  const completionRate = totalOrders > 0 ? Math.round((completed.length / totalOrders) * 100) : 0
  const cancelRate = totalOrders > 0 ? Math.round((cancelled.length / totalOrders) * 100) : 0
  const uniqueCustomers = new Set(orders.map(o => o.customer_phone).filter(Boolean)).size

  const growth = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 100) : (cur > 0 ? 100 : 0)
  const revGrowth = growth(revenue, prevRevenue)
  const ordGrowth = growth(totalOrders, prevTotalOrders)

  // متوسط وقت التحضير
  const prepList = completed.filter(o => o.updated_at).map(o => Math.max((new Date(o.updated_at) - new Date(o.created_at)) / 60000, 0))
  const avgPrep = prepList.length ? Math.round(prepList.reduce((a, b) => a + b, 0) / prepList.length) : null

  // مبيعات يومية
  const dailyMap = {}
  orders.forEach(o => {
    const day = new Date(o.created_at).toLocaleDateString('ar', { weekday:'short', day:'numeric' })
    if (!dailyMap[day]) dailyMap[day] = { revenue:0, orders:0 }
    dailyMap[day].orders++
    if (o.status === 'completed') dailyMap[day].revenue += (Number(o.total) || 0)
  })
  const dailyRevenue = Object.entries(dailyMap).map(([day, d]) => ({ day, ...d }))
  const maxRevenue = Math.max(...dailyRevenue.map(d => d.revenue), 1)

  // الحالة والنوع
  const statusMap = {}; orders.forEach(o => { statusMap[o.status] = (statusMap[o.status] || 0) + 1 })
  const typeRev = {}; completed.forEach(o => { const t = o.type || 'dine_in'; typeRev[t] = (typeRev[t] || 0) + (Number(o.total) || 0) })

  // حسب الفرع
  const branchRev = {}
  completed.forEach(o => { const k = o.branch_id || '__none__'; branchRev[k] = (branchRev[k] || 0) + (Number(o.total) || 0) })
  const branchName = (k) => k === '__none__' ? '🏠 الرئيسي' : (branches.find(b => b.id === k)?.name || 'فرع')

  // المنتجات
  const productMap = {}
  orders.forEach(o => (Array.isArray(o.items) ? o.items : []).forEach(it => {
    if (!productMap[it.name]) productMap[it.name] = { name:it.name, emoji:it.emoji||'🍽️', count:0, revenue:0 }
    productMap[it.name].count += it.qty || 1
    productMap[it.name].revenue += (it.price || 0) * (it.qty || 1)
  }))
  const productsArr = Object.values(productMap)
  const topProducts = [...productsArr].sort((a, b) => b.count - a.count).slice(0, 6)
  const bottomProducts = [...productsArr].sort((a, b) => a.count - b.count).slice(0, 3)

  // أسباب الإلغاء
  const reasonMap = {}; cancelled.forEach(o => { const r = o.cancel_reason || 'غير محدد'; reasonMap[r] = (reasonMap[r] || 0) + 1 })
  const reasons = Object.entries(reasonMap).sort((a, b) => b[1] - a[1])

  // ساعة الذروة
  const hourMap = {}; completed.forEach(o => { const h = new Date(o.created_at).getHours(); hourMap[h] = (hourMap[h] || 0) + 1 })
  const peakHour = Object.entries(hourMap).sort((a, b) => b[1] - a[1])[0]
  const peakHourLabel = peakHour ? `${peakHour[0]}:00 - ${(+peakHour[0]+1)}:00` : '—'

  const exportCSV = () => {
    const rows = [['اليوم', 'عدد الطلبات', 'المبيعات (شامل الضريبة)']]
    dailyRevenue.forEach(d => rows.push([d.day, d.orders, d.revenue.toFixed(2)]))
    rows.push([])
    rows.push(['إجمالي المبيعات', revenue.toFixed(2)])
    rows.push(['صافي المبيعات', netSales.toFixed(2)])
    rows.push(['ض.ق.م المحصّلة', taxCollected.toFixed(2)])
    rows.push(['عدد الطلبات', totalOrders])
    const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `analytics-${period}-${new Date().toISOString().split('T')[0]}.csv`; a.click()
  }

  const Card = ({ children, style }) => <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden', ...style }}>{children}</div>
  const CardHead = ({ children }) => <div style={{ padding:'14px 16px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>{children}</div>
  const Empty = ({ text='لا توجد بيانات بعد' }) => <div style={{ padding:'28px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>{text}</div>

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0F1117', color:'white', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,107,53,0.3)', borderTopColor:'#FF6B35', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      جارٍ تحميل التحليلات...
    </div>
  )

  const GrowthBadge = ({ v }) => (
    <span style={{ fontSize:'11px', fontWeight:'800', color: v >= 0 ? '#10B981' : '#EF4444' }}>{v >= 0 ? '▲' : '▼'} {Math.abs(v)}%</span>
  )

  return (
    <AppShell
      active="analytics"
      title="📊 التحليلات"
      actions={<>
        {branches.length > 0 && !branchLocked && (
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} style={{ padding:'6px 10px', borderRadius:'8px', border:'1.5px solid #E5E7EB', fontFamily:'Tajawal,sans-serif', fontSize:'12px', fontWeight:'700', color:'#374151', cursor:'pointer', background:'white' }}>
            <option value="all">🏢 كل الفروع</option>
            <option value="__none__">🏠 الرئيسي</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {[{ key:'week', label:'7 أيام' }, { key:'month', label:'30 يوم' }, { key:'quarter', label:'90 يوم' }].map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)} style={{ padding:'6px 12px', borderRadius:'8px', border:`1.5px solid ${period===p.key?'#FF6B35':'#E5E7EB'}`, background: period===p.key?'#FFF0EB':'white', color: period===p.key?'#FF6B35':'#374151', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>{p.label}</button>
        ))}
        <button onClick={exportCSV} title="تصدير CSV" style={{ padding:'6px 10px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>⬇️ تصدير</button>
      </>}
    >
        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding: isDesktop?'24px':'16px', background:'#F8F9FB' }}>
          <div style={{ maxWidth: isDesktop?'1160px':'100%', margin:'0 auto' }}>

            {/* البطاقات الرئيسية */}
            <div style={{ display:'grid', gridTemplateColumns: isMobile?'repeat(2,1fr)':'repeat(4,1fr)', gap: isMobile?'10px':'14px', marginBottom:'14px' }}>
              {[
                { icon:'💰', val:`${revenue.toFixed(2)} ﷼`, label:'إجمالي المبيعات', sub:<GrowthBadge v={revGrowth} />, color:'#FF6B35', bg:'rgba(255,107,53,0.1)' },
                { icon:'🛒', val:totalOrders, label:'عدد الطلبات', sub:<GrowthBadge v={ordGrowth} />, color:'#3B82F6', bg:'rgba(59,130,246,0.1)' },
                { icon:'🧾', val:`${Math.round(avgOrder)} ﷼`, label:'متوسط الطلب', sub:`إتمام ${completionRate}%`, color:'#10B981', bg:'rgba(16,185,129,0.1)' },
                { icon:'🏛️', val:`${taxCollected.toFixed(2)} ﷼`, label:'ض.ق.م المحصّلة', sub:`صافي ${Math.round(netSales)} ﷼`, color:'#8B5CF6', bg:'rgba(139,92,246,0.1)' },
              ].map(s => (
                <div key={s.label} style={{ background:'white', borderRadius:'14px', border:'1px solid #E5E7EB', padding: isMobile?'14px':'18px' }}>
                  <div style={{ width:'36px', height:'36px', borderRadius:'10px', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', marginBottom:'10px' }}>{s.icon}</div>
                  <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize: isMobile?'18px':'22px', color:s.color, marginBottom:'3px', lineHeight:1.1 }}>{s.val}</div>
                  <div style={{ fontSize:'12px', color:'#374151', fontWeight:'700', marginBottom:'2px' }}>{s.label}</div>
                  <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* الرسم البياني */}
            <Card style={{ marginBottom:'14px' }}>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:'14px', fontWeight:'800' }}>📈 المبيعات اليومية</span>
                <span style={{ fontSize:'12px', color:'#9CA3AF' }}>شامل الضريبة · ريال</span>
              </div>
              <div style={{ padding:'16px' }}>
                {dailyRevenue.length > 0 ? (
                  <div style={{ display:'flex', alignItems:'flex-end', gap:'6px', height:'140px' }}>
                    {dailyRevenue.map((d, i) => (
                      <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', height:'100%', justifyContent:'flex-end' }}>
                        <div style={{ fontSize:'10px', color:'#9CA3AF', fontWeight:'700' }}>{d.revenue > 0 ? Math.round(d.revenue) : ''}</div>
                        <div style={{ width:'100%', borderRadius:'5px 5px 0 0', background: i === dailyRevenue.length-1 ? '#FF6B35' : 'rgba(255,107,53,0.35)', height:`${Math.max((d.revenue / maxRevenue) * 90, d.revenue > 0 ? 4 : 0)}%`, minHeight: d.revenue > 0 ? '4px' : '0', transition:'height 0.5s ease' }}/>
                        <div style={{ fontSize:'9px', color:'#9CA3AF', textAlign:'center', whiteSpace:'nowrap', overflow:'hidden', width:'100%', textOverflow:'ellipsis' }}>{d.day}</div>
                      </div>
                    ))}
                  </div>
                ) : <Empty />}
              </div>
            </Card>

            {/* صفّان جنب بعض على اللابتوب */}
            <div style={{ display:'grid', gridTemplateColumns: isDesktop?'1fr 1fr':'1fr', gap:'14px', marginBottom:'14px' }}>

              {/* أكثر الأصناف */}
              <Card>
                <CardHead>🏆 أكثر الأصناف طلباً</CardHead>
                {topProducts.length === 0 ? <Empty /> : (
                  <div style={{ padding:'12px' }}>
                    {topProducts.map((p, i) => {
                      const pct = Math.round((p.count / (topProducts[0]?.count || 1)) * 100)
                      const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣']
                      return (
                        <div key={p.name} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 0', borderBottom: i < topProducts.length-1 ? '1px solid #F3F4F6':'none' }}>
                          <span style={{ fontSize:'16px', flexShrink:0 }}>{medals[i]}</span>
                          <span style={{ fontSize:'20px', flexShrink:0 }}>{p.emoji}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:'13px', fontWeight:'700', marginBottom:'4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                            <div style={{ height:'6px', background:'#F3F4F6', borderRadius:'3px', overflow:'hidden' }}><div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#FF6B35,#FF9F6B)', borderRadius:'3px' }}/></div>
                          </div>
                          <div style={{ textAlign:'left', flexShrink:0 }}>
                            <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', color:'#FF6B35' }}>{p.count}</div>
                            <div style={{ fontSize:'10px', color:'#9CA3AF' }}>{Math.round(p.revenue)} ﷼</div>
                          </div>
                        </div>
                      )
                    })}
                    {bottomProducts.length > 0 && (
                      <div style={{ marginTop:'10px', paddingTop:'10px', borderTop:'1px dashed #E5E7EB', fontSize:'11px', color:'#9CA3AF' }}>
                        📉 الأقل طلباً: {bottomProducts.map(p => `${p.name} (${p.count})`).join('، ')}
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* حسب النوع + الفرع */}
              <Card>
                <CardHead>🍽️ المبيعات حسب النوع</CardHead>
                <div style={{ padding:'12px' }}>
                  {Object.keys(TYPE_LABELS).filter(t => typeRev[t]).length === 0 ? <Empty /> : Object.keys(TYPE_LABELS).map(t => {
                    const val = typeRev[t] || 0
                    if (!val) return null
                    const pct = revenue > 0 ? Math.round((val / revenue) * 100) : 0
                    return (
                      <div key={t} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 0', borderBottom:'1px solid #F3F4F6' }}>
                        <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:TYPE_COLORS[t], flexShrink:0 }}/>
                        <span style={{ fontSize:'13px', fontWeight:'600', flex:1 }}>{TYPE_LABELS[t]}</span>
                        <div style={{ flex:2 }}><div style={{ height:'6px', background:'#F3F4F6', borderRadius:'3px', overflow:'hidden' }}><div style={{ height:'100%', width:`${pct}%`, background:TYPE_COLORS[t], borderRadius:'3px' }}/></div></div>
                        <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', minWidth:'54px', textAlign:'left' }}>{Math.round(val)} ﷼</span>
                      </div>
                    )
                  })}
                  {branches.length > 0 && branchFilter === 'all' && Object.keys(branchRev).length > 0 && (
                    <div style={{ marginTop:'12px', paddingTop:'10px', borderTop:'1px dashed #E5E7EB' }}>
                      <div style={{ fontSize:'12px', fontWeight:'800', color:'#374151', marginBottom:'8px' }}>🏢 حسب الفرع</div>
                      {Object.entries(branchRev).sort((a,b)=>b[1]-a[1]).map(([k, v]) => (
                        <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', padding:'4px 0' }}>
                          <span style={{ color:'#6B7280' }}>{branchName(k)}</span>
                          <span style={{ fontWeight:'800' }}>{Math.round(v)} ﷼</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* الحالة + أسباب الإلغاء */}
            <div style={{ display:'grid', gridTemplateColumns: isDesktop?'1fr 1fr':'1fr', gap:'14px', marginBottom:'14px' }}>
              <Card>
                <CardHead>📋 الطلبات حسب الحالة</CardHead>
                <div style={{ padding:'12px' }}>
                  {totalOrders === 0 ? <Empty /> : Object.keys(STATUS_LABELS).map(st => {
                    const count = statusMap[st] || 0
                    if (!count) return null
                    const pct = Math.round((count / totalOrders) * 100)
                    return (
                      <div key={st} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 0', borderBottom:'1px solid #F3F4F6' }}>
                        <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:STATUS_COLORS[st], flexShrink:0 }}/>
                        <span style={{ fontSize:'13px', fontWeight:'600', flex:1 }}>{STATUS_LABELS[st]}</span>
                        <div style={{ flex:2 }}><div style={{ height:'6px', background:'#F3F4F6', borderRadius:'3px', overflow:'hidden' }}><div style={{ height:'100%', width:`${pct}%`, background:STATUS_COLORS[st], borderRadius:'3px' }}/></div></div>
                        <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', minWidth:'30px', textAlign:'left' }}>{count}</span>
                      </div>
                    )
                  })}
                </div>
              </Card>

              <Card>
                <CardHead>🚫 الإلغاء ({cancelRate}%)</CardHead>
                <div style={{ padding:'12px' }}>
                  {reasons.length === 0 ? <Empty text="لا توجد طلبات ملغاة 🎉" /> : reasons.map(([r, c]) => {
                    const pct = Math.round((c / cancelled.length) * 100)
                    return (
                      <div key={r} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 0', borderBottom:'1px solid #F3F4F6' }}>
                        <span style={{ fontSize:'13px', fontWeight:'600', flex:1 }}>{r}</span>
                        <div style={{ flex:2 }}><div style={{ height:'6px', background:'#F3F4F6', borderRadius:'3px', overflow:'hidden' }}><div style={{ height:'100%', width:`${pct}%`, background:'#EF4444', borderRadius:'3px' }}/></div></div>
                        <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', minWidth:'30px', textAlign:'left' }}>{c}</span>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </div>

            {/* ملخص */}
            <div style={{ background:'linear-gradient(135deg,#0F1117,#1A1A2E)', borderRadius:'16px', padding:'20px' }}>
              <div style={{ fontSize:'14px', fontWeight:'800', color:'white', marginBottom:'14px' }}>📊 ملخص الفترة</div>
              <div style={{ display:'grid', gridTemplateColumns: isMobile?'repeat(2,1fr)':'repeat(4,1fr)', gap:'12px' }}>
                {[
                  { label:'صافي المبيعات (قبل الضريبة)', val:`${Math.round(netSales)} ﷼` },
                  { label:'عملاء فريدون', val:uniqueCustomers },
                  { label:'متوسط وقت التحضير', val: avgPrep != null ? `${avgPrep} د` : '—' },
                  { label:'ساعة الذروة', val:peakHourLabel },
                ].map(s => (
                  <div key={s.label} style={{ background:'rgba(255,255,255,0.05)', borderRadius:'12px', padding:'12px' }}>
                    <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.5)', marginBottom:'4px' }}>{s.label}</div>
                    <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'17px', color:'#FF6B35' }}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
    </AppShell>
  )
}
