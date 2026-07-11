import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import ErrBoundary from '../features/menu/ErrBoundary'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

function Spinner() {
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0F1117', color:'white', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,107,53,0.3)', borderTopColor:'#FF6B35', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      جارٍ التحميل...
    </div>
  )
}

const DAY_MS = 24 * 60 * 60 * 1000
const VIP_ORDERS = 10       // نفس عتبة VIP التاريخية في المشروع
const REGULAR_ORDERS = 3    // نفس عتبة "مميز" التاريخية
const NEW_DAYS = 14         // عميل جديد: أول طلب خلال آخر 14 يوماً
const ACTIVE_DAYS = 30      // نشط: طلب خلال آخر 30 يوماً

const phoneDigits = (p) => (p || '').replace(/[^\d]/g, '')

// شارة المستوى الأساسي — واحدة دائماً لكل عميل (نفس عتبات VIP/مميز التاريخية)
function getTierBadge(orderCount) {
  if (orderCount >= VIP_ORDERS) return { key:'vip', label:'💎 VIP', bg:'#EDE9FE', color:'#6D28D9' }
  if (orderCount >= REGULAR_ORDERS) return { key:'regular', label:'⭐ مميز', bg:'#FEF3C7', color:'#92400E' }
  return { key:'new', label:'🆕 جديد', bg:'#DBEAFE', color:'#1E40AF' }
}

// مصيدة أخطاء: أي خطأ وقت التشغيل يعرض رسالته بدل شاشة بيضاء فارغة على كامل التطبيق
// (بلا هذه المصيدة، خطأ غير متوقّع أثناء العرض يُسقط الشجرة بأكملها بما فيها القائمة الجانبية)
export default function Customers() {
  return (
    <ErrBoundary>
      <CustomersInner />
    </ErrBoundary>
  )
}

function CustomersInner() {
  const navigate = useNavigate()
  const { restaurant, isOwner, membership } = useAuthStore()
  const branchLocked = !isOwner && membership?.branch_scope && membership.branch_scope !== 'all'
  const [orders, setOrders] = useState([])
  const [branches, setBranches] = useState([])
  const [loyaltyProgram, setLoyaltyProgram] = useState(null)
  const [redemptions, setRedemptions] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')   // all | active | inactive
  const [tierFilter, setTierFilter] = useState('all')       // all | vip | regular | new
  const [sortBy, setSortBy] = useState('recent')            // recent | spent | orders | stale | points | upgrade
  const [minSpent, setMinSpent] = useState('')
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [showMoreStats, setShowMoreStats] = useState(false)

  const [detailCustomer, setDetailCustomer] = useState(null)
  const [detailTab, setDetailTab] = useState('overview')
  // قفل تمرير الصفحة خلف أي نافذة منزلقة مفتوحة (فلاتر أكثر / لوحة تفاصيل العميل)
  useBodyScrollLock(moreFiltersOpen)
  useBodyScrollLock(!!detailCustomer)

  useEffect(() => {
    if (!restaurant) return
    fetchAll()
  }, [restaurant])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [ordRes, brRes, progRes, redRes] = await Promise.all([
        supabase.from('orders').select('*').eq('restaurant_id', restaurant.id).order('created_at', { ascending:false }),
        supabase.from('branches').select('*').eq('restaurant_id', restaurant.id).order('sort_order'),
        supabase.from('loyalty_programs').select('*').eq('restaurant_id', restaurant.id).maybeSingle(),
        supabase.from('loyalty_redemptions').select('customer_phone, points').eq('restaurant_id', restaurant.id),
      ])
      if (ordRes.data) setOrders(ordRes.data)
      if (brRes.data) setBranches(brRes.data)
      if (progRes.data) setLoyaltyProgram(progRes.data)
      if (redRes.data) setRedemptions(redRes.data)
    } finally {
      setLoading(false)
    }
  }

  // اسم الفرع من معرّفه (null = الفرع الرئيسي)
  const branchName = (bid) => {
    if (!bid) return '🏠 الفرع الرئيسي'
    const br = branches.find(b => b.id === bid)
    return br ? `🏢 ${br.name}` : '🏢 فرع محذوف'
  }

  // تجميع الطلبات في عملاء حسب رقم الجوال.
  // الإحصائيات (الإنفاق/العدد/المتوسط) تُحتسب من الطلبات غير الملغاة فقط — الملغاة تبقى ظاهرة في سجل الطلبات لكنها لا تُحتسب مالياً.
  const customers = useMemo(() => {
    const map = {}
    orders.forEach(o => {
      const phone = (o.customer_phone || '').trim()
      if (!phone) return
      if (!map[phone]) {
        map[phone] = {
          phone,
          allOrders: [], statsOrders: [], completedSpent: 0,
          branchCounts: {}, productCounts: {},
        }
      }
      const c = map[phone]
      c.allOrders.push(o)

      if (o.status !== 'cancelled') {
        c.statsOrders.push(o)
        const bKey = o.branch_id || '__main__'
        c.branchCounts[bKey] = (c.branchCounts[bKey] || 0) + 1
        const items = Array.isArray(o.items) ? o.items : []
        items.forEach(it => {
          if (!it?.name) return
          c.productCounts[it.name] = (c.productCounts[it.name] || 0) + (Number(it.qty) || 1)
        })
      }
      if (o.status === 'completed') c.completedSpent += Number(o.total) || 0
    })

    return Object.values(map).map(c => {
      // أحدث اسم فعلي (بترتيب زمني تصاعدي) — يبقى آخر اسم أدخله العميل في أي طلب
      const byTime = [...c.allOrders].sort((a,b) => new Date(a.created_at) - new Date(b.created_at))
      let name = null
      byTime.forEach(o => { if (o.customer_name) name = o.customer_name })

      const statsSorted = [...c.statsOrders].sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
      const orderCount = statsSorted.length
      const totalSpent = statsSorted.reduce((s,o) => s + (Number(o.total) || 0), 0)
      const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0
      const lastOrderAt = statsSorted[0]?.created_at || byTime[byTime.length - 1]?.created_at
      const firstOrderAt = statsSorted[statsSorted.length - 1]?.created_at || byTime[0]?.created_at
      const branchId = statsSorted[0]?.branch_id ?? (byTime[byTime.length-1]?.branch_id || null)
      const branchIds = new Set(Object.keys(c.branchCounts))
      const mostOrderedBranchKey = Object.entries(c.branchCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || null
      const favoriteProducts = Object.entries(c.productCounts).sort((a,b) => b[1]-a[1]).slice(0,3).map(([n,q]) => ({ name:n, qty:q }))

      const daysSinceLast = lastOrderAt ? (Date.now() - new Date(lastOrderAt).getTime()) / DAY_MS : Infinity
      const isNewCustomer = firstOrderAt ? (Date.now() - new Date(firstOrderAt).getTime()) / DAY_MS <= NEW_DAYS : false
      const isActive = daysSinceLast <= ACTIVE_DAYS
      const recentOrders30 = statsSorted.filter(o => (Date.now() - new Date(o.created_at).getTime())/DAY_MS <= 30).length

      const tier = getTierBadge(orderCount)
      const earned = loyaltyProgram?.enabled ? Math.floor(c.completedSpent * (Number(loyaltyProgram.earn_rate) || 0)) : 0

      return {
        phone: c.phone, name, orders: byTime.slice().reverse(), // للعرض: الأحدث أولاً
        orderCount, totalSpent, avgOrderValue, lastOrderAt, firstOrderAt,
        branchId, branchIds, mostOrderedBranchKey, favoriteProducts,
        daysSinceLast, isNewCustomer, isActive, recentOrders30,
        tier, loyaltyEarned: earned,
      }
    })
  }, [orders, loyaltyProgram])

  // رصيد نقاط الولاء لكل عميل (مُحسوب حيّاً — بلا ledger، مطابق لصفحة الولاء)
  const redemptionsByPhone = useMemo(() => {
    const map = {}
    redemptions.forEach(r => { map[r.customer_phone] = (map[r.customer_phone] || 0) + (r.points || 0) })
    return map
  }, [redemptions])

  const customersFull = useMemo(() => customers.map(c => {
    const redeemed = redemptionsByPhone[c.phone] || 0
    return { ...c, loyaltyRedeemed: redeemed, loyaltyBalance: c.loyaltyEarned - redeemed }
  }), [customers, redemptionsByPhone])

  // أعلى عميل إنفاقاً (للشارة ⭐ وللإحصائية)
  const topSpender = useMemo(() => {
    if (customersFull.length === 0) return null
    return customersFull.reduce((top, c) => (c.totalSpent > (top?.totalSpent || 0) ? c : top), null)
  }, [customersFull])

  // شارة الحالة الظرفية — واحدة فقط، بالأولوية (⭐ أفضل عميل ثم 📈 قريب من الترقية ثم 🔥 نشط جداً ثم 💤 لم يطلب منذ فترة)
  const getSituationalBadge = (c) => {
    if (topSpender && c.phone === topSpender.phone && c.totalSpent > 0) return { label:'⭐ أفضل عميل', bg:'#FFEDD5', color:'#9A3412' }
    if (c.tier.key === 'regular' && c.orderCount >= VIP_ORDERS - 2) return { label:'📈 قريب من الترقية', bg:'#FEF9C3', color:'#854D0E' }
    if (c.recentOrders30 >= 3) return { label:'🔥 نشط جداً', bg:'#DCFCE7', color:'#166534' }
    if (c.daysSinceLast > ACTIVE_DAYS) return { label:'💤 لم يطلب منذ فترة', bg:'#FEE2E2', color:'#991B1B' }
    return null
  }

  // أعداد العملاء لكل فرع (لمنتقي الفرع) — من كامل قائمة العملاء بلا تأثر بالفلاتر الحالية
  const branchCounts = useMemo(() => {
    const counts = {}
    customersFull.forEach(c => {
      c.branchIds.forEach(bKey => {
        if (!counts[bKey]) counts[bKey] = { total:0, active:0 }
        counts[bKey].total += 1
        if (c.isActive) counts[bKey].active += 1
      })
    })
    return counts
  }, [customersFull])

  const filtered = useMemo(() => {
    let list = customersFull
    if (branchFilter !== 'all') list = list.filter(c => c.branchIds.has(branchFilter))
    if (statusFilter === 'active') list = list.filter(c => c.isActive)
    else if (statusFilter === 'inactive') list = list.filter(c => !c.isActive)
    if (tierFilter !== 'all') list = list.filter(c => c.tier.key === tierFilter)
    const minS = parseFloat(minSpent)
    if (!isNaN(minS) && minS > 0) list = list.filter(c => c.totalSpent >= minS)

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(c => {
        const hay = [c.name || '', c.phone, branchName(c.branchId), c.tier.label].join(' ').toLowerCase()
        return hay.includes(q)
      })
    }

    const sorted = [...list]
    if (sortBy === 'spent') sorted.sort((a,b) => b.totalSpent - a.totalSpent)
    else if (sortBy === 'orders') sorted.sort((a,b) => b.orderCount - a.orderCount)
    else if (sortBy === 'stale') sorted.sort((a,b) => b.daysSinceLast - a.daysSinceLast)
    else if (sortBy === 'points') sorted.sort((a,b) => b.loyaltyBalance - a.loyaltyBalance)
    else if (sortBy === 'upgrade') {
      const dist = c => c.tier.key === 'vip' ? Infinity : c.tier.key === 'regular' ? (VIP_ORDERS - c.orderCount) : (REGULAR_ORDERS - c.orderCount)
      sorted.sort((a,b) => dist(a) - dist(b))
    }
    else sorted.sort((a,b) => new Date(b.lastOrderAt) - new Date(a.lastOrderAt))
    return sorted
  }, [customersFull, search, branchFilter, statusFilter, tierFilter, minSpent, sortBy, branches])

  // إحصائيات Dashboard — 6 أساسية + 4 إضافية قابلة للطي
  const stats = useMemo(() => {
    const total = customersFull.length
    const activeCount = customersFull.filter(c => c.isActive).length
    const inactiveCount = total - activeCount
    const newCount = customersFull.filter(c => c.isNewCustomer).length
    const vipCount = customersFull.filter(c => c.tier.key === 'vip').length
    const totalSpent = customersFull.reduce((s,c) => s + c.totalSpent, 0)
    const avgSpent = total > 0 ? totalSpent / total : 0
    const avgOrders = total > 0 ? customersFull.reduce((s,c) => s + c.orderCount, 0) / total : 0
    const returning = customersFull.filter(c => c.orderCount >= 2).length
    const retentionRate = total > 0 ? (returning / total) * 100 : 0
    return { total, activeCount, inactiveCount, newCount, vipCount, totalSpent, avgSpent, avgOrders, retentionRate }
  }, [customersFull])

  // رؤى ذكية — كل رؤية دالة خالصة تُعيد بطاقة أو null، فتختفي تلقائياً بلا بيانات (بنية Modular لإضافة رؤى مستقبلية بلا إعادة تصميم)
  const insights = useMemo(() => {
    const list = []
    const staleCount = customersFull.filter(c => c.daysSinceLast > 30).length
    if (staleCount > 0) list.push({ id:'stale', icon:'🔥', text:`لديك ${staleCount} ${staleCount===1?'عميل':'عملاء'} لم يطلبوا منذ أكثر من 30 يوماً` })

    const nearUpgrade = customersFull.filter(c => c.tier.key === 'regular' && c.orderCount >= VIP_ORDERS - 2).length
    if (nearUpgrade > 0) list.push({ id:'upgrade', icon:'💎', text:`${nearUpgrade} ${nearUpgrade===1?'عميل قريب':'عملاء قريبون'} من الترقية إلى VIP` })

    // مقارنة متوسط قيمة الطلب هذا الشهر بالشهر الماضي
    const now = new Date()
    const thisMonthOrders = orders.filter(o => o.status !== 'cancelled' && new Date(o.created_at).getMonth() === now.getMonth() && new Date(o.created_at).getFullYear() === now.getFullYear())
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthOrders = orders.filter(o => o.status !== 'cancelled' && new Date(o.created_at).getMonth() === lastMonthDate.getMonth() && new Date(o.created_at).getFullYear() === lastMonthDate.getFullYear())
    if (thisMonthOrders.length > 0 && lastMonthOrders.length > 0) {
      const avgThis = thisMonthOrders.reduce((s,o) => s + (Number(o.total)||0), 0) / thisMonthOrders.length
      const avgLast = lastMonthOrders.reduce((s,o) => s + (Number(o.total)||0), 0) / lastMonthOrders.length
      if (avgLast > 0) {
        const deltaPct = ((avgThis - avgLast) / avgLast) * 100
        if (Math.abs(deltaPct) >= 3) {
          list.push({ id:'avgtrend', icon: deltaPct > 0 ? '📈' : '📉', text:`متوسط قيمة الطلب ${deltaPct > 0 ? 'ارتفع' : 'انخفض'} ${Math.abs(deltaPct).toFixed(0)}٪ عن الشهر الماضي` })
        }
      }
    }

    // الأكثر طلباً بين كل العملاء
    const productCounts = {}
    orders.filter(o => o.status !== 'cancelled').forEach(o => {
      const items = Array.isArray(o.items) ? o.items : []
      items.forEach(it => { if (it?.name) productCounts[it.name] = (productCounts[it.name] || 0) + (Number(it.qty)||1) })
    })
    const topProduct = Object.entries(productCounts).sort((a,b) => b[1]-a[1])[0]
    if (topProduct) list.push({ id:'topproduct', icon:'⭐', text:`الأكثر طلباً بين عملائك: ${topProduct[0]}` })

    return list
  }, [customersFull, orders])

  const secondaryStatCards = [
    { icon:'🆕', val:stats.newCount, label:'عملاء جدد', color:'#1E40AF', bg:'rgba(30,64,175,0.1)' },
    { icon:'💤', val:stats.inactiveCount, label:'عملاء غير نشطين', color:'#991B1B', bg:'rgba(153,27,27,0.1)' },
    { icon:'🧾', val:stats.avgOrders.toFixed(1), label:'متوسط عدد الطلبات', color:'#6B7280', bg:'rgba(107,114,128,0.1)' },
    { icon:'🏆', val: topSpender ? `${topSpender.totalSpent.toFixed(0)} ﷼` : '—', label: topSpender ? `أعلى إنفاقاً: ${topSpender.name || topSpender.phone}` : 'أعلى عميل إنفاقاً', color:'#B45309', bg:'rgba(180,83,9,0.1)' },
  ]

  if (loading) return <Spinner />

  const selectStyle = { padding:'10px 12px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'12.5px', outline:'none', cursor:'pointer', background:'white', flex:'1 1 auto', minWidth:'0' }

  return (
    <AppShell
      active="customers"
      title="👥 العملاء"
      actions={<button onClick={() => navigate('/dashboard')} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer', color:'#374151' }}>← الرئيسية</button>}
    >
        <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>

          {/* رؤى ذكية — تختفي تلقائياً إن لم توجد بيانات لأيٍّ منها */}
          {insights.length > 0 && (
            <div style={{ display:'flex', gap:'8px', overflowX:'auto', marginBottom:'14px', paddingBottom:'2px' }}>
              {insights.map(ins => (
                <div key={ins.id} style={{ flexShrink:0, display:'flex', alignItems:'center', gap:'8px', background:'white', border:'1px solid #E5E7EB', borderRadius:'12px', padding:'9px 13px', maxWidth:'280px' }}>
                  <span style={{ fontSize:'16px', flexShrink:0 }}>{ins.icon}</span>
                  <span style={{ fontSize:'12px', fontWeight:'700', color:'#374151', whiteSpace:'nowrap' }}>{ins.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* إحصائيات أساسية (6) */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'12px', marginBottom:'8px' }}>
            {[
              { icon:'👥', val:stats.total, label:'إجمالي العملاء', color:'#3B82F6', bg:'rgba(59,130,246,0.1)' },
              { icon:'🔥', val:stats.activeCount, label:'عملاء نشطون', color:'#059669', bg:'rgba(5,150,105,0.1)' },
              { icon:'💎', val:stats.vipCount, label:'عملاء VIP', color:'#6D28D9', bg:'rgba(109,40,217,0.1)' },
              { icon:'💰', val:`${stats.totalSpent.toFixed(0)} ﷼`, label:'إجمالي الإنفاق', color:'#10B981', bg:'rgba(16,185,129,0.1)' },
              { icon:'📊', val:`${stats.avgSpent.toFixed(0)} ﷼`, label:'متوسط إنفاق العميل', color:'#F59E0B', bg:'rgba(245,158,11,0.1)' },
              { icon:'🔁', val:`${stats.retentionRate.toFixed(0)}٪`, label:'معدل عودة العملاء', color:'#0891B2', bg:'rgba(8,145,178,0.1)' },
            ].map(s => (
              <div key={s.label} style={{ background:'white', borderRadius:'14px', border:'1px solid #E5E7EB', padding:'14px' }}>
                <div style={{ width:'36px', height:'36px', borderRadius:'10px', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', marginBottom:'10px' }}>{s.icon}</div>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', color:s.color, marginBottom:'3px' }}>{s.val}</div>
                <div style={{ fontSize:'12px', color:'#374151', fontWeight:'700' }}>{s.label}</div>
              </div>
            ))}
          </div>

          <button onClick={() => setShowMoreStats(o => !o)} style={{ width:'100%', padding:'8px', marginBottom:'14px', background:'none', border:'none', color:'#FF6B35', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12.5px', cursor:'pointer' }}>
            {showMoreStats ? 'إخفاء الإحصائيات الإضافية ▲' : 'عرض المزيد من الإحصائيات ▼'}
          </button>
          {showMoreStats && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'12px', marginBottom:'14px' }}>
              {secondaryStatCards.map(s => (
                <div key={s.label} style={{ background:'white', borderRadius:'14px', border:'1px solid #E5E7EB', padding:'14px' }}>
                  <div style={{ width:'36px', height:'36px', borderRadius:'10px', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', marginBottom:'10px' }}>{s.icon}</div>
                  <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', color:s.color, marginBottom:'3px' }}>{s.val}</div>
                  <div style={{ fontSize:'12px', color:'#374151', fontWeight:'700' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* بحث موحّد */}
          <div style={{ position:'relative', marginBottom:'10px' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم، الجوال، أو الفرع..."
              style={{ width:'100%', padding:'10px 14px 10px 36px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'13px', outline:'none', textAlign:'right', boxSizing:'border-box' }}
            />
            <span style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', fontSize:'14px', color:'#9CA3AF' }}>🔍</span>
          </div>

          {/* شريط الفلاتر */}
          <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
            {branches.length > 0 && !branchLocked && (
              <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} style={selectStyle}>
                <option value="all">🏢 كل الفروع ({stats.total})</option>
                <option value="__main__">🏠 الفرع الرئيسي {branchCounts.__main__ ? `(${branchCounts.__main__.total} · ${branchCounts.__main__.active} نشط)` : '(0)'}</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>🏢 {b.name} {branchCounts[b.id] ? `(${branchCounts[b.id].total} · ${branchCounts[b.id].active} نشط)` : '(0)'}</option>
                ))}
              </select>
            )}
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
              <option value="all">الحالة: الكل</option>
              <option value="active">نشط</option>
              <option value="inactive">غير نشط</option>
            </select>
            <select value={tierFilter} onChange={e => setTierFilter(e.target.value)} style={selectStyle}>
              <option value="all">المستوى: الكل</option>
              <option value="vip">💎 VIP</option>
              <option value="regular">⭐ مميز</option>
              <option value="new">🆕 جديد</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={selectStyle}>
              <option value="recent">ترتيب: الأحدث</option>
              <option value="spent">الأكثر إنفاقاً</option>
              <option value="orders">الأكثر طلباً</option>
              <option value="stale">الأقل نشاطاً</option>
              {loyaltyProgram?.enabled && <option value="points">الأعلى نقاطاً</option>}
              <option value="upgrade">الأقرب للترقية</option>
            </select>
            <button onClick={() => setMoreFiltersOpen(true)} style={{ padding:'10px 14px', border:'1.5px solid #E5E7EB', borderRadius:'11px', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12.5px', cursor:'pointer', color:'#374151', flexShrink:0 }}>
              فلاتر أكثر {minSpent ? '●' : ''}
            </button>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 16px', color:'#9CA3AF' }}>
              <div style={{ fontSize:'48px', opacity:0.3, marginBottom:'12px' }}>👥</div>
              <div style={{ fontSize:'16px', fontWeight:'700', color:'#374151', marginBottom:'8px' }}>
                {customersFull.length === 0 ? 'لا يوجد عملاء بعد' : 'لا توجد نتائج مطابقة'}
              </div>
              <div style={{ fontSize:'13px' }}>
                {customersFull.length === 0 ? 'سيظهر العملاء هنا تلقائياً مع أول طلب يدخل رقم جواله' : 'جرّب كلمة بحث أو فلتر مختلف'}
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              {filtered.map(c => {
                const situational = getSituationalBadge(c)
                const digits = phoneDigits(c.phone)
                return (
                  <div key={c.phone} style={{ background:'white', borderRadius:'14px', border:'1.5px solid #E5E7EB', overflow:'hidden' }}>
                    <div onClick={() => { setDetailCustomer(c); setDetailTab('overview') }} style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px', cursor:'pointer' }}>
                      <div style={{ width:'44px', height:'44px', borderRadius:'50%', background:'linear-gradient(135deg,#667eea,#764ba2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'17px', fontWeight:'700', color:'white', fontFamily:'Cairo,sans-serif', flexShrink:0 }}>
                        {(c.name || c.phone).charAt(0)}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'3px', flexWrap:'wrap' }}>
                          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px' }}>{c.name || 'بدون اسم'}</span>
                          <span style={{ padding:'2px 8px', borderRadius:'100px', background:c.tier.bg, color:c.tier.color, fontSize:'10px', fontWeight:'700' }}>{c.tier.label}</span>
                          {situational && <span style={{ padding:'2px 8px', borderRadius:'100px', background:situational.bg, color:situational.color, fontSize:'10px', fontWeight:'700' }}>{situational.label}</span>}
                        </div>
                        <div style={{ fontSize:'11.5px', color:'#9CA3AF', display:'flex', gap:'6px', flexWrap:'wrap' }}>
                          <span style={{ direction:'ltr' }}>{c.phone}</span>
                          <span>· {branchName(c.branchId)}</span>
                        </div>
                      </div>
                      <div style={{ textAlign:'left', flexShrink:0 }}>
                        <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px', color:'#FF6B35' }}>{c.totalSpent.toFixed(0)} ﷼</div>
                        <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{c.orderCount} طلب</div>
                      </div>
                    </div>

                    {/* إجراءات سريعة */}
                    <div style={{ display:'flex', gap:'6px', padding:'0 16px 12px', flexWrap:'wrap' }}>
                      {digits && (
                        <a href={`tel:${digits}`} onClick={e => e.stopPropagation()} style={{ textDecoration:'none', background:'#EFF6FF', color:'#2563EB', borderRadius:'8px', padding:'5px 10px', fontSize:'11.5px', fontWeight:'700' }}>📞 اتصال</a>
                      )}
                      {digits && (
                        <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ textDecoration:'none', background:'#ECFDF5', color:'#059669', borderRadius:'8px', padding:'5px 10px', fontSize:'11.5px', fontWeight:'700' }}>💬 واتساب</a>
                      )}
                      <button onClick={e => { e.stopPropagation(); setDetailCustomer(c); setDetailTab('orders') }} style={{ background:'#F3F4F6', color:'#374151', border:'none', borderRadius:'8px', padding:'5px 10px', fontSize:'11.5px', fontWeight:'700', cursor:'pointer' }}>🧾 الطلبات</button>
                      {loyaltyProgram?.enabled && (
                        <button onClick={e => { e.stopPropagation(); setDetailCustomer(c); setDetailTab('loyalty') }} style={{ background:'#FFF7ED', color:'#C2410C', border:'none', borderRadius:'8px', padding:'5px 10px', fontSize:'11.5px', fontWeight:'700', cursor:'pointer' }}>🎁 المكافآت</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </div>

        {/* Bottom Sheet: فلاتر أكثر */}
        {moreFiltersOpen && (
          <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={() => setMoreFiltersOpen(false)}>
            <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', animation:'fadeIn 0.2s ease' }}/>
            <div onClick={e => e.stopPropagation()} style={{ position:'relative', background:'white', width:'100%', maxWidth:'480px', borderRadius:'24px 24px 0 0', padding:'12px 16px 24px', maxHeight:'70vh', overflowY:'auto', animation:'slideUp 0.25s ease' }}>
              <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'100px', margin:'0 auto 14px' }}/>
              <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', margin:'0 0 16px', textAlign:'center' }}>فلاتر أكثر</h3>
              <label style={{ display:'block', fontSize:'12px', fontWeight:'700', color:'#6B7280', marginBottom:'6px' }}>الحد الأدنى للإنفاق (ريال)</label>
              <input
                type="number" min="0" value={minSpent} onChange={e => setMinSpent(e.target.value)}
                placeholder="مثال: 500"
                style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', outline:'none', direction:'ltr', textAlign:'left', boxSizing:'border-box' }}
              />
              <button onClick={() => { setMinSpent(''); }} style={{ marginTop:'10px', background:'none', border:'none', color:'#9CA3AF', fontSize:'12px', fontWeight:'700', cursor:'pointer', textDecoration:'underline' }}>مسح الفلتر</button>
              <button onClick={() => setMoreFiltersOpen(false)} style={{ width:'100%', marginTop:'18px', padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer' }}>
                تطبيق
              </button>
            </div>
          </div>
        )}

        {/* Bottom Sheet: لوحة تفاصيل العميل */}
        {detailCustomer && (() => {
          const c = detailCustomer
          const situational = getSituationalBadge(c)
          const digits = phoneDigits(c.phone)
          const tabs = [
            { key:'overview', label:'نظرة عامة' },
            { key:'orders', label:`الطلبات (${c.orders.length})` },
            ...(loyaltyProgram?.enabled ? [{ key:'loyalty', label:'الولاء والمكافآت' }] : []),
          ]
          return (
            <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={() => setDetailCustomer(null)}>
              <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', animation:'fadeIn 0.2s ease' }}/>
              <div onClick={e => e.stopPropagation()} style={{ position:'relative', background:'white', width:'100%', maxWidth:'480px', borderRadius:'24px 24px 0 0', padding:'12px 0 0', maxHeight:'86vh', display:'flex', flexDirection:'column', animation:'slideUp 0.25s ease' }}>
                <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'100px', margin:'0 auto 12px', flexShrink:0 }}/>

                <div style={{ padding:'0 18px 14px', display:'flex', alignItems:'center', gap:'12px', flexShrink:0 }}>
                  <div style={{ width:'50px', height:'50px', borderRadius:'50%', background:'linear-gradient(135deg,#667eea,#764ba2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'19px', fontWeight:'700', color:'white', fontFamily:'Cairo,sans-serif', flexShrink:0 }}>
                    {(c.name || c.phone).charAt(0)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap', marginBottom:'3px' }}>
                      <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px' }}>{c.name || 'بدون اسم'}</span>
                      <span style={{ padding:'2px 8px', borderRadius:'100px', background:c.tier.bg, color:c.tier.color, fontSize:'10px', fontWeight:'700' }}>{c.tier.label}</span>
                      {situational && <span style={{ padding:'2px 8px', borderRadius:'100px', background:situational.bg, color:situational.color, fontSize:'10px', fontWeight:'700' }}>{situational.label}</span>}
                    </div>
                    <div style={{ fontSize:'12px', color:'#9CA3AF', direction:'ltr', textAlign:'right' }}>{c.phone}</div>
                  </div>
                  <button onClick={() => setDetailCustomer(null)} style={{ background:'none', border:'none', fontSize:'20px', color:'#9CA3AF', cursor:'pointer', flexShrink:0 }}>✕</button>
                </div>

                <div style={{ display:'flex', gap:'6px', padding:'0 18px 12px', flexShrink:0 }}>
                  {digits && <a href={`tel:${digits}`} style={{ flex:1, textAlign:'center', textDecoration:'none', background:'#EFF6FF', color:'#2563EB', borderRadius:'10px', padding:'9px', fontSize:'12.5px', fontWeight:'700' }}>📞 اتصال</a>}
                  {digits && <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" style={{ flex:1, textAlign:'center', textDecoration:'none', background:'#ECFDF5', color:'#059669', borderRadius:'10px', padding:'9px', fontSize:'12.5px', fontWeight:'700' }}>💬 واتساب</a>}
                </div>

                <div style={{ display:'flex', borderBottom:'1px solid #E5E7EB', padding:'0 18px', flexShrink:0, overflowX:'auto' }}>
                  {tabs.map(t => (
                    <div key={t.key} onClick={() => setDetailTab(t.key)} style={{ padding:'10px 12px', fontSize:'12.5px', fontWeight:'700', color: detailTab === t.key ? '#FF6B35' : '#6B7280', borderBottom: detailTab === t.key ? '2.5px solid #FF6B35' : '2.5px solid transparent', cursor:'pointer', whiteSpace:'nowrap' }}>
                      {t.label}
                    </div>
                  ))}
                </div>

                <div style={{ overflowY:'auto', padding:'16px 18px 24px', flex:1 }}>
                  {detailTab === 'overview' && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'10px' }}>
                        {[
                          { label:'إجمالي الإنفاق', val:`${c.totalSpent.toFixed(0)} ﷼` },
                          { label:'عدد الطلبات', val:c.orderCount },
                          { label:'متوسط قيمة الطلب', val:`${c.avgOrderValue.toFixed(0)} ﷼` },
                          { label:'آخر طلب', val: c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString('ar', { day:'numeric', month:'short' }) : '—' },
                        ].map(s => (
                          <div key={s.label} style={{ background:'#F8F9FB', borderRadius:'12px', padding:'12px' }}>
                            <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', color:'#0F1117' }}>{s.val}</div>
                            <div style={{ fontSize:'11px', color:'#9CA3AF', fontWeight:'700', marginTop:'2px' }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize:'12px', fontWeight:'700', color:'#9CA3AF', marginBottom:'8px' }}>أكثر فرع يطلب منه</div>
                        <div style={{ fontSize:'13.5px', fontWeight:'700' }}>{branchName(c.mostOrderedBranchKey === '__main__' ? null : c.mostOrderedBranchKey)}</div>
                      </div>
                      {c.favoriteProducts.length > 0 && (
                        <div>
                          <div style={{ fontSize:'12px', fontWeight:'700', color:'#9CA3AF', marginBottom:'8px' }}>المنتجات المفضّلة</div>
                          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                            {c.favoriteProducts.map(p => (
                              <div key={p.name} style={{ display:'flex', justifyContent:'space-between', padding:'8px 10px', background:'#F8F9FB', borderRadius:'8px' }}>
                                <span style={{ fontSize:'13px', fontWeight:'600' }}>{p.name}</span>
                                <span style={{ fontSize:'12px', color:'#9CA3AF' }}>×{p.qty}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === 'orders' && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                      {c.orders.map(o => (
                        <div key={o.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:'#F8F9FB', borderRadius:'10px', border: o.status === 'cancelled' ? '1px dashed #FCA5A5' : '1px solid #F0F0F0' }}>
                          <div>
                            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px' }}>{o.order_number}</span>
                            <span style={{ fontSize:'11px', color:'#9CA3AF', marginRight:'8px' }}>
                              {new Date(o.created_at).toLocaleDateString('ar', { day:'numeric', month:'short' })}
                            </span>
                            <span style={{ fontSize:'10px', color:'#9CA3AF', marginRight:'6px' }}>· {branchName(o.branch_id)}</span>
                            {o.status === 'cancelled' && <span style={{ fontSize:'10px', color:'#EF4444', fontWeight:'700', marginRight:'6px' }}>ملغى</span>}
                          </div>
                          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', color: o.status === 'cancelled' ? '#9CA3AF' : '#FF6B35' }}>{Number(o.total).toFixed(0)} ﷼</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {detailTab === 'loyalty' && loyaltyProgram?.enabled && (() => {
                    const threshold = loyaltyProgram.reward_threshold || 0
                    const pct = threshold > 0 ? Math.min(100, (c.loyaltyBalance / threshold) * 100) : 0
                    return (
                      <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                        <div style={{ background:'linear-gradient(120deg,#FF6B3516,#FF6B3508)', border:'1px solid #FF6B3530', borderRadius:'14px', padding:'16px' }}>
                          <div style={{ fontSize:'12px', color:'#9CA3AF', fontWeight:'700', marginBottom:'4px' }}>رصيد النقاط</div>
                          <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'26px', color:'#FF6B35' }}>{c.loyaltyBalance}</div>
                          {threshold > 0 && (
                            <>
                              <div style={{ height:'8px', background:'#E5E7EB', borderRadius:'100px', marginTop:'10px', overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${pct}%`, background:'#FF6B35', borderRadius:'100px' }}/>
                              </div>
                              <div style={{ fontSize:'11.5px', color:'#9CA3AF', marginTop:'6px' }}>
                                {c.loyaltyBalance >= threshold ? 'مؤهّل للمكافأة 🎉' : `باقي ${threshold - c.loyaltyBalance} نقطة على المكافأة`}
                              </div>
                            </>
                          )}
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'10px' }}>
                          <div style={{ background:'#F8F9FB', borderRadius:'12px', padding:'12px' }}>
                            <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px' }}>{c.loyaltyEarned}</div>
                            <div style={{ fontSize:'11px', color:'#9CA3AF', fontWeight:'700', marginTop:'2px' }}>نقاط مكتسبة</div>
                          </div>
                          <div style={{ background:'#F8F9FB', borderRadius:'12px', padding:'12px' }}>
                            <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px' }}>{c.loyaltyRedeemed}</div>
                            <div style={{ fontSize:'11px', color:'#9CA3AF', fontWeight:'700', marginTop:'2px' }}>نقاط مُستبدَلة</div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          )
        })()}
    </AppShell>
  )
}
