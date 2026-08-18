import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { vatBreakdown } from '../lib/pricing'
import { fetchBranches } from '../lib/branchesApi'
import { exportRows, printReport, buildTable, stampName } from '../lib/exportUtils'

const PERIOD_DAYS = { today: 1, week: 7, month: 30, quarter: 90 }
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
  const [error, setError] = useState(null)
  const [period, setPeriod] = useState('week')
  const [chartMetric, setChartMetric] = useState('revenue')
  const [branches, setBranches] = useState([])
  const [branchFilter, setBranchFilter] = useState('all')
  const [data, setData] = useState(null)   // ناتج التجميع الخادمي get_analytics_summary
  const [adv, setAdv] = useState(null)     // تحليلات متقدمة (ولاء/رضا/فروع/شكاوى) — ADR-39
  const [advancedError, setAdvancedError] = useState(false)

  useEffect(() => { if (restaurant) fetchBranches(restaurant.id).then(setBranches).catch(() => {}) }, [restaurant])
  useEffect(() => { if (restaurant) fetchAnalytics() }, [restaurant, period, branchFilter])

  const fetchAnalytics = async () => {
    if (!restaurant) return
    setLoading(true)
    setError(null)
    setAdvancedError(false)
    try {
      const days = PERIOD_DAYS[period] || 7
      const now = new Date()
      const from = new Date(now); from.setDate(now.getDate() - days)
      const prevFrom = new Date(from); prevFrom.setDate(from.getDate() - days)
      // التجميع في قاعدة البيانات (استدعاء واحد) بدل تنزيل كل طلبات الفترة للمتصفح.
      // فلتر الفرع أصبح معامل خادمي (إعادة جلب) — لا ننزّل بيانات كل الفروع لنفلترها محلياً.
      const branchParam = branchFilter === 'all' ? null : branchFilter
      const [summaryResult, advancedResult] = await Promise.all([
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
      if (summaryResult.error) throw summaryResult.error
      setData(summaryResult.data || null)
      setAdvancedError(Boolean(advancedResult.error))
      setAdv(advancedResult.error ? null : (advancedResult.data || null))
    } catch (e) {
      setError(e)
      setData(null)
      setAdv(null)
      setAdvancedError(false)
    } finally { setLoading(false) }
  }

  const go = (path, state) => navigate(path, state ? { state } : undefined)

  // ===== الحسابات (من التجميع الخادمي get_analytics_summary) =====
  const d = data || {}
  const num = (v) => Number(v) || 0
  const money = (v, decimals=2) => `${num(v).toLocaleString('ar-SA', { minimumFractionDigits:decimals, maximumFractionDigits:decimals })} ر.س`
  const money0 = (v) => money(v, 0)

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
  const hasRevenueData = revenue > 0
  const periodLabel = period === 'today' ? 'اليوم' : period === 'week' ? 'آخر 7 أيام' : period === 'month' ? 'آخر 30 يومًا' : 'آخر 90 يومًا'

  const rawAvgPrep = d.avg_prep_minutes == null ? null : num(d.avg_prep_minutes)
  const avgPrep = rawAvgPrep != null && rawAvgPrep >= 0 && rawAvgPrep <= 24 * 60 ? Math.round(rawAvgPrep) : null

  // مبيعات يومية (التاريخ مُجمَّع بتوقيت الرياض في الخادم، والتسمية تُنسَّق هنا)
  const dailyRevenue = (d.daily || []).map(x => ({
    day: new Date(x.d + 'T00:00:00').toLocaleDateString('ar', { weekday:'short', day:'numeric' }),
    revenue: num(x.revenue), orders: num(x.orders), avg: num(x.orders) > 0 ? num(x.revenue) / num(x.orders) : 0,
  }))
  const chartMetricLabel = chartMetric === 'orders' ? 'الطلبات' : chartMetric === 'avg' ? 'متوسط الطلب' : 'المبيعات'
  const chartValue = point => chartMetric === 'orders' ? point.orders : chartMetric === 'avg' ? point.avg : point.revenue
  const maxRevenue = Math.max(...dailyRevenue.map(chartValue), 1)

  const statusMap = d.status_counts || {}
  const statusEntries = Object.entries(statusMap).filter(([, value]) => num(value) > 0)
  const typeRev = d.type_revenue || {}
  const typeEntries = Object.entries(typeRev).filter(([, value]) => num(value) > 0)
  const typeRevenueTotal = typeEntries.reduce((sum, [, value]) => sum + num(value), 0)
  const branchRev = d.branch_revenue || {}
  const branchName = (id) => branches.find(b => b.id === id)?.name || 'فرع محذوف'

  const productsArr = (d.products || []).map(p => ({ name:p.name, emoji:p.emoji || '🍽️', count:num(p.count), revenue:num(p.revenue) }))
  const productRevenueTotal = productsArr.reduce((sum, p) => sum + p.revenue, 0)
  const topProducts = [...productsArr].sort((a, b) => b.count - a.count).slice(0, 6)
  const bottomProducts = [...productsArr].sort((a, b) => a.count - b.count).slice(0, 3)
  const reasons = (d.cancel_reasons || []).map(x => [x.reason, num(x.count)])
  const topProduct = topProducts[0]
  const bestDayMetricLabel = chartMetric === 'orders' ? 'الطلبات' : chartMetric === 'avg' ? 'متوسط الطلب' : 'المبيعات'
  const bestSalesDay = dailyRevenue.reduce((best, item) => chartValue(item) > (best ? chartValue(best) : 0) ? item : best, null)
  const unclassifiedCancellationCount = reasons.filter(([reason]) => ['غير محدد', 'غير مصنف', 'غير مُصنف'].includes(reason)).reduce((sum, [, count]) => sum + count, 0)
  const cancellationReasonTotal = reasons.reduce((sum, [, count]) => sum + count, 0)

  const hourMap = d.hours || {}
  const peakHour = Object.entries(hourMap).sort((a, b) => b[1] - a[1])[0]
  const peakHourLabel = peakHour ? `${String(peakHour[0]).padStart(2,'0')}:00 – ${String(+peakHour[0]+1).padStart(2,'0')}:00` : '—'

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
    const periodLabel = period === 'today' ? 'اليوم' : period === 'week' ? 'آخر 7 أيام' : period === 'month' ? 'آخر 30 يوماً' : 'آخر 90 يوماً'

    const sections = [
      { title:'ملخّص الفترة', html: kv([
        { label:'إجمالي المبيعات', val:money0(revenue) },
        { label:'صافي المبيعات', val:money0(netSales) },
        { label:'ض.ق.م المحصّلة', val:money0(taxCollected) },
        { label:'عدد الطلبات', val:totalOrders },
        { label:'مكتملة', val:completedCount },
        { label:'ملغاة', val:`${cancelledCount} (${cancelRate}٪)` },
        { label:'متوسط الطلب', val:completedCount > 0 ? money0(avgOrder) : '—' },
        { label:'عملاء فريدون', val:uniqueCustomers },
        { label:'ساعة الذروة', val:peakHourLabel },
      ]) },
      { title:'المبيعات اليومية', html: buildTable(dailyRevenue, [
        { key:'day', label:'اليوم' },
        { key:'orders', label:'الطلبات' },
        { key:'revenue', label:'المبيعات', format:v => money(v) },
      ]) },
      { title:'أفضل المنتجات', html: buildTable(topProducts, [
        { key:p => `${p.emoji} ${p.name}`, label:'الصنف' },
        { key:'count', label:'الكمية' },
        { key:'revenue', label:'الإيراد', format:v => money(v) },
      ]) },
    ]

    if (adv) {
      sections.push({ title:'تأثير الولاء على المبيعات', html: kv([
        { label:'حصّة الأعضاء من الإيراد', val:`${num(li.member_revenue_share)}٪` },
        { label:'طلبات الأعضاء', val:num(li.member_orders) },
        { label:'متوسط طلب العضو', val:money0(li.member_aov) },
        { label:'طلبات غير الأعضاء', val:num(li.nonmember_orders) },
        { label:'متوسط طلب غير العضو', val:money0(li.nonmember_aov) },
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
        { key:'revenue', label:'الإيراد', format:v => money0(v) },
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

  const Icon = ({ type, size=15 }) => {
    const paths = { chart:'M3 17l4-5 3 3 5-7 4 4', download:'M12 3v12m0 0l-4-4m4 4l4-4M5 21h14', report:'M6 3h9l3 3v15H6zM9 12h6M9 16h6M9 8h3', menu:'M4 6h16M4 12h16M4 18h16', branch:'M4 20V4h16v16M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2', calendar:'M6 3v4m12-4v4M4 9h16M5 5h14a1 1 0 011 1v14H4V6a1 1 0 011-1z', warning:'M12 3l9 17H3L12 3zm0 6v4m0 3h.01' }
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[type] || paths.chart}/></svg>
  }
  const PageTitle = <span style={{ display:'inline-flex', alignItems:'center', gap:'10px', minWidth:0 }}><span style={{ width:'46px', height:'46px', borderRadius:'13px', display:'grid', placeItems:'center', color:'#FF6A00', background:'linear-gradient(145deg,#FFF0EB,#FFE3D2)', border:'1px solid #FFD4BE', flexShrink:0 }}><Icon type="chart" size={21}/></span><span style={{ display:'flex', flexDirection:'column', gap:'3px', minWidth:0 }}><strong style={{ fontSize:isMobile?'17px':'20px', fontWeight:'900', letterSpacing:'-0.02em' }}>التحليلات</strong><small style={{ fontSize:isMobile?'10px':'11px', color:'#6B7280', fontWeight:'600', whiteSpace:'nowrap' }}>رؤية عملية لاتخاذ قرارات أفضل</small></span></span>
  const Card = ({ children, style }) => <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden', ...style }}>{children}</div>
  const CardHead = ({ children }) => <div style={{ padding:'14px 16px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>{children}</div>
  const Empty = ({ title='لا توجد بيانات بعد', text, action, onAction }) => <div style={{ padding:isMobile?'18px 12px':'24px 18px', textAlign:'center', color:'#9CA3AF', fontSize:'12px' }}><div style={{ width:'32px', height:'32px', borderRadius:'10px', background:'#F8F9FB', display:'grid', placeItems:'center', margin:'0 auto 8px', color:'#9CA3AF' }}>∅</div><strong style={{ display:'block', color:'#374151', fontSize:'12px', marginBottom:'4px' }}>{title}</strong><span>{text || 'ستظهر البيانات هنا بعد توفر نشاط كافٍ خلال الفترة.'}</span>{action && <button onClick={onAction} style={{ display:'block', margin:'10px auto 0', border:0, background:'transparent', color:'#FF6A00', fontFamily:'Tajawal,sans-serif', fontSize:'12px', fontWeight:'800', cursor:'pointer' }}>{action} →</button>}</div>
  const ErrorState = () => <div style={{ padding:'24px 18px', textAlign:'center', color:'#B91C1C', fontSize:'12px' }}><strong style={{ display:'block', color:'#7F1D1D', marginBottom:'5px' }}>تعذر تحميل البيانات</strong><span style={{ display:'block', marginBottom:'10px' }}>حاول مرة أخرى.</span><button onClick={fetchAnalytics} style={{ border:'1px solid #FECACA', background:'#FFF7F7', color:'#B91C1C', borderRadius:'8px', padding:'7px 12px', fontFamily:'Tajawal,sans-serif', fontWeight:'800', cursor:'pointer' }}>إعادة المحاولة</button></div>
  const Skeleton = ({ height='90px' }) => <div style={{ height, borderRadius:'12px', background:'linear-gradient(90deg,#F3F4F6 25%,#FAFAFA 37%,#F3F4F6 63%)', backgroundSize:'400% 100%', animation:'analytics-shimmer 1.4s ease infinite' }} />

  if (loading) return (
    <AppShell active="analytics" title="التحليلات">
      <div style={{ padding:isMobile?'16px':'24px', background:'#F8F9FB', minHeight:'100%', fontFamily:'Tajawal,sans-serif' }}><div style={{ maxWidth:'1160px', margin:'0 auto' }}><style>{`@keyframes analytics-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}`}</style><Skeleton height="56px" /><div style={{ display:'grid', gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(4,1fr)', gap:'12px', margin:'14px 0' }}>{[1,2,3,4].map(i => <Skeleton key={i} height="118px" />)}</div><Skeleton height="230px" /><div style={{ display:'grid', gridTemplateColumns:isMobile?'1fr':'1fr 1fr', gap:'14px', marginTop:'14px' }}>{[1,2].map(i => <Skeleton key={i} height="180px" />)}</div></div></div>
    </AppShell>
  )

  const GrowthBadge = ({ v, currentValue, previousValue }) => previousValue > 0 ? (
    <span style={{ fontSize:'11px', fontWeight:'800', color: v >= 0 ? '#10B981' : '#EF4444' }}>{v >= 0 ? '▲' : '▼'} {Math.abs(v)}% · مقارنة بالفترة السابقة</span>
  ) : currentValue > 0 ? <span style={{ fontSize:'11px', color:'#6B7280', fontWeight:'800' }}>بيانات جديدة</span> : <span style={{ fontSize:'11px', color:'#9CA3AF' }}>لا توجد مقارنة سابقة</span>

  return (
    <AppShell
      active="analytics"
      title={PageTitle}
      headerStacked
      actions={<div style={{ display:'flex', flexDirection:isMobile?'column':'row', alignItems:isMobile?'stretch':'center', gap:isMobile?'12px':'10px', width:'100%' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'6px', flexShrink:0 }}>
          {branches.length > 0 && !branchLocked ? <label style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'8px 10px', border:'1px solid #E5E7EB', borderRadius:'10px', background:'#FAFAFA', color:'#374151' }}><Icon type="branch" size={13}/><select aria-label="نطاق الفروع" value={branchFilter} onChange={e => setBranchFilter(e.target.value)} style={{ border:0, outline:0, background:'transparent', fontFamily:'Tajawal,sans-serif', fontSize:'12px', fontWeight:'800', color:'#374151', cursor:'pointer' }}><option value="all">كل الفروع</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label> : <span style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'8px 10px', border:'1px solid #E5E7EB', borderRadius:'10px', background:'#FAFAFA', color:'#6B7280', fontSize:'11px' }}><Icon type="branch" size={13}/> نطاق الفرع المحدد</span>}
          <span style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'8px 10px', border:'1px solid #E5E7EB', borderRadius:'10px', background:'#FAFAFA', color:'#374151', fontSize:'11px', fontWeight:'800', whiteSpace:'nowrap' }}><Icon type="calendar" size={13}/> {periodLabel}</span>
        </div>
        <div role="group" aria-label="الفترة الزمنية" style={{ display:'flex', alignItems:'center', gap:'2px', padding:'3px', overflowX:'auto', border:'1px solid #E5E7EB', background:'#F5F5F5', borderRadius:'12px', flex: isMobile?'none':'0 1 auto' }}>{[{ key:'today', label:'اليوم' }, { key:'week', label:'7 أيام' }, { key:'month', label:'30 يوم' }, { key:'quarter', label:'90 يوم' }].map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)} aria-pressed={period===p.key} style={{ minWidth:isMobile?'62px':'66px', minHeight:'34px', padding:'6px 10px', borderRadius:'9px', border:0, background: period===p.key?'#FF6A00':'transparent', color: period===p.key?'white':'#6B7280', fontFamily:'Tajawal,sans-serif', fontWeight:period===p.key?'900':'700', fontSize:'11px', cursor:'pointer', whiteSpace:'nowrap' }}>{p.label}</button>
        ))}</div>
        <div style={{ display:'flex', alignItems:'center', gap:'5px', marginRight:isMobile?'0':'auto', flexShrink:0 }}><button onClick={exportCSV} title="تصدير CSV" style={{ minHeight:'38px', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'5px', padding:'7px 12px', borderRadius:'10px', border:'1px solid #E5E7EB', background:'white', color:'#374151', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer' }}><Icon type="download" size={14}/> تصدير</button>
        <button onClick={printAnalytics} title="طباعة / حفظ كـPDF" style={{ minHeight:'38px', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'5px', padding:'7px 13px', borderRadius:'10px', border:'1px solid #FF6A00', background:'#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'12px', cursor:'pointer' }}><Icon type="report" size={14}/> تقرير</button></div>
      </div>}
    >
        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding: isDesktop?'24px':'16px', background:'#F8F9FB' }}>
          <div style={{ maxWidth: isDesktop?'1160px':'100%', margin:'0 auto' }}>
            {error ? <Card><ErrorState /></Card> : <>


            {/* البطاقات الرئيسية */}
            <div style={{ display:'grid', gridTemplateColumns: isMobile?'repeat(2,1fr)':isDesktop?'repeat(6,1fr)':'repeat(3,1fr)', gap: isMobile?'10px':'12px', marginBottom:'14px' }}>
              {[
                { icon:'💰', val:money(revenue), label:'إجمالي المبيعات', sub:<GrowthBadge v={revGrowth} currentValue={revenue} previousValue={prevRevenue} />, color:'#FF6A00', bg:'rgba(255,106,0,0.1)' },
                { icon:'🛒', val:totalOrders, label:'عدد الطلبات', sub:<GrowthBadge v={ordGrowth} currentValue={totalOrders} previousValue={prevTotalOrders} />, color:'#3B82F6', bg:'rgba(59,130,246,0.1)' },
                { icon:'🧾', val:completedCount > 0 ? money0(avgOrder) : '—', label:'متوسط الطلب', sub:completedCount > 0 ? 'من الطلبات المكتملة فقط' : 'لا توجد طلبات خلال الفترة', color:'#10B981', bg:'rgba(16,185,129,0.1)' },
                { icon:'🏛️', val:money(taxCollected), label:'ض.ق.م المحصّلة', sub:hasRevenueData ? `صافي ${money0(netSales)}` : 'لا توجد مبيعات خلال الفترة', color:'#8B5CF6', bg:'rgba(139,92,246,0.1)' },
                { icon:'✅', val:totalOrders > 0 ? `${completionRate}%` : '—', label:'معدل الإتمام', sub:totalOrders > 0 ? `${completedCount} من ${totalOrders} طلب` : 'لا توجد طلبات خلال الفترة', color:'#059669', bg:'rgba(5,150,105,0.1)' },
                { icon:'⚠️', val:totalOrders > 0 ? `${cancelRate}%` : '—', label:'معدل الإلغاء', sub:totalOrders > 0 ? `${cancelledCount} من ${totalOrders} طلب` : 'لا توجد طلبات خلال الفترة', color:'#DC2626', bg:'rgba(220,38,38,0.1)' },
              ].map(s => (
                <div key={s.label} style={{ background:'white', borderRadius:'14px', border:'1px solid #E5E7EB', padding: isMobile?'14px':'18px' }}>
                  <div style={{ width:'36px', height:'36px', borderRadius:'10px', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', marginBottom:'10px' }}>{s.icon}</div>
                  <div style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize: isMobile?'18px':'22px', color:s.color, marginBottom:'3px', lineHeight:1.1 }}>{s.val}</div>
                  <div style={{ fontSize:'12px', color:'#374151', fontWeight:'700', marginBottom:'2px' }}>{s.label}</div>
                  <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* الرسم البياني */}
            <Card style={{ marginBottom:'14px' }}>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div><span style={{ fontSize:'14px', fontWeight:'800', display:'block' }}>📈 أداء المبيعات</span><span style={{ fontSize:'11px', color:'#9CA3AF' }}>الفترة: {periodLabel} · المقياس: {chartMetricLabel}</span></div>
                <div style={{ display:'flex', gap:'4px', overflowX:'auto' }}>{[['revenue','المبيعات'],['orders','الطلبات'],['avg','متوسط الطلب']].map(([key,label]) => <button key={key} onClick={() => setChartMetric(key)} style={{ border:`1px solid ${chartMetric===key?'#FF6A00':'#E5E7EB'}`, background:chartMetric===key?'#FFF0EB':'white', color:chartMetric===key?'#FF6A00':'#6B7280', borderRadius:'7px', padding:'5px 8px', fontFamily:'Tajawal,sans-serif', fontSize:'10px', fontWeight:'800', cursor:'pointer', whiteSpace:'nowrap' }}>{label}</button>)}</div>
              </div>
              <div style={{ padding:'16px' }}>
                {dailyRevenue.length > 0 && dailyRevenue.some(x => x.revenue > 0 || x.orders > 0) ? (
                  <div style={{ display:'flex', alignItems:'flex-end', gap:'6px', height:'140px' }}>
                    {dailyRevenue.map((d, i) => (
                      <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', height:'100%', justifyContent:'flex-end' }}>
                        <div style={{ fontSize:'10px', color:'#9CA3AF', fontWeight:'700' }}>{chartValue(d) > 0 ? Math.round(chartValue(d)) : ''}</div>
                        <div style={{ width:'100%', borderRadius:'5px 5px 0 0', background: i === dailyRevenue.length-1 ? '#FF6A00' : 'rgba(255,106,0,0.35)', height:`${Math.max((chartValue(d) / maxRevenue) * 90, chartValue(d) > 0 ? 4 : 0)}%`, minHeight: chartValue(d) > 0 ? '4px' : '0', transition:'height 0.5s ease' }}/>
                        <div style={{ fontSize:'9px', color:'#9CA3AF', textAlign:'center', whiteSpace:'nowrap', overflow:'hidden', width:'100%', textOverflow:'ellipsis' }}>{d.day}</div>
                      </div>
                    ))}
                  </div>
                ) : <Empty title="لا توجد بيانات مبيعات بعد" text="ستظهر حركة المبيعات هنا بعد استلام أول طلب." />}
              </div>
            </Card>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'9px 12px', marginBottom:'14px', borderRadius:'10px', background:bestSalesDay && chartValue(bestSalesDay) > 0 ? '#FFF7F2' : '#F8F9FB', color:bestSalesDay && chartValue(bestSalesDay) > 0 ? '#9A3412' : '#6B7280', fontSize:'11px', fontWeight:'700' }}>{bestSalesDay && chartValue(bestSalesDay) > 0 ? `📈 أعلى يوم حسب ${bestDayMetricLabel}: ${bestSalesDay.day} · ${chartMetric === 'orders' ? `${bestSalesDay.orders} طلب` : chartMetric === 'avg' ? `${money0(bestSalesDay.avg)} متوسط الطلب` : `${money0(bestSalesDay.revenue)} مبيعات`} ` : 'لا توجد بيانات كافية لاستخراج Insight للمبيعات.'}</div>

            {/* صفّان جنب بعض على اللابتوب */}
            <div style={{ display:'grid', gridTemplateColumns: isDesktop?'1fr 1fr':'1fr', gap:'14px', marginBottom:'14px' }}>

              {/* أكثر الأصناف */}
              <Card>
                <CardHead>🏆 أكثر الأصناف طلباً</CardHead>
                {topProducts.length === 0 ? <Empty /> : (
                  <div style={{ padding:'12px' }}>
                    {topProducts.map((p, i) => {
                      const pct = productRevenueTotal > 0 ? Math.round((p.revenue / productRevenueTotal) * 100) : 0
                      const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣']
                      return (
                        <div key={p.name} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 0', borderBottom: i < topProducts.length-1 ? '1px solid #F3F4F6':'none' }}>
                          <span style={{ fontSize:'16px', flexShrink:0 }}>{medals[i]}</span>
                          <span style={{ fontSize:'20px', flexShrink:0 }}>{p.emoji}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:'13px', fontWeight:'700', marginBottom:'4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                            <div style={{ height:'6px', background:'#F3F4F6', borderRadius:'3px', overflow:'hidden' }}><div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#FF6A00,#FF9F6B)', borderRadius:'3px' }}/></div>
                          </div>
                          <div style={{ textAlign:'left', flexShrink:0 }}>
                            <div style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'14px', color:'#FF6A00' }}>{p.count} <span style={{ fontSize:'10px', fontWeight:'700' }}>طلب</span></div>
                            <div style={{ fontSize:'10px', color:'#6B7280' }}>{money0(p.revenue)} · {pct}% من الإيراد</div>
                          </div>
                        </div>
                      )
                    })}
                    {bottomProducts.length > 0 && (
                      <div style={{ marginTop:'10px', paddingTop:'10px', borderTop:'1px dashed #E5E7EB', fontSize:'11px', color:'#9CA3AF' }}>
                        📉 الأقل طلباً: {bottomProducts.map(p => `${p.name} (${p.count})`).join('، ')}
                      </div>
                    )}
                    <div style={{ marginTop:'10px', paddingTop:'10px', borderTop:'1px solid #F3F4F6', fontSize:'11px', color:'#6B7280' }}>{topProduct ? `💡 أعلى صنف: ${topProduct.name} — ${topProduct.count} طلب · ${money0(topProduct.revenue)} من الإيراد` : 'لا توجد بيانات كافية لاستخراج Insight للمنتجات.'}</div>
                  </div>
                )}
              </Card>

              {/* حسب النوع + الفرع */}
              <Card>
                <CardHead>🍽️ المبيعات حسب النوع</CardHead>
                <div style={{ padding:'12px' }}>
                  {typeEntries.length === 0 ? <Empty /> : typeEntries.map(([t, rawVal]) => {
                    const val = num(rawVal)
                    const pct = typeRevenueTotal > 0 ? Math.round((val / typeRevenueTotal) * 100) : 0
                    return (
                      <div key={t} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 0', borderBottom:'1px solid #F3F4F6' }}>
                        <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:TYPE_COLORS[t] || '#9CA3AF', flexShrink:0 }}/>
                        <span style={{ fontSize:'13px', fontWeight:'600', flex:1 }}>{TYPE_LABELS[t] || 'غير مصنف'}</span>
                        <div style={{ flex:2 }}><div style={{ height:'6px', background:'#F3F4F6', borderRadius:'3px', overflow:'hidden' }}><div style={{ height:'100%', width:`${pct}%`, background:TYPE_COLORS[t] || '#9CA3AF', borderRadius:'3px' }}/></div></div>
                        <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:isMobile?'10px':'12px', minWidth:isMobile?'72px':'82px', textAlign:'left', whiteSpace:'nowrap' }}>{money0(val)} <small style={{ color:'#9CA3AF', fontWeight:'700' }}>({pct}% من المبيعات)</small></span>
                      </div>
                    )
                  })}
                  {branches.length > 0 && branchFilter === 'all' && Object.keys(branchRev).length > 0 && (
                    <div style={{ marginTop:'12px', paddingTop:'10px', borderTop:'1px dashed #E5E7EB' }}>
                      <div style={{ fontSize:'12px', fontWeight:'800', color:'#374151', marginBottom:'8px' }}>🏢 حسب الفرع</div>
                      {Object.entries(branchRev).sort((a,b)=>b[1]-a[1]).map(([id, v]) => (
                        <div key={id} style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', padding:'4px 0' }}>
                          <span style={{ color:'#6B7280' }}>{branchName(id)}</span>
                          <span style={{ fontWeight:'800' }}>{money0(v)}</span>
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
                  {totalOrders === 0 ? <Empty /> : statusEntries.map(([st, rawCount]) => {
                    const count = num(rawCount)
                    const pct = Math.round((count / totalOrders) * 100)
                    return (
                      <div key={st} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 0', borderBottom:'1px solid #F3F4F6' }}>
                        <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:STATUS_COLORS[st] || '#9CA3AF', flexShrink:0 }}/>
                        <span style={{ fontSize:'13px', fontWeight:'600', flex:1 }}>{STATUS_LABELS[st] || st}</span>
                        <div style={{ flex:2 }}><div style={{ height:'6px', background:'#F3F4F6', borderRadius:'3px', overflow:'hidden' }}><div style={{ height:'100%', width:`${pct}%`, background:STATUS_COLORS[st] || '#9CA3AF', borderRadius:'3px' }}/></div></div>
                        <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'13px', minWidth:'54px', textAlign:'left' }}>{count} <small style={{ color:'#9CA3AF', fontWeight:'600' }}>({pct}٪)</small></span>
                      </div>
                    )
                  })}
                </div>
              </Card>

              <Card>
                <CardHead>🚫 الإلغاء ({cancelRate}%)</CardHead>
                <div style={{ padding:'12px' }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', marginBottom:'8px', borderRadius:'9px', background:cancelledCount > 0 ? '#FFF7F2' : '#F8F9FB', fontSize:'11px', color:'#6B7280' }}><span>معدل الإلغاء</span><strong style={{ color:cancelledCount > 0 ? '#C2410C' : '#6B7280' }}>{cancelRate}% · {cancelledCount} من {totalOrders} طلب</strong></div>
                  {reasons.length === 0 ? <Empty text="لا توجد طلبات ملغاة 🎉" /> : reasons.map(([r, c]) => {
                    const pct = Math.round((c / cancelledCount) * 100)
                    return (
                      <div key={r} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 0', borderBottom:'1px solid #F3F4F6' }}>
                        <span style={{ fontSize:'13px', fontWeight:'600', flex:1 }}>{r}</span>
                        <div style={{ flex:2 }}><div style={{ height:'6px', background:'#F3F4F6', borderRadius:'3px', overflow:'hidden' }}><div style={{ height:'100%', width:`${pct}%`, background:'#EF4444', borderRadius:'3px' }}/></div></div>
                        <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'13px', minWidth:'30px', textAlign:'left' }}>{c}</span>
                      </div>
                    )
                  })}
                  {unclassifiedCancellationCount > 0 && <div style={{ marginTop:'10px', padding:'9px 10px', borderRadius:'9px', background:'#FFFBEB', color:'#92400E', fontSize:'11px', lineHeight:1.6 }}><Icon type="warning" size={13}/> جودة البيانات تحتاج تحسين: {unclassifiedCancellationCount} من {cancelledCount} إلغاء غير مصنف.</div>}
                  {cancellationReasonTotal !== cancelledCount && <div style={{ marginTop:'8px', padding:'9px 10px', borderRadius:'9px', background:'#FEF2F2', color:'#991B1B', fontSize:'11px', lineHeight:1.6 }}><Icon type="warning" size={13}/> مجموع أسباب الإلغاء ({cancellationReasonTotal}) لا يطابق إجمالي الإلغاءات ({cancelledCount}).</div>}
                </div>
              </Card>
            </div>

            {/* ===== تحليلات متقدمة (ولاء / رضا / فروع / شكاوى) ===== */}
            {adv ? (() => {
              const li = adv.loyalty_impact || {}
              const sat = adv.satisfaction || {}
              const bperf = Array.isArray(adv.branch_performance) ? adv.branch_performance : []
              const creasons = Array.isArray(adv.complaint_reasons) ? adv.complaint_reasons : []
              const totalComplaints = creasons.reduce((s, x) => s + num(x.count), 0)
              const unclassifiedComplaints = creasons.filter(x => ['غير مصنّف', 'غير مصنف'].includes(x.category)).reduce((s, x) => s + num(x.count), 0)
              const uplift = num(li.aov_uplift_pct)
              const neutralPct = Math.max(0, Math.round((100 - num(sat.satisfied_pct) - num(sat.detractors_pct)) * 10) / 10)
              const returnRate = num(adv.return_rate)
              const customersInPeriod = num(adv.customers_in_period)
              return (
                <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                  <div style={{ fontSize:'15px', fontWeight:'900', marginTop:'4px' }}>🎯 تحليلات متقدمة</div>

                  {/* تأثير الولاء على المبيعات */}
                  <Card>
                    <CardHead>💎 تأثير الولاء على المبيعات <span style={{ fontSize:'10px', color:'#9CA3AF', fontWeight:'600' }}>· الطلبات المكتملة فقط</span></CardHead>
                    <div style={{ padding:'14px 16px' }}>
                      <div style={{ display:'grid', gridTemplateColumns: isMobile?'repeat(2,1fr)':'repeat(4,1fr)', gap:'12px', marginBottom:'12px' }}>
                        {[
                          { label:'حصّة الأعضاء من الإيراد', val:`${num(li.member_revenue_share)}٪`, color:'#7C3AED' },
                          { label:'طلبات الأعضاء', val:num(li.member_orders), color:'#10B981' },
                          { label:'متوسط طلب العضو', val:money0(li.member_aov), color:'#FF6A00' },
                          { label:'متوسط طلب غير العضو', val:money0(li.nonmember_aov), color:'#6B7280' },
                        ].map(s => (
                          <div key={s.label} style={{ background:'#F8F9FB', borderRadius:'12px', padding:'12px' }}>
                            <div style={{ fontSize:'11px', color:'#9CA3AF', fontWeight:'700', marginBottom:'4px' }}>{s.label}</div>
                            <div style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'18px', color:s.color }}>{s.val}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize:'12.5px', color:'#6B7280', background:'#F8F9FB', borderRadius:'10px', padding:'10px 12px', lineHeight:1.7 }}>
                        {num(li.member_orders) > 0 && num(li.nonmember_orders) > 0
                          ? `متوسط طلب عضو الولاء ${uplift >= 0 ? 'أعلى' : 'أقل'} بـ ${Math.abs(uplift)}٪ من غير الأعضاء.`
                          : 'لا توجد بيانات كافية لتحليل تأثير برنامج الولاء. ستظهر المقارنة بعد توفر طلبات من أعضاء البرنامج وغير الأعضاء.'}
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
                              <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'30px', color:'#F59E0B' }}>{num(sat.avg_rating)}</span>
                              <span style={{ fontSize:'13px', color:'#9CA3AF' }}>/ 5 · {num(sat.reviews_count)} تقييم</span>
                            </div>
                            {[
                              { label:'راضون (4-5 ⭐)', pct:num(sat.satisfied_pct), color:'#10B981' },
                              { label:'محايدون (3 ⭐)', pct:neutralPct, color:'#F59E0B' },
                              { label:'ساخطون (1-2 ⭐)', pct:num(sat.detractors_pct), color:'#EF4444' },
                            ].map(s => (
                              <div key={s.label} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
                                <span style={{ fontSize:'12.5px', fontWeight:'600', width:'110px', flexShrink:0 }}>{s.label}</span>
                                <div style={{ flex:1, height:'8px', background:'#F3F4F6', borderRadius:'100px', overflow:'hidden' }}>
                                  <div style={{ width:`${s.pct}%`, height:'100%', background:s.color, borderRadius:'100px' }}/>
                                </div>
                                <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'13px', width:'46px', textAlign:'left' }}>{s.pct}٪</span>
                              </div>
                            ))}
                            <div style={{ marginTop:'12px', paddingTop:'12px', borderTop:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', fontSize:'12.5px' }}>
                              <span style={{ color:'#9CA3AF', fontWeight:'700' }}>معدل عودة العملاء (الفترة)</span>
                              <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', color:'#0891B2' }}>{returnRate}٪</span>
                            </div>
                            {customersInPeriod >= 3 && <div style={{ marginTop:'10px', padding:'9px 10px', borderRadius:'9px', background:'#F0FDFA', color:'#0F766E', fontSize:'11px', lineHeight:1.6 }}>{returnRate >= 30 ? `حوالي ${returnRate}% من العملاء عادوا للطلب خلال الفترة.` : `معدل العودة الحالي ${returnRate}% من العملاء خلال الفترة.`}</div>}
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
                              <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'13px', minWidth:'26px', textAlign:'left' }}>{num(r.count)}</span>
                            </div>
                          )
                        })}
                        {unclassifiedComplaints > 0 && <div style={{ marginTop:'10px', padding:'9px 10px', borderRadius:'9px', background:'#FFFBEB', color:'#92400E', fontSize:'11px', lineHeight:1.6 }}><Icon type="warning" size={13}/> جودة بيانات الشكاوى: {unclassifiedComplaints} شكاوى تحتاج إلى تصنيف. تصنيفها يساعد على اكتشاف المشاكل المتكررة.</div>}
                      </div>
                    </Card>
                  </div>

                  {/* أداء الفروع */}
                  {bperf.length > 1 && (
                    <Card>
                      <CardHead>🏢 أداء الفروع (أفضل ← أسوأ)</CardHead>
                      <div style={{ padding:'6px 16px 14px' }}>
                        {isMobile ? <div style={{ display:'grid', gap:'8px' }}>{bperf.map(b => <div key={b.id} style={{ border:'1px solid #F3F4F6', borderRadius:'11px', padding:'10px', background:'#FAFAFA' }}><div style={{ display:'flex', justifyContent:'space-between', gap:'8px', marginBottom:'8px' }}><strong style={{ fontSize:'13px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.is_primary ? '🏠' : '🏢'} {b.name}</strong><span style={{ color:'#FF6A00', fontFamily:'Tajawal,sans-serif', fontWeight:'900', whiteSpace:'nowrap' }}>{money0(b.revenue)}</span></div><div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'6px', fontSize:'10px', color:'#6B7280' }}><div><span style={{ display:'block', color:'#9CA3AF' }}>الطلبات</span><strong style={{ color:'#374151' }}>{num(b.orders)}</strong></div><div><span style={{ display:'block', color:'#9CA3AF' }}>متوسط الطلب</span><strong style={{ color:'#374151' }}>{num(b.orders) > 0 ? money0(num(b.revenue) / num(b.orders)) : '—'}</strong></div><div><span style={{ display:'block', color:'#9CA3AF' }}>التقييم</span><strong style={{ color:'#F59E0B' }}>{b.avg_rating == null ? '—' : `${num(b.avg_rating)} ⭐`}</strong></div><div><span style={{ display:'block', color:'#9CA3AF' }}>الشكاوى</span><strong style={{ color:num(b.complaints) > 0 ? '#EF4444' : '#374151' }}>{num(b.complaints)}</strong></div></div></div>)}</div> : <div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12.5px', minWidth:'560px' }}><thead><tr style={{ color:'#9CA3AF', fontSize:'11.5px', textAlign:'right' }}><th style={{ padding:'8px 4px', fontWeight:'700' }}>الفرع</th><th style={{ padding:'8px 4px', fontWeight:'700' }}>الإيراد</th><th style={{ padding:'8px 4px', fontWeight:'700' }}>الطلبات</th><th style={{ padding:'8px 4px', fontWeight:'700' }}>متوسط الطلب</th><th style={{ padding:'8px 4px', fontWeight:'700' }}>التقييم</th><th style={{ padding:'8px 4px', fontWeight:'700' }}>شكاوى</th></tr></thead><tbody>{bperf.map(b => <tr key={b.id} style={{ borderTop:'1px solid #F3F4F6' }}><td style={{ padding:'10px 4px', fontWeight:'700' }}>{b.is_primary ? '🏠' : '🏢'} {b.name}</td><td style={{ padding:'10px 4px', fontFamily:'Tajawal,sans-serif', fontWeight:'800', color:'#FF6A00' }}>{money0(b.revenue)}</td><td style={{ padding:'10px 4px' }}>{num(b.orders)}</td><td style={{ padding:'10px 4px', fontFamily:'Tajawal,sans-serif' }}>{num(b.orders) > 0 ? money0(num(b.revenue) / num(b.orders)) : '—'}</td><td style={{ padding:'10px 4px', color:'#F59E0B', fontWeight:'700' }}>{b.avg_rating == null ? '—' : `${num(b.avg_rating)} ⭐`}</td><td style={{ padding:'10px 4px', color:num(b.complaints) > 0 ? '#EF4444' : '#9CA3AF', fontWeight:'700' }}>{num(b.complaints)}</td></tr>)}</tbody></table></div>}
                      </div>
                    </Card>
                  )}
                </div>
              )
            })() : advancedError ? <Card><CardHead>🎯 تحليلات متقدمة</CardHead><ErrorState /></Card> : <Card><CardHead>🎯 تحليلات متقدمة</CardHead><Empty title="لا توجد بيانات كافية للتحليلات المتقدمة" text="ستظهر رؤى الولاء والعملاء والفروع بعد توفر نشاط كافٍ." /></Card>}

            {/* ملخص */}
            <div style={{ background:'linear-gradient(135deg,#0B0B0F,#1A1A2E)', borderRadius:'16px', padding:'20px' }}>
              <div style={{ fontSize:'14px', fontWeight:'800', color:'white', marginBottom:'14px' }}>📊 ملخص الفترة</div>
              <div style={{ display:'grid', gridTemplateColumns: isMobile?'repeat(2,1fr)':'repeat(4,1fr)', gap:'12px' }}>
                {[
                  { label:'صافي المبيعات (قبل الضريبة)', val:hasRevenueData ? money0(netSales) : '—' },
                  { label:'عملاء فريدون', val:uniqueCustomers },
                  { label:'متوسط وقت التحضير', val: avgPrep != null ? `${avgPrep} دقيقة` : 'بيانات غير كافية' },
                  { label:'ساعة الذروة', val:peakHourLabel },
                ].map(s => (
                  <div key={s.label} style={{ background:'rgba(255,255,255,0.05)', borderRadius:'12px', padding:'12px' }}>
                    <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.5)', marginBottom:'4px' }}>{s.label}</div>
                    <div style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'17px', color:'#FF6A00' }}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>
            </>}

          </div>
        </div>
    </AppShell>
  )
}
