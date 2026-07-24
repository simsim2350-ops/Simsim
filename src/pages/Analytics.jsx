import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { vatBreakdown } from '../lib/pricing'
import { fetchBranches } from '../lib/branchesApi'
import { exportRows, printReport, buildTable, stampName } from '../lib/exportUtils'

const PERIOD_DAYS = { week: 7, month: 30, quarter: 90 }
const STATUS_LABELS = { pending:'انتظار', preparing:'تحضير', ready:'جاهز', completed:'مكتمل', cancelled:'ملغي' }
const STATUS_COLORS = { pending:'#F59E0B', preparing:'#3B82F6', ready:'#10B981', completed:'#6B7280', cancelled:'#EF4444' }
const TYPE_LABELS = { dine_in:'محلي', takeaway:'سفري', delivery:'توصيل' }
const TYPE_COLORS = { dine_in:'#7C3AED', takeaway:'#F59E0B', delivery:'#0EA5E9' }

export default function Analytics() {
  const navigate = useNavigate()
  const { user, restaurant, isOwner, membership } = useAuthStore()
  const branchLocked = !isOwner && membership?.branch_scope && membership.branch_scope !== 'all'
  const { isMobile, isDesktop } = useBreakpoint()
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('week')
  const [branches, setBranches] = useState([])
  const [branchFilter, setBranchFilter] = useState('all')
  const [data, setData] = useState(null)   // ناتج التجميع الخادمي get_analytics_summary
  const [adv, setAdv] = useState(null)     // تحليلات متقدمة (ولاء/رضا/فروع/شكاوى) — ADR-39

  useEffect(() => { if (restaurant) fetchBranches(restaurant.id).then(setBranches).catch(() => {}) }, [restaurant])
  useEffect(() => { if (restaurant) fetchAnalytics() }, [restaurant, period, branchFilter])

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const days = PERIOD_DAYS[period] || 7
      const now = new Date()
      const from = new Date(now); from.setDate(now.getDate() - days)
      const prevFrom = new Date(from); prevFrom.setDate(from.getDate() - days)
      // التجميع في قاعدة البيانات (استدعاء واحد) بدل تنزيل كل طلبات الفترة للمتصفح.
      // فلتر الفرع أصبح معامل خادمي (إعادة جلب) — لا ننزّل بيانات كل الفروع لنفلترها محلياً.
      const branchParam = branchFilter === 'all' ? null : branchFilter
      const [{ data: j }, { data: a }] = await Promise.all([
        supabase.rpc('get_analytics_summary', {
          p_restaurant_id: restaurant.id,
          p_from: from.toISOString(),
          p_to: now.toISOString(),
          p_prev_from: prevFrom.toISOString(),
          p_prev_to: from.toISOString(),
          p_branch_id: branchParam,
        }),
        // تحليلات متقدمة (ولاء/رضا/أداء الفروع/شكاوى) — دالة منفصلة، لا تمسّ ما سبق
        supabase.rpc('get_advanced_analytics', {
          p_restaurant_id: restaurant.id,
          p_from: from.toISOString(),
          p_to: now.toISOString(),
          p_branch_id: branchParam,
        }),
      ])
      setData(j || null)
      setAdv(a || null)
    } finally { setLoading(false) }
  }

  const go = (path, state) => navigate(path, state ? { state } : undefined)

  // ===== الحسابات (من التجميع الخادمي get_analytics_summary) =====
  const d = data || {}
  const num = (v) => Number(v) || 0

  const revenue = num(d.revenue)
  // الضريبة تُفكّ عبر lib/pricing.js (ADR-1) من مجموع الأساس المحصّل خادمياً — يطابق جمع التفكيك لكل طلب
  const { net: netSales, tax: taxCollected } = vatBreakdown(num(d.completed_gross_sum))
  const prevRevenue = num(d.prev_revenue)
  const totalOrders = num(d.total_orders)
  const prevTotalOrders = num(d.prev_total_orders)
  const completedCount = num(d.completed_count)
  const cancelledCount = num(d.cancelled_count)
  const avgOrder = completedCount > 0 ? revenue / completedCount : 0
  const completionRate = totalOrders > 0 ? Math.round((completedCount / totalOrders) * 100) : 0
  const cancelRate = totalOrders > 0 ? Math.round((cancelledCount / totalOrders) * 100) : 0
  const uniqueCustomers = num(d.unique_customers)

  const growth = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 100) : (cur > 0 ? 100 : 0)
  const revGrowth = growth(revenue, prevRevenue)
  const ordGrowth = growth(totalOrders, prevTotalOrders)

  const avgPrep = d.avg_prep_minutes == null ? null : Math.round(num(d.avg_prep_minutes))

  // مبيعات يومية (التاريخ مُجمَّع بتوقيت الرياض في الخادم، والتسمية تُنسَّق هنا)
  const dailyRevenue = (d.daily || []).map(x => ({
    day: new Date(x.d + 'T00:00:00').toLocaleDateString('ar', { weekday:'short', day:'numeric' }),
    revenue: num(x.revenue), orders: num(x.orders),
  }))
  const maxRevenue = Math.max(...dailyRevenue.map(x => x.revenue), 1)

  const statusMap = d.status_counts || {}
  const typeRev = d.type_revenue || {}
  const branchRev = d.branch_revenue || {}
  const branchName = (id) => branches.find(b => b.id === id)?.name || 'فرع محذوف'

  const productsArr = (d.products || []).map(p => ({ name:p.name, emoji:p.emoji || '🍽️', count:num(p.count), revenue:num(p.revenue) }))
  const topProducts = [...productsArr].sort((a, b) => b.count - a.count).slice(0, 6)
  const bottomProducts = [...productsArr].sort((a, b) => a.count - b.count).slice(0, 3)

  const reasons = (d.cancel_reasons || []).map(x => [x.reason, num(x.count)])

  const hourMap = d.hours || {}
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

  // تقرير قابل للطباعة/الحفظ كـPDF — يشمل ملخّص الفترة والمؤشّرات المتقدمة (ADR-39/P3.2)
  // (تصدير CSV اليومي موجود أصلاً أعلاه — لم يُكرَّر)
  const printAnalytics = () => {
    const li = (adv && adv.loyalty_impact) || {}
    const sat = (adv && adv.satisfaction) || {}
    const bperf = (adv && Array.isArray(adv.branch_performance)) ? adv.branch_performance : []
    const creasons = (adv && Array.isArray(adv.complaint_reasons)) ? adv.complaint_reasons : []
    const kv = (items) => `<div class="kv">${items.map(i => `<div>${i.label}<b>${i.val}</b></div>`).join('')}</div>`
    const periodLabel = period === 'week' ? 'آخر 7 أيام' : period === 'month' ? 'آخر 30 يوماً' : 'آخر 90 يوماً'

    const sections = [
      { title:'ملخّص الفترة', html: kv([
        { label:'إجمالي المبيعات', val:`${Math.round(revenue)} ﷼` },
        { label:'صافي المبيعات', val:`${Math.round(netSales)} ﷼` },
        { label:'ض.ق.م المحصّلة', val:`${Math.round(taxCollected)} ﷼` },
        { label:'عدد الطلبات', val:totalOrders },
        { label:'مكتملة', val:completedCount },
        { label:'ملغاة', val:`${cancelledCount} (${cancelRate}٪)` },
        { label:'متوسط الطلب', val:`${Math.round(avgOrder)} ﷼` },
        { label:'عملاء فريدون', val:uniqueCustomers },
        { label:'ساعة الذروة', val:peakHourLabel },
      ]) },
      { title:'المبيعات اليومية', html: buildTable(dailyRevenue, [
        { key:'day', label:'اليوم' },
        { key:'orders', label:'الطلبات' },
        { key:'revenue', label:'المبيعات', format:v => `${Number(v).toFixed(2)} ﷼` },
      ]) },
      { title:'أفضل المنتجات', html: buildTable(topProducts, [
        { key:p => `${p.emoji} ${p.name}`, label:'الصنف' },
        { key:'count', label:'الكمية' },
        { key:'revenue', label:'الإيراد', format:v => `${Number(v).toFixed(2)} ﷼` },
      ]) },
    ]

    if (adv) {
      sections.push({ title:'تأثير الولاء على المبيعات', html: kv([
        { label:'حصّة الأعضاء من الإيراد', val:`${num(li.member_revenue_share)}٪` },
        { label:'طلبات الأعضاء', val:num(li.member_orders) },
        { label:'متوسط طلب العضو', val:`${Math.round(num(li.member_aov))} ﷼` },
        { label:'طلبات غير الأعضاء', val:num(li.nonmember_orders) },
        { label:'متوسط طلب غير العضو', val:`${Math.round(num(li.nonmember_aov))} ﷼` },
        { label:'فرق متوسط الطلب', val:`${num(li.aov_uplift_pct)}٪` },
      ]) })
      sections.push({ title:'رضا العملاء', html: kv([
        { label:'متوسط التقييم', val:`${num(sat.avg_rating)} / 5` },
        { label:'عدد التقييمات', val:num(sat.reviews_count) },
        { label:'راضون (4-5⭐)', val:`${num(sat.satisfied_pct)}٪` },
        { label:'ساخطون (1-2⭐)', val:`${num(sat.detractors_pct)}٪` },
        { label:'معدل العودة', val:`${num(adv.return_rate)}٪` },
      ]) })
      if (bperf.length > 0) sections.push({ title:'أداء الفروع', html: buildTable(bperf, [
        { key:b => `${b.is_primary ? '🏠' : '🏢'} ${b.name}`, label:'الفرع' },
        { key:'revenue', label:'الإيراد', format:v => `${Math.round(Number(v))} ﷼` },
        { key:'orders', label:'الطلبات' },
        { key:b => b.avg_rating == null ? '—' : `${b.avg_rating} ⭐`, label:'التقييم' },
        { key:'complaints', label:'شكاوى' },
      ]) })
      if (creasons.length > 0) sections.push({ title:'أسباب الشكاوى', html: buildTable(creasons, [
        { key:'category', label:'السبب' },
        { key:'count', label:'العدد' },
      ]) })
    }

    printReport({
      title: `تقرير التحليلات — ${restaurant?.name || ''}`,
      subtitle: `${periodLabel}${branchFilter !== 'all' ? ` · ${branchName(branchFilter)}` : ''} · ${new Date().toLocaleDateString('ar')}`,
      sections,
    })
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
            {branches.map(b => <option key={b.id} value={b.id}>{b.is_primary ? '🏠' : '🏢'} {b.name}</option>)}
          </select>
        )}
        {[{ key:'week', label:'7 أيام' }, { key:'month', label:'30 يوم' }, { key:'quarter', label:'90 يوم' }].map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)} style={{ padding:'6px 12px', borderRadius:'8px', border:`1.5px solid ${period===p.key?'#FF6B35':'#E5E7EB'}`, background: period===p.key?'#FFF0EB':'white', color: period===p.key?'#FF6B35':'#374151', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>{p.label}</button>
        ))}
        <button onClick={exportCSV} title="تصدير CSV" style={{ padding:'6px 10px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>⬇️ تصدير</button>
        <button onClick={printAnalytics} title="طباعة / حفظ كـPDF" style={{ padding:'6px 10px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>🖨️ تقرير</button>
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
                      {Object.entries(branchRev).sort((a,b)=>b[1]-a[1]).map(([id, v]) => (
                        <div key={id} style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', padding:'4px 0' }}>
                          <span style={{ color:'#6B7280' }}>{branchName(id)}</span>
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
                    const pct = Math.round((c / cancelledCount) * 100)
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

            {/* ===== تحليلات متقدمة (ولاء / رضا / فروع / شكاوى) ===== */}
            {adv && (() => {
              const li = adv.loyalty_impact || {}
              const sat = adv.satisfaction || {}
              const bperf = Array.isArray(adv.branch_performance) ? adv.branch_performance : []
              const creasons = Array.isArray(adv.complaint_reasons) ? adv.complaint_reasons : []
              const totalComplaints = creasons.reduce((s, x) => s + num(x.count), 0)
              const uplift = num(li.aov_uplift_pct)
              return (
                <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                  <div style={{ fontSize:'15px', fontWeight:'900', marginTop:'4px' }}>🎯 تحليلات متقدمة</div>

                  {/* تأثير الولاء على المبيعات */}
                  <Card>
                    <CardHead>💎 تأثير الولاء على المبيعات</CardHead>
                    <div style={{ padding:'14px 16px' }}>
                      <div style={{ display:'grid', gridTemplateColumns: isMobile?'repeat(2,1fr)':'repeat(4,1fr)', gap:'12px', marginBottom:'12px' }}>
                        {[
                          { label:'حصّة الأعضاء من الإيراد', val:`${num(li.member_revenue_share)}٪`, color:'#7C3AED' },
                          { label:'طلبات الأعضاء', val:num(li.member_orders), color:'#10B981' },
                          { label:'متوسط طلب العضو', val:`${Math.round(num(li.member_aov))} ﷼`, color:'#FF6B35' },
                          { label:'متوسط طلب غير العضو', val:`${Math.round(num(li.nonmember_aov))} ﷼`, color:'#6B7280' },
                        ].map(s => (
                          <div key={s.label} style={{ background:'#F8F9FB', borderRadius:'12px', padding:'12px' }}>
                            <div style={{ fontSize:'11px', color:'#9CA3AF', fontWeight:'700', marginBottom:'4px' }}>{s.label}</div>
                            <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', color:s.color }}>{s.val}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize:'12.5px', color: uplift >= 0 ? '#166534' : '#92400E', background: uplift >= 0 ? '#DCFCE7' : '#FEF3C7', borderRadius:'10px', padding:'10px 12px', lineHeight:1.7 }}>
                        {uplift >= 0
                          ? `متوسط طلب عضو الولاء أعلى بـ ${Math.abs(uplift)}٪ من غير الأعضاء — البرنامج يرفع قيمة السلة.`
                          : `متوسط طلب عضو الولاء أقل بـ ${Math.abs(uplift)}٪ من غير الأعضاء — البرنامج يرفع تكرار الطلب لا حجمه. فكّر بمكافآت تشجّع سلّة أكبر.`}
                      </div>
                    </div>
                  </Card>

                  <div style={{ display:'grid', gridTemplateColumns: isDesktop?'1fr 1fr':'1fr', gap:'14px' }}>
                    {/* رضا العملاء */}
                    <Card>
                      <CardHead>😊 رضا العملاء</CardHead>
                      <div style={{ padding:'14px 16px' }}>
                        {num(sat.reviews_count) === 0 ? <Empty text="لا توجد تقييمات في هذه الفترة" /> : (
                          <>
                            <div style={{ display:'flex', alignItems:'baseline', gap:'8px', marginBottom:'12px' }}>
                              <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'30px', color:'#F59E0B' }}>{num(sat.avg_rating)}</span>
                              <span style={{ fontSize:'13px', color:'#9CA3AF' }}>/ 5 · {num(sat.reviews_count)} تقييم</span>
                            </div>
                            {[
                              { label:'راضون (4-5 ⭐)', pct:num(sat.satisfied_pct), color:'#10B981' },
                              { label:'ساخطون (1-2 ⭐)', pct:num(sat.detractors_pct), color:'#EF4444' },
                            ].map(s => (
                              <div key={s.label} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
                                <span style={{ fontSize:'12.5px', fontWeight:'600', width:'110px', flexShrink:0 }}>{s.label}</span>
                                <div style={{ flex:1, height:'8px', background:'#F3F4F6', borderRadius:'100px', overflow:'hidden' }}>
                                  <div style={{ width:`${s.pct}%`, height:'100%', background:s.color, borderRadius:'100px' }}/>
                                </div>
                                <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', width:'46px', textAlign:'left' }}>{s.pct}٪</span>
                              </div>
                            ))}
                            <div style={{ marginTop:'12px', paddingTop:'12px', borderTop:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', fontSize:'12.5px' }}>
                              <span style={{ color:'#9CA3AF', fontWeight:'700' }}>معدل عودة العملاء (الفترة)</span>
                              <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', color:'#0891B2' }}>{num(adv.return_rate)}٪</span>
                            </div>
                          </>
                        )}
                      </div>
                    </Card>

                    {/* أسباب الشكاوى */}
                    <Card>
                      <CardHead>🚩 أكثر أسباب الشكاوى</CardHead>
                      <div style={{ padding:'14px 16px' }}>
                        {creasons.length === 0 ? <Empty text="لا توجد شكاوى 🎉" /> : creasons.map(r => {
                          const pct = totalComplaints > 0 ? Math.round((num(r.count) / totalComplaints) * 100) : 0
                          return (
                            <div key={r.category} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'7px 0' }}>
                              <span style={{ fontSize:'12.5px', fontWeight:'600', flex:1 }}>{r.category}</span>
                              <div style={{ flex:1.4, height:'6px', background:'#F3F4F6', borderRadius:'3px', overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${pct}%`, background:'#EF4444', borderRadius:'3px' }}/>
                              </div>
                              <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', minWidth:'26px', textAlign:'left' }}>{num(r.count)}</span>
                            </div>
                          )
                        })}
                        {creasons.some(r => r.category === 'غير مصنّف') && (
                          <div style={{ marginTop:'10px', fontSize:'11.5px', color:'#9CA3AF', lineHeight:1.6 }}>
                            صنّف الشكاوى من صفحة «الولاء والتقييمات» لتحليل أدقّ.
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>

                  {/* أداء الفروع */}
                  {bperf.length > 1 && (
                    <Card>
                      <CardHead>🏢 أداء الفروع (أفضل ← أسوأ)</CardHead>
                      <div style={{ padding:'6px 16px 14px', overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12.5px', minWidth:'420px' }}>
                          <thead>
                            <tr style={{ color:'#9CA3AF', fontSize:'11.5px', textAlign:'right' }}>
                              <th style={{ padding:'8px 4px', fontWeight:'700' }}>الفرع</th>
                              <th style={{ padding:'8px 4px', fontWeight:'700' }}>الإيراد</th>
                              <th style={{ padding:'8px 4px', fontWeight:'700' }}>الطلبات</th>
                              <th style={{ padding:'8px 4px', fontWeight:'700' }}>التقييم</th>
                              <th style={{ padding:'8px 4px', fontWeight:'700' }}>شكاوى</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bperf.map(b => (
                              <tr key={b.id} style={{ borderTop:'1px solid #F3F4F6' }}>
                                <td style={{ padding:'10px 4px', fontWeight:'700' }}>{b.is_primary ? '🏠' : '🏢'} {b.name}</td>
                                <td style={{ padding:'10px 4px', fontFamily:'Cairo,sans-serif', fontWeight:'800', color:'#FF6B35' }}>{Math.round(num(b.revenue))} ﷼</td>
                                <td style={{ padding:'10px 4px' }}>{num(b.orders)}</td>
                                <td style={{ padding:'10px 4px', color:'#F59E0B', fontWeight:'700' }}>{b.avg_rating == null ? '—' : `${num(b.avg_rating)} ⭐`}</td>
                                <td style={{ padding:'10px 4px', color: num(b.complaints) > 0 ? '#EF4444' : '#9CA3AF', fontWeight:'700' }}>{num(b.complaints)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                </div>
              )
            })()}

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
