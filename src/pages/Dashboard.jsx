import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import { useBreakpoint } from '../hooks/useBreakpoint'

const PERIOD_DAYS = { week: 7, month: 30, year: 365 }
const STATUS = {
  pending:   { label:'انتظار',  cls:'pending' },
  preparing: { label:'قيد التحضير', cls:'preparing' },
  ready:     { label:'جاهز', cls:'ready' },
  completed: { label:'منتهي', cls:'completed' },
  cancelled: { label:'ملغي', cls:'cancelled' },
}
const TYPE_LABEL = { dine_in:'🪑 محلي', takeaway:'🥡 سفري', delivery:'🛵 توصيل' }

// تنعيم مسار الرسم البياني (Catmull-Rom → Bézier)
function smoothPath(points) {
  if (points.length < 2) return points.length ? `M${points[0].x},${points[0].y}` : ''
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i-1] || points[i], p1 = points[i], p2 = points[i+1], p3 = points[i+2] || p2
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x},${p2.y}`
  }
  return d
}

const isToday = (iso) => { const d = new Date(iso), n = new Date(); return d.toDateString() === n.toDateString() }
const isYesterday = (iso) => { const d = new Date(iso), y = new Date(); y.setDate(y.getDate()-1); return d.toDateString() === y.toDateString() }

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, restaurant } = useAuthStore()
  const { isMobile, isDesktop } = useBreakpoint()
  const [recentOrders, setRecentOrders] = useState([])   // طلبات اليوم+الأمس (تشغيلي، لحظي)
  const [summary, setSummary] = useState(null)           // الجزء التحليلي (رسم/أصناف/عملاء الفترة)
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('week')
  const [orderFilter, setOrderFilter] = useState('all')
  const [ordersOpen, setOrdersOpen] = useState(() => localStorage.getItem('dash_orders_open') !== '0')
  const [now, setNow] = useState(Date.now())

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t) }, [])
  useEffect(() => { localStorage.setItem('dash_orders_open', ordersOpen ? '1' : '0') }, [ordersOpen])

  useEffect(() => {
    if (!restaurant) { setLoading(false); return }
    fetchReviews()
    fetchRecent()
    const unsub = subscribeOrders()
    const unsubR = subscribeReviews()
    return () => { unsub(); unsubR() }
  }, [restaurant])

  useEffect(() => { if (restaurant) fetchSummary() }, [restaurant, period])

  // تشغيلي: طلبات اليوم+الأمس فقط (بدل سقف 2000 على النافذة كلها) — لحظي عبر الاشتراك
  const fetchRecent = async () => {
    setLoading(true)
    try {
      const from = new Date(); from.setDate(from.getDate() - 1); from.setHours(0,0,0,0)
      const { data } = await supabase.from('orders').select('*')
        .eq('restaurant_id', restaurant.id).gte('created_at', from.toISOString())
        .order('created_at', { ascending: false }).limit(1000)
      if (data) setRecentOrders(data)
    } finally { setLoading(false) }
  }

  // تحليلي: تجميع خادمي للفترة (رسم/أصناف/عملاء) — يتحدّث عند التحميل وتغيير الفترة
  const fetchSummary = async () => {
    const from = new Date(); from.setDate(from.getDate() - (PERIOD_DAYS[period] || 7))
    const { data } = await supabase.rpc('get_dashboard_summary', {
      p_restaurant_id: restaurant.id, p_from: from.toISOString(), p_to: new Date().toISOString(),
    })
    setSummary(data || null)
  }

  const fetchReviews = async () => {
    const { data } = await supabase.from('reviews').select('rating,created_at')
      .eq('restaurant_id', restaurant.id).order('created_at', { ascending:false }).limit(200)
    if (data) setReviews(data)
  }

  const subscribeOrders = () => {
    if (!restaurant) return () => {}
    const ch = supabase.channel('orders-dash')
      .on('postgres_changes', { event:'*', schema:'public', table:'orders', filter:`restaurant_id=eq.${restaurant.id}` }, (p) => {
        if (p.eventType === 'INSERT') { setRecentOrders(prev => [p.new, ...prev]); toast.success(`🔔 طلب جديد! ${p.new.order_number}`) }
        else if (p.eventType === 'UPDATE') setRecentOrders(prev => prev.map(o => o.id === p.new.id ? p.new : o))
      }).subscribe()
    return () => supabase.removeChannel(ch)
  }
  const subscribeReviews = () => {
    if (!restaurant) return () => {}
    const ch = supabase.channel('reviews-dash')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'reviews', filter:`restaurant_id=eq.${restaurant.id}` },
        (p) => { setReviews(prev => [p.new, ...prev]); toast.success(`⭐ تقييم جديد: ${p.new.rating}/5`) }).subscribe()
    return () => supabase.removeChannel(ch)
  }

  const go = (path, state) => navigate(path, state ? { state } : undefined)
  const shareLink = async () => {
    const url = `${window.location.origin}/menu/${restaurant?.slug}`
    try {
      if (navigator.share && isMobile) { await navigator.share({ title: restaurant?.name, url }); return }
      await navigator.clipboard.writeText(url); toast.success('تم نسخ رابط المنيو! 📋')
    } catch { toast.error('تعذّر النسخ') }
  }

  // ===== الحسابات =====
  const todayOrders = recentOrders.filter(o => isToday(o.created_at))
  const yesterdayOrders = recentOrders.filter(o => isYesterday(o.created_at))
  const sales = (list) => list.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (Number(o.total) || 0), 0)
  const revToday = sales(todayOrders), revYest = sales(yesterdayOrders)
  const completedToday = todayOrders.filter(o => o.status === 'completed')
  const avgOrder = completedToday.length ? revToday / completedToday.length : 0
  const custToday = new Set(todayOrders.map(o => o.customer_phone).filter(Boolean)).size
  const custWindow = Number(summary?.unique_customers) || 0
  const avgRating = reviews.length ? (reviews.reduce((s,r) => s+(r.rating||0),0)/reviews.length).toFixed(1) : '—'
  const growth = (c, p) => p > 0 ? Math.round(((c-p)/p)*100) : (c > 0 ? 100 : 0)
  const ordTrend = growth(todayOrders.length, yesterdayOrders.length)
  const revTrend = growth(revToday, revYest)

  // سلسلة الرسم البياني
  const chart = useMemo(() => {
    const W = 700, top = 20, bot = 160, padR = 50, padL = 50
    const buckets = []
    const nowD = new Date()
    const daily = (summary?.chart_daily) || []
    if (period === 'year') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1)
        buckets.push({ label: d.toLocaleDateString('ar', { month:'short' }), y:d.getFullYear(), m:d.getMonth(), value:0 })
      }
      daily.forEach(({ d, value }) => { const dt=new Date(d+'T00:00:00'); const b=buckets.find(x=>x.y===dt.getFullYear()&&x.m===dt.getMonth()); if(b) b.value+=Number(value)||0 })
    } else {
      const days = period === 'month' ? 30 : 7
      for (let i = days-1; i >= 0; i--) {
        const d = new Date(nowD); d.setDate(nowD.getDate()-i); d.setHours(0,0,0,0)
        buckets.push({ label: i===0 ? 'اليوم' : d.toLocaleDateString('ar', { weekday:'short' }), key:d.toDateString(), value:0 })
      }
      daily.forEach(({ d, value }) => { const dt=new Date(d+'T00:00:00'); const b=buckets.find(x=>x.key===dt.toDateString()); if(b) b.value+=Number(value)||0 })
    }
    const maxV = Math.max(...buckets.map(b=>b.value), 1)
    const n = buckets.length
    const pts = buckets.map((b,i) => ({ x: n===1?W/2 : padR + i*((W-padR-padL)/(n-1)), y: bot - (b.value/maxV)*(bot-top), ...b }))
    return { pts, maxV, line: smoothPath(pts), area: smoothPath(pts) + ` L${pts[pts.length-1].x},${bot} L${pts[0].x},${bot} Z` }
  }, [summary, period])

  // جدول الطلبات (اليوم) + فلتر
  const tableOrders = todayOrders.filter(o => orderFilter === 'all' ? true : o.status === orderFilter).slice(0, 20)
  const cnt = (st) => todayOrders.filter(o => o.status === st).length

  // مباشر
  const liveOrders = todayOrders.filter(o => ['pending','preparing','ready'].includes(o.status)).slice(0, 8)

  // أكثر الأصناف
  const topProducts = useMemo(() => {
    return ((summary?.products) || []).slice(0,5).map(p => ({ name:p.name, emoji:p.emoji || '🍽️', count:Number(p.count)||0 }))
  }, [summary])

  const timeAgo = (iso) => {
    const mins = Math.max(0, Math.floor((now - new Date(iso).getTime())/60000))
    if (mins < 1) return 'الآن'; if (mins < 60) return `منذ ${mins} د`
    return `منذ ${Math.floor(mins/60)} س`
  }

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0B0B0F', color:'white', gap:'16px', fontFamily:'Tajawal,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,106,0,0.3)', borderTopColor:'#FF6A00', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      جارٍ التحميل...
    </div>
  )

  const todayLabel = new Date().toLocaleDateString('ar', { weekday:'long', day:'numeric', month:'long' })

  const CSS = `
    .dash{ --primary:#FF6A00; --success:#10B981; --warning:#F59E0B; --error:#EF4444; --info:#3B82F6; --border:#E5E7EB; --muted:#6B7280; --s2:#F8F9FB; }
    .dash *{ box-sizing:border-box; }
    @keyframes cardIn{ from{opacity:0; transform:translateY(14px)} to{opacity:1; transform:none} }
    @keyframes blink{ 0%,100%{opacity:1} 50%{opacity:.3} }
    .quick-actions{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:18px; }
    .qa-btn{ background:#fff; border:1px solid var(--border); border-radius:14px; padding:16px 10px; display:flex; flex-direction:column; align-items:center; gap:7px; cursor:pointer; transition:all .2s; }
    .qa-btn:hover{ border-color:rgba(255,106,0,.4); transform:translateY(-2px); box-shadow:0 6px 18px rgba(0,0,0,.06); }
    .qa-btn.primary{ background:var(--primary); border-color:var(--primary); }
    .qa-btn.primary .qa-label{ color:#fff; } .qa-btn.primary .qa-icon{ filter:none; }
    .qa-icon{ font-size:22px; } .qa-label{ font-size:12.5px; font-weight:800; font-family:'Tajawal',sans-serif; color:#0B0B0F; }
    .stats-row{ display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:18px; }
    .stat-card{ background:#fff; border-radius:18px; padding:18px 20px; border:1px solid var(--border); position:relative; overflow:hidden; transition:all .25s; animation:cardIn .5s ease both; }
    .stat-card:hover{ transform:translateY(-2px); box-shadow:0 4px 16px rgba(0,0,0,.07); }
    .stat-card::after{ content:''; position:absolute; top:0; left:0; right:0; height:3px; opacity:0; transition:.2s; }
    .stat-card:hover::after{ opacity:1; }
    .stat-card.orange::after{ background:linear-gradient(90deg,var(--primary),#FF9F6B); }
    .stat-card.green::after{ background:linear-gradient(90deg,var(--success),#6EE7B7); }
    .stat-card.blue::after{ background:linear-gradient(90deg,var(--info),#93C5FD); }
    .stat-card.gold::after{ background:linear-gradient(90deg,var(--warning),#FCD34D); }
    .stat-top{ display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:12px; }
    .stat-icon{ width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px; }
    .stat-icon.orange{ background:rgba(255,106,0,.1);} .stat-icon.green{ background:rgba(16,185,129,.1);} .stat-icon.blue{ background:rgba(59,130,246,.1);} .stat-icon.gold{ background:rgba(245,158,11,.1);}
    .stat-trend{ display:flex; align-items:center; gap:4px; font-size:12px; font-weight:800; padding:3px 8px; border-radius:100px; }
    .stat-trend.up{ background:rgba(16,185,129,.1); color:var(--success);} .stat-trend.down{ background:rgba(239,68,68,.1); color:var(--error);}
    .stat-value{ font-family:'Tajawal',sans-serif; font-weight:900; font-size:28px; color:#0B0B0F; line-height:1; margin-bottom:4px; letter-spacing:-1px; }
    .stat-label{ font-size:13px; color:var(--muted); font-weight:600; }
    .stat-sub{ font-size:11px; color:var(--muted); margin-top:8px; padding-top:10px; border-top:1px solid var(--border); }
    .main-grid{ display:grid; grid-template-columns:1fr 340px; gap:16px; }
    .card{ background:#fff; border-radius:18px; border:1px solid var(--border); overflow:hidden; animation:cardIn .5s ease both; }
    .card-header{ padding:16px 18px 14px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border); }
    .card-title{ font-size:15px; font-weight:800; color:#0B0B0F; display:flex; align-items:center; gap:8px; }
    .card-action{ font-size:12px; font-weight:700; color:var(--primary); cursor:pointer; background:none; border:none; font-family:'Tajawal',sans-serif; }
    .chart-tabs{ display:flex; gap:4px; padding:4px; background:var(--s2); border-radius:10px; }
    .chart-tab{ padding:5px 12px; border-radius:7px; font-size:12px; font-weight:700; color:var(--muted); cursor:pointer; border:none; background:none; font-family:'Tajawal',sans-serif; }
    .chart-tab.active{ background:#fff; color:var(--primary); box-shadow:0 1px 3px rgba(0,0,0,.08); }
    .orders-filters{ padding:12px 16px; display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--border); overflow-x:auto; }
    .filter-chip{ padding:5px 14px; border-radius:100px; border:1.5px solid var(--border); background:#fff; font-size:12px; font-weight:700; color:var(--muted); cursor:pointer; white-space:nowrap; transition:all .2s; }
    .filter-chip.active{ border-color:var(--primary); background:#FFF0EB; color:var(--primary); }
    .orders-count{ margin-right:auto; font-size:12px; color:var(--muted); white-space:nowrap; font-weight:600; }
    .otable{ width:100%; border-collapse:collapse; }
    .otable th{ padding:10px 16px; text-align:right; font-size:11px; font-weight:800; color:var(--muted); background:var(--s2); border-bottom:1px solid var(--border); white-space:nowrap; }
    .otable td{ padding:12px 16px; border-bottom:1px solid var(--border); font-size:13px; vertical-align:middle; }
    .otable tr:last-child td{ border-bottom:none; } .otable tbody tr{ cursor:pointer; transition:background .15s; } .otable tbody tr:hover td{ background:var(--s2); }
    .avatar{ width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg,#667eea,#764ba2); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:#fff; font-family:'Tajawal',sans-serif; flex-shrink:0; }
    .badge{ display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:100px; font-size:11px; font-weight:800; white-space:nowrap; }
    .badge::before{ content:''; width:5px; height:5px; border-radius:50%; }
    .badge.pending{ background:#FEF3C7; color:#92400E;} .badge.pending::before{ background:#F59E0B;}
    .badge.preparing{ background:#DBEAFE; color:#1E40AF;} .badge.preparing::before{ background:#3B82F6; animation:blink 1.5s infinite;}
    .badge.ready{ background:#D1FAE5; color:#065F46;} .badge.ready::before{ background:#10B981;}
    .badge.completed{ background:var(--s2); color:var(--muted);} .badge.completed::before{ background:var(--muted);}
    .badge.cancelled{ background:#FEE2E2; color:#991B1B;} .badge.cancelled::before{ background:var(--error);}
    .live-badge{ display:flex; align-items:center; gap:5px; font-size:11px; font-weight:800; color:var(--success); background:rgba(16,185,129,.1); padding:3px 8px; border-radius:100px; }
    .live-dot{ width:6px; height:6px; background:var(--success); border-radius:50%; animation:blink 1.5s infinite; }
    .live-item{ padding:11px 13px; border-radius:12px; border:1.5px solid var(--border); background:var(--s2); position:relative; overflow:hidden; }
    .live-item .bar{ position:absolute; right:0; top:0; bottom:0; width:3px; }
    .tp-row{ display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid #F3F4F6; }
    .collapse-btn{ background:none; border:none; cursor:pointer; font-size:15px; color:var(--muted); transition:transform .2s; }
    @media (max-width:1024px){ .main-grid{ grid-template-columns:1fr; } .side-panels{ display:none; } }
    @media (max-width:640px){ .quick-actions{ grid-template-columns:repeat(2,1fr); } .stats-row{ grid-template-columns:repeat(2,1fr); } .stat-value{ font-size:24px; } }
  `

  const StatusBadge = ({ st }) => <span className={`badge ${STATUS[st]?.cls || 'pending'}`}>{STATUS[st]?.label || st}</span>

  return (
    <AppShell
      active="dashboard"
      title={<>لوحة التحكم <span style={{ fontSize:'12px', color:'#9CA3AF', fontWeight:'600' }}>مرحباً، {user?.user_metadata?.full_name?.split(' ')[0] || 'بك'} 👋</span></>}
      badges={{ orders: liveOrders.length }}
      actions={<>
        {!isMobile && <span style={{ fontSize:'12px', color:'#6B7280', background:'#F3F4F6', padding:'6px 12px', borderRadius:'100px', fontWeight:'700', whiteSpace:'nowrap' }}>📅 {todayLabel}</span>}
        <button onClick={shareLink} style={{ padding:'8px 14px', borderRadius:'9px', border:'none', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer', whiteSpace:'nowrap' }}>📤 مشاركة المنيو</button>
      </>}
    >
      <div className="dash" style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column' }}>
        <style>{CSS}</style>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding: isDesktop?'22px':'16px', background:'#F8F9FB' }}>
          <div style={{ maxWidth:'1240px', margin:'0 auto' }}>

            {/* Quick actions */}
            <div className="quick-actions">
              <div className="qa-btn primary" onClick={() => go('/menu', { tab:'products' })}><span className="qa-icon">➕</span><span className="qa-label">إضافة صنف</span></div>
              <div className="qa-btn" onClick={() => go('/qr')}><span className="qa-icon">📱</span><span className="qa-label">QR كودي</span></div>
              <div className="qa-btn" onClick={() => window.open(`${window.location.origin}/menu/${restaurant?.slug}`, '_blank')}><span className="qa-icon">🌐</span><span className="qa-label">معاينة المنيو</span></div>
              <div className="qa-btn" onClick={() => go('/analytics')}><span className="qa-icon">📊</span><span className="qa-label">تقرير اليوم</span></div>
            </div>

            {/* Stats */}
            <div className="stats-row">
              <div className="stat-card orange">
                <div className="stat-top"><div className="stat-icon orange">🛒</div><div className={`stat-trend ${ordTrend>=0?'up':'down'}`}>{ordTrend>=0?'↑':'↓'} {Math.abs(ordTrend)}%</div></div>
                <div className="stat-value">{todayOrders.length}</div><div className="stat-label">طلب اليوم</div>
                <div className="stat-sub">مقارنة بـ {yesterdayOrders.length} أمس</div>
              </div>
              <div className="stat-card green">
                <div className="stat-top"><div className="stat-icon green">💰</div><div className={`stat-trend ${revTrend>=0?'up':'down'}`}>{revTrend>=0?'↑':'↓'} {Math.abs(revTrend)}%</div></div>
                <div className="stat-value">{revToday.toLocaleString('en-US',{maximumFractionDigits:0})}</div><div className="stat-label">ريال مبيعات</div>
                <div className="stat-sub">متوسط الطلب: {Math.round(avgOrder)} ريال</div>
              </div>
              <div className="stat-card blue">
                <div className="stat-top"><div className="stat-icon blue">👥</div></div>
                <div className="stat-value">{custToday}</div><div className="stat-label">عميل اليوم</div>
                <div className="stat-sub">خلال الفترة: {custWindow} عميل</div>
              </div>
              <div className="stat-card gold">
                <div className="stat-top"><div className="stat-icon gold">⭐</div></div>
                <div className="stat-value">{avgRating}</div><div className="stat-label">تقييم العملاء</div>
                <div className="stat-sub">من {reviews.length} تقييم</div>
              </div>
            </div>

            {/* Main grid */}
            <div className="main-grid">
              {/* Left */}
              <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
                {/* Chart */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title"><span>📈</span> المبيعات</div>
                    <div className="chart-tabs">
                      {[['week','أسبوع'],['month','شهر'],['year','سنة']].map(([k,l]) => (
                        <button key={k} className={`chart-tab ${period===k?'active':''}`} onClick={() => setPeriod(k)}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding:'16px' }}>
                    <svg viewBox="0 0 700 180" style={{ width:'100%', height: isMobile?'150px':'180px' }}>
                      {[36,72,108,144].map(y => <line key={y} x1="0" y1={y} x2="700" y2={y} stroke="#F0F2F5" strokeWidth="1"/>)}
                      <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FF6A00" stopOpacity="0.15"/><stop offset="100%" stopColor="#FF6A00" stopOpacity="0"/></linearGradient></defs>
                      <path d={chart.area} fill="url(#ag)"/>
                      <path d={chart.line} fill="none" stroke="#FF6A00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      {chart.pts.map((p,i) => <circle key={i} cx={p.x} cy={p.y} r={i===chart.pts.length-1?6:4} fill={i===chart.pts.length-1?'#FF6A00':'white'} stroke={i===chart.pts.length-1?'white':'#FF6A00'} strokeWidth="2.5"/>)}
                      {chart.pts.map((p,i) => ((chart.pts.length<=8) || i%Math.ceil(chart.pts.length/7)===0 || i===chart.pts.length-1) && (
                        <text key={'t'+i} x={p.x} y="176" textAnchor="middle" fontSize="11" fill={i===chart.pts.length-1?'#FF6A00':'#9CA3AF'} fontFamily="Cairo" fontWeight={i===chart.pts.length-1?'bold':'normal'}>{p.label}</text>
                      ))}
                    </svg>
                  </div>
                </div>

                {/* Orders (collapsible) */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title"><span>🧾</span> آخر الطلبات <span style={{ fontSize:'11px', color:'#9CA3AF', fontWeight:'700' }}>({todayOrders.length})</span></div>
                    <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                      <button className="card-action" onClick={() => go('/orders')}>عرض الكل</button>
                      <button className="collapse-btn" onClick={() => setOrdersOpen(v => !v)} style={{ transform: ordersOpen?'rotate(0)':'rotate(180deg)' }}>⌄</button>
                    </div>
                  </div>
                  {ordersOpen && (
                    <>
                      <div className="orders-filters">
                        {[['all','الكل'],['pending',`⏳ انتظار (${cnt('pending')})`],['preparing',`🔵 تحضير (${cnt('preparing')})`],['ready',`✅ جاهز (${cnt('ready')})`],['completed','منتهي']].map(([k,l]) => (
                          <div key={k} className={`filter-chip ${orderFilter===k?'active':''}`} onClick={() => setOrderFilter(k)}>{l}</div>
                        ))}
                        <span className="orders-count">{todayOrders.length} طلب اليوم</span>
                      </div>
                      {tableOrders.length === 0 ? (
                        <div style={{ padding:'40px 16px', textAlign:'center', color:'#9CA3AF' }}>
                          <div style={{ fontSize:'40px', opacity:0.3, marginBottom:'10px' }}>📭</div>
                          <div style={{ fontSize:'14px', color:'#374151', fontWeight:'700' }}>لا توجد طلبات</div>
                        </div>
                      ) : (
                        <div style={{ overflowX:'auto' }}>
                          <table className="otable">
                            <thead><tr><th>رقم الطلب</th><th>العميل</th><th>النوع</th><th>الأصناف</th><th>الحالة</th><th>المبلغ</th><th>الوقت</th></tr></thead>
                            <tbody>
                              {tableOrders.map(o => {
                                const items = Array.isArray(o.items) ? o.items : []
                                return (
                                  <tr key={o.id} onClick={() => go('/orders')}>
                                    <td><span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800' }}>{o.order_number}</span></td>
                                    <td><div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                                      <div className="avatar">{(o.customer_name||'ع').charAt(0)}</div>
                                      <div><div style={{ fontWeight:'700', fontSize:'13px' }}>{o.customer_name||'عميل'}</div><div style={{ fontSize:'11px', color:'#9CA3AF' }}>{o.type==='dine_in'&&o.table_number?`طاولة ${o.table_number}`:(TYPE_LABEL[o.type]||'')}</div></div>
                                    </div></td>
                                    <td style={{ color:'#6B7280', fontWeight:'600', fontSize:'12px' }}>{TYPE_LABEL[o.type]||'🪑 محلي'}</td>
                                    <td style={{ color:'#6B7280' }}>{items.length} صنف</td>
                                    <td><StatusBadge st={o.status} /></td>
                                    <td><span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800' }}>{Number(o.total||0).toFixed(0)} ﷼</span></td>
                                    <td style={{ color:'#9CA3AF', fontSize:'12px', whiteSpace:'nowrap' }}>{timeAgo(o.created_at)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Right side panels (تظهر على اللابتوب) */}
              <div className="side-panels" style={{ display: isDesktop?'flex':'none', flexDirection:'column', gap:'16px' }}>
                <div className="card">
                  <div className="card-header">
                    <div className="card-title"><span>🔴</span> الطلبات المباشرة</div>
                    <div className="live-badge"><div className="live-dot"/> مباشر</div>
                  </div>
                  <div style={{ padding:'12px', display:'flex', flexDirection:'column', gap:'8px', maxHeight:'320px', overflowY:'auto' }}>
                    {liveOrders.length === 0 ? <div style={{ padding:'24px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>لا طلبات نشطة</div> : liveOrders.map(o => {
                      const bar = STATUS[o.status]?.cls
                      const barColor = { pending:'#F59E0B', preparing:'#3B82F6', ready:'#10B981' }[o.status] || '#F59E0B'
                      const items = Array.isArray(o.items)?o.items:[]
                      return (
                        <div key={o.id} className="live-item" onClick={() => go('/orders')} style={{ cursor:'pointer' }}>
                          <div className="bar" style={{ background:barColor }}/>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                            <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'13px' }}>{o.order_number}</span>
                            <StatusBadge st={o.status} />
                          </div>
                          <div style={{ fontSize:'12px', color:'#6B7280', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{items.map(i=>`${i.name}×${i.qty}`).join('، ')}</div>
                          <div style={{ display:'flex', justifyContent:'space-between', marginTop:'6px' }}>
                            <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'13px', color:'#FF6A00' }}>{Number(o.total||0).toFixed(0)} ﷼</span>
                            <span style={{ fontSize:'11px', color:'#9CA3AF' }}>{timeAgo(o.created_at)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <div className="card-title"><span>🏆</span> أكثر الأصناف طلباً</div>
                    <button className="card-action" onClick={() => go('/analytics')}>تفاصيل</button>
                  </div>
                  <div style={{ padding:'6px 16px 12px' }}>
                    {topProducts.length === 0 ? <div style={{ padding:'20px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>لا بيانات بعد</div> : topProducts.map((p,i) => (
                      <div key={p.name} className="tp-row" style={{ borderBottom: i<topProducts.length-1?'1px solid #F3F4F6':'none' }}>
                        <span style={{ fontSize:'14px' }}>{['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span>
                        <span style={{ fontSize:'20px' }}>{p.emoji}</span>
                        <span style={{ flex:1, fontSize:'13px', fontWeight:'700', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
                        <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', color:'#FF6A00', fontSize:'14px' }}>{p.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </AppShell>
  )
}
