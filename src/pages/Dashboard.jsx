import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { calculateMenuReadiness } from '../lib/menuReadiness'
import { trackOwnerMilestone } from '../lib/analytics'

const PERIODS = { today: 1, week: 7, month: 30, quarter: 90 }
const STATUS = {
  pending: { label: 'جديد', tone: 'warning' },
  preparing: { label: 'قيد التحضير', tone: 'info' },
  ready: { label: 'جاهز', tone: 'success' },
  completed: { label: 'مكتمل', tone: 'neutral' },
  cancelled: { label: 'ملغي', tone: 'danger' },
}
const ORDER_FILTERS = [['all', 'كل الطلبات'], ['pending', 'جديد'], ['preparing', 'قيد التحضير'], ['ready', 'جاهز'], ['completed', 'مكتمل']]

function Icon({ name, size = 18, stroke = 'currentColor' }) {
  const paths = {
    spark: <><path d="m12 3-1.4 5.2L5 10l5.6 1.8L12 17l1.4-5.2L19 10l-5.6-1.8L12 3Z"/><path d="m19 16-.6 2.4L16 19l2.4.6L19 22l.6-2.4L22 19l-2.4-.6L19 16Z"/></>,
    share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></>,
    external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></>,
    cart: <><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H6"/></>,
    wallet: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17.5v-11Z"/><path d="M4 8h15a2 2 0 0 1 2 2v3h-5a2 2 0 0 1 0-4h5"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
    alert: <><path d="M10.3 4.3 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
    chart: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-7"/></>,
    menu: <><path d="M4 5h16M4 12h16M4 19h16"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    qr: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    refresh: <><path d="M20 11a8.1 8.1 0 0 0-14.7-3L3 11"/><path d="M3 5v6h6M4 13a8.1 8.1 0 0 0 14.7 3L21 13"/><path d="M21 19v-6h-6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></>,
    file: <><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.spark}</svg>
}

const startOfDay = (daysAgo = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(0, 0, 0, 0); return d }
const money = value => `${Math.round(Number(value) || 0).toLocaleString('ar-SA')} ر.س`
const percent = (current, previous) => previous ? Math.round(((current - previous) / previous) * 100) : current ? 100 : 0
const dateLabel = iso => new Date(iso).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })

function Skeleton({ className = '' }) { return <div className={`skeleton ${className}`} /> }
function EmptyState({ icon = 'file', title, text, action, onAction }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name={icon} size={22} /></div><strong>{title}</strong>{text && <span>{text}</span>}{action && <button className="text-button" onClick={onAction}>{action}<Icon name="arrow" size={14} /></button>}</div>
}
function ErrorState({ retry }) { return <div className="error-state"><Icon name="alert" size={20} /><span>تعذر تحميل البيانات</span><button onClick={retry}><Icon name="refresh" size={14} /> إعادة المحاولة</button></div> }
function Section({ title, eyebrow, action, onAction, children, className = '' }) { return <section className={`panel ${className}`}><div className="panel-head"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div>{action && <button className="text-button" onClick={onAction}>{action}<Icon name="arrow" size={14} /></button>}</div>{children}</section> }

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, restaurant } = useAuthStore()
  const { isMobile } = useBreakpoint()
  const [orders, setOrders] = useState([])
  const [summary, setSummary] = useState(null)
  const [menu, setMenu] = useState({ categories: [], products: [], branches: [] })
  const [reviews, setReviews] = useState([])
  const [period, setPeriod] = useState('week')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedPoint, setSelectedPoint] = useState(null)
  const [now, setNow] = useState(Date.now())

  const loadData = async () => {
    if (!restaurant) { setLoading(false); return }
    setLoading(true); setError(false)
    try {
      const from = startOfDay(1).toISOString()
      const [{ data: orderData, error: orderError }, { data: reviewData }, { data: branches }] = await Promise.all([
        supabase.from('orders').select('*').eq('restaurant_id', restaurant.id).gte('created_at', from).order('created_at', { ascending: false }).limit(500),
        supabase.from('reviews').select('rating,created_at').eq('restaurant_id', restaurant.id).order('created_at', { ascending: false }).limit(200),
        supabase.from('branches').select('id,is_primary,is_active,is_paused,opening_hours,phone,menu_clone_status').eq('restaurant_id', restaurant.id),
      ])
      if (orderError) throw orderError
      setOrders(orderData || []); setReviews(reviewData || [])
      const branchIds = (branches || []).map(b => b.id)
      if (branchIds.length) {
        const [{ data: categories }, { data: products }] = await Promise.all([
          supabase.from('categories').select('id,name,is_visible,branch_id').in('branch_id', branchIds),
          supabase.from('products').select('id,name,description,image_url,price,is_available,category_id,branch_id').in('branch_id', branchIds),
        ])
        setMenu({ categories: categories || [], products: products || [], branches: branches || [] })
      } else setMenu({ categories: [], products: [], branches: [] })
    } catch (e) { console.error(e); setError(true) } finally { setLoading(false) }
  }

  useEffect(() => { loadData(); const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer) }, [restaurant?.id])
  useEffect(() => {
    if (!restaurant) return
    let active = true
    const loadSummary = async () => {
      setSummaryLoading(true)
      const from = startOfDay(PERIODS[period] || 7).toISOString()
      const { data, error: rpcError } = await supabase.rpc('get_dashboard_summary', { p_restaurant_id: restaurant.id, p_from: from, p_to: new Date().toISOString() })
      if (active) { setSummary(rpcError ? null : data || null); setSummaryLoading(false) }
    }
    loadSummary()
    return () => { active = false }
  }, [restaurant?.id, period])
  useEffect(() => {
    if (!restaurant) return
    const channel = supabase.channel(`dashboard-orders-${restaurant.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurant.id}` }, payload => {
      if (payload.eventType === 'INSERT') { setOrders(prev => [payload.new, ...prev]); toast.success(`طلب جديد ${payload.new.order_number || ''}`) }
      if (payload.eventType === 'UPDATE') setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o))
    }).subscribe()
    return () => supabase.removeChannel(channel)
  }, [restaurant?.id])

  const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString())
  const yesterdayOrders = orders.filter(o => new Date(o.created_at).toDateString() === new Date(Date.now() - 86400000).toDateString())
  const revenue = list => list.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + Number(o.total || 0), 0)
  const todayRevenue = revenue(todayOrders), yesterdayRevenue = revenue(yesterdayOrders)
  const completed = todayOrders.filter(o => o.status === 'completed')
  const averageOrder = completed.length ? todayRevenue / completed.length : 0
  const customers = new Set(todayOrders.map(o => o.customer_phone).filter(Boolean)).size
  const activeOrders = todayOrders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status))
  const avgRating = reviews.length ? (reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviews.length).toFixed(1) : null
  const missingImages = menu.products.filter(p => !p.image_url).length
  const missingDescriptions = menu.products.filter(p => !p.description?.trim()).length
  const primaryBranch = menu.branches.find(branch => branch.is_primary && branch.is_active !== false && !branch.is_paused && branch.menu_clone_status !== 'copying' && branch.menu_clone_status !== 'failed') || menu.branches.find(branch => branch.is_active !== false && !branch.is_paused && branch.menu_clone_status !== 'copying' && branch.menu_clone_status !== 'failed') || null
  const primaryCategories = primaryBranch ? menu.categories.filter(category => category.branch_id === primaryBranch.id) : []
  const primaryProducts = primaryBranch ? menu.products.filter(product => product.branch_id === primaryBranch.id) : []
  const menuReadiness = calculateMenuReadiness({ restaurant, branch: primaryBranch, categories: primaryCategories, products: primaryProducts })
  const healthChecks = [{ label: 'بيانات المطعم', ok: Boolean(restaurant?.name) }, { label: 'الأقسام', ok: menu.categories.length > 0 }, { label: 'الأسعار', ok: menu.products.length > 0 && menu.products.every(p => Number(p.price) > 0) }, { label: 'الأصناف', ok: menu.products.length > 0 }, { label: 'صور الأصناف', ok: menu.products.length > 0 && missingImages === 0 }, { label: 'أوصاف الأصناف', ok: menu.products.length > 0 && missingDescriptions === 0 }]
  const health = Math.round((healthChecks.filter(x => x.ok).length / healthChecks.length) * 100)
  const attention = [
    !menuReadiness.minimumReady && { label: 'أكمل أساسيات المنيو', hint: `المتبقي: ${menuReadiness.nextEssential?.label || 'الأساسيات'}`, count: menuReadiness.essentialsTotal - menuReadiness.essentialsDone, icon: 'menu', path: '/menu', state: { tab: 'products' }, tone: 'warning' },
    { label: 'طلبات جديدة', count: todayOrders.filter(o => o.status === 'pending').length, icon: 'cart', path: '/orders', tone: 'warning' },
    { label: 'أصناف بدون صور', count: missingImages, icon: 'image', path: '/menu', state: { tab: 'products' }, tone: 'info' },
    { label: 'أصناف بدون وصف', count: missingDescriptions, icon: 'file', path: '/menu', state: { tab: 'products' }, tone: 'neutral' },
  ].filter(Boolean).filter(x => x.count > 0)

  const chart = useMemo(() => {
    const days = period === 'today' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : 12
    const points = Array.from({ length: days }, (_, index) => {
      const date = new Date();
      if (period === 'quarter') date.setMonth(date.getMonth() - (days - index - 1))
      else date.setDate(date.getDate() - (days - index - 1))
      const key = date.toISOString().slice(0, 10)
      const found = (summary?.chart_daily || []).find(item => item.d === key)
      return { key, label: period === 'today' ? 'اليوم' : date.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' }), value: Number(found?.value || 0), orders: orders.filter(o => o.created_at?.slice(0, 10) === key).length }
    })
    const max = Math.max(...points.map(p => p.value), 1)
    return points.map((p, i) => ({ ...p, x: 4 + i * (92 / Math.max(points.length - 1, 1)), y: 88 - (p.value / max) * 68 }))
  }, [summary, period, orders])
  const chartPath = chart.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
  const chartHasData = chart.some(point => point.value > 0)
  const chartLabelStep = isMobile ? Math.max(1, Math.ceil(chart.length / 4)) : Math.max(1, Math.ceil(chart.length / 7))
  const menuHealthAction = !menu.products.length || health < 80 ? 'تحسين المنيو' : health < 100 ? 'إكمال المنيو' : 'مراجعة المنيو'
  const filteredOrders = todayOrders.filter(o => filter === 'all' || o.status === filter).slice(0, 6)
  const topProducts = (summary?.products || []).slice(0, 5)
  const timeAgo = iso => { const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)); return minutes < 1 ? 'الآن' : minutes < 60 ? `منذ ${minutes} د` : `منذ ${Math.floor(minutes / 60)} س` }
  const go = (path, state) => navigate(path, state ? { state } : undefined)
  const shareMenu = async () => { const url = `${window.location.origin}/menu/${restaurant?.slug}`; try { await navigator.clipboard.writeText(url); trackOwnerMilestone('menu_link_copied', { restaurantId: restaurant?.id, props: { source: 'dashboard' } }); toast.success('تم نسخ رابط المنيو') } catch { toast.error('تعذر نسخ الرابط') } }
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'بك'

  const CSS = `
    .dash2{--orange:#f26622;--ink:#17202b;--muted:#718096;--line:#e8edf2;--soft:#f6f8fa;--green:#139a68;--red:#d94a4a;--blue:#3578d4;direction:rtl;color:var(--ink);font-family:Tajawal,Arial,sans-serif;background:#f7f9fb;min-height:100%;overflow:auto}.dash2 *{box-sizing:border-box}.dash2 .container{max-width:1320px;margin:auto;padding:28px 32px 44px}.dash2 .hero{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:26px}.dash2 h1,.dash2 h2,.dash2 p{margin:0}.dash2 h1{font-size:27px;letter-spacing:-.5px}.dash2 .sub{margin-top:8px;color:var(--muted);font-size:14px}.dash2 .hero-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.dash2 button{font:inherit;cursor:pointer}.dash2 .button{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:10px;padding:10px 14px;font-weight:800;font-size:12px;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.dash2 .button:hover{border-color:#f5b18d;box-shadow:0 5px 16px #15202b0d}.dash2 .button:active{transform:scale(.97)}.dash2 .button.primary{color:#fff;background:var(--orange);border-color:var(--orange);box-shadow:0 5px 15px #f2662233}.dash2 .store-state{display:flex;align-items:center;gap:8px;color:var(--green);font-size:12px;font-weight:800;background:#eaf8f1;padding:9px 12px;border-radius:10px}.dash2 .dot{width:7px;height:7px;border-radius:50%;background:currentColor}.dash2 .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}.dash2 .kpi,.dash2 .panel{background:#fff;border:1px solid var(--line);border-radius:16px}.dash2 .kpi{padding:18px;position:relative;overflow:hidden}.dash2 .kpi:before{content:'';position:absolute;inset:0 0 auto;height:3px;background:var(--accent);opacity:.8}.dash2 .kpi-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:19px}.dash2 .kpi-icon{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 12%,white);color:var(--accent)}.dash2 .trend{font-size:11px;font-weight:900;border-radius:20px;padding:4px 7px;color:var(--green);background:#eaf8f1}.dash2 .trend.down{color:var(--red);background:#fceeee}.dash2 .kpi-value{font-size:25px;font-weight:900;letter-spacing:-.5px}.dash2 .kpi-label{margin-top:5px;font-size:13px;font-weight:800}.dash2 .kpi-note{margin-top:10px;color:var(--muted);font-size:11px}.dash2 .layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(280px,.85fr);gap:16px}.dash2 .stack{display:flex;flex-direction:column;gap:16px}.dash2 .panel{overflow:hidden}.dash2 .panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 19px 15px;border-bottom:1px solid var(--line)}.dash2 .panel-head h2{font-size:16px;font-weight:900}.dash2 .eyebrow{font-size:10px;color:var(--muted);font-weight:800;margin-bottom:4px}.dash2 .text-button{display:inline-flex;align-items:center;gap:6px;background:transparent;border:0;color:var(--orange);font-size:12px;font-weight:900;padding:3px}.dash2 .chart-tools{display:flex;gap:4px;background:var(--soft);border-radius:9px;padding:4px}.dash2 .chart-tools button{border:0;background:transparent;color:var(--muted);padding:6px 9px;border-radius:7px;font-size:11px;font-weight:800}.dash2 .chart-tools button.active{background:#fff;color:var(--orange);box-shadow:0 1px 4px #17202b14}.dash2 .chart-wrap{padding:17px 18px 11px;position:relative}.dash2 .chart-empty{padding-top:4px;padding-bottom:4px}.dash2 .chart-svg{width:100%;height:214px;display:block;overflow:visible}.dash2 .chart-grid{stroke:#eef1f4;stroke-width:.35}.dash2 .chart-line{stroke:var(--orange);stroke-width:1.4;fill:none;stroke-linecap:round;stroke-linejoin:round}.dash2 .chart-area{fill:url(#dash-area)}.dash2 .chart-point{fill:#fff;stroke:var(--orange);stroke-width:1.2;cursor:pointer}.dash2 .chart-point:hover,.dash2 .chart-point.selected{fill:var(--orange);stroke:#fff;stroke-width:1}.dash2 .tooltip{position:absolute;top:26px;right:20px;background:#17202b;color:#fff;border-radius:9px;padding:8px 10px;font-size:11px;line-height:1.8;box-shadow:0 8px 20px #17202b22}.dash2 .orders-tabs{display:flex;gap:6px;padding:13px 18px 0;overflow:auto}.dash2 .orders-tabs button{white-space:nowrap;border:0;background:transparent;color:var(--muted);font-size:11px;font-weight:800;padding:6px 10px;border-bottom:2px solid transparent}.dash2 .orders-tabs button.active{color:var(--orange);border-color:var(--orange)}.dash2 .order-list{padding:4px 18px 10px}.dash2 .order-row{display:grid;grid-template-columns:1.1fr 1.5fr .8fr .8fr .65fr;align-items:center;gap:10px;padding:14px 0;border-bottom:1px solid #f0f2f4;font-size:12px}.dash2 .order-row:last-child{border-bottom:0}.dash2 .order-no{font-weight:900}.dash2 .customer{display:flex;align-items:center;gap:8px;min-width:0}.dash2 .avatar{width:29px;height:29px;display:grid;place-items:center;border-radius:9px;background:#fff0e8;color:var(--orange);font-weight:900;flex:none}.dash2 .truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dash2 .amount{font-weight:900}.dash2 .muted{color:var(--muted);font-size:11px}.dash2 .badge{display:inline-flex;justify-content:center;white-space:nowrap;border-radius:20px;padding:5px 8px;font-size:10px;font-weight:900}.dash2 .badge.warning{background:#fff4dc;color:#a66a00}.dash2 .badge.info{background:#eaf2ff;color:#2865b6}.dash2 .badge.success{background:#e8f7f0;color:#137a54}.dash2 .badge.neutral{background:#f0f2f4;color:#687585}.dash2 .badge.danger{background:#fdecec;color:#b63c3c}.dash2 .attention{padding:5px 18px 14px}.dash2 .attention-item{display:flex;align-items:center;gap:11px;padding:12px 0;border-bottom:1px solid #f0f2f4;cursor:pointer}.dash2 .attention-item:last-child{border-bottom:0}.dash2 .attention-icon{width:31px;height:31px;display:grid;place-items:center;border-radius:9px;background:#fff4dc;color:#a66a00}.dash2 .attention-item.info .attention-icon{background:#eaf2ff;color:var(--blue)}.dash2 .attention-item.neutral .attention-icon{background:#f0f2f4;color:var(--muted)}.dash2 .attention-copy{flex:1;min-width:0}.dash2 .attention-copy strong{font-size:12px;display:block}.dash2 .attention-copy span{font-size:10px;color:var(--muted)}.dash2 .count{font-size:13px;font-weight:900}.dash2 .live-list,.dash2 .product-list{padding:6px 18px 15px}.dash2 .live-item{padding:12px 0;border-bottom:1px solid #f0f2f4;cursor:pointer}.dash2 .live-item:last-child{border-bottom:0}.dash2 .live-top,.dash2 .live-bottom{display:flex;justify-content:space-between;gap:8px;align-items:center}.dash2 .live-top{font-size:12px;font-weight:900}.dash2 .live-bottom{margin-top:7px;font-size:11px;color:var(--muted)}.dash2 .live-bottom b{color:var(--orange)}.dash2 .product-row{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #f0f2f4}.dash2 .product-row:last-child{border-bottom:0}.dash2 .rank{width:24px;height:24px;border-radius:7px;background:var(--soft);display:grid;place-items:center;color:var(--muted);font-size:11px;font-weight:900}.dash2 .product-name{flex:1;min-width:0;font-size:12px;font-weight:800}.dash2 .product-meta{text-align:left;color:var(--muted);font-size:10px}.dash2 .product-meta b{display:block;color:var(--ink);font-size:12px}.dash2 .health{padding:18px}.dash2 .health-score{display:flex;justify-content:space-between;align-items:end;margin-bottom:12px}.dash2 .health-score strong{font-size:30px;font-weight:900;color:var(--orange)}.dash2 .health-score span{font-size:11px;color:var(--muted)}.dash2 .progress{height:8px;background:#f0f2f4;border-radius:8px;overflow:hidden}.dash2 .progress span{display:block;height:100%;background:var(--orange);border-radius:8px}.dash2 .checks{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;margin-top:18px}.dash2 .check{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--muted)}.dash2 .check.ok{color:var(--green)}.dash2 .check.warn{color:#a66a00}.dash2 .quick{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding:16px 18px}.dash2 .quick button{min-height:68px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;border:1px solid var(--line);background:#fff;border-radius:11px;color:var(--ink);font-size:10px;font-weight:900}.dash2 .quick button:hover{border-color:#f5b18d;color:var(--orange)}.dash2 .quick button.primary{background:#fff4ee;border-color:#ffd8c3;color:var(--orange)}.dash2 .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:96px;padding:12px;text-align:center;color:var(--muted)}.dash2 .empty-state strong{color:var(--ink);font-size:12px;font-weight:800}.dash2 .empty-state span{font-size:11px}.dash2 .empty-icon{width:34px;height:34px;border-radius:10px;background:var(--soft);display:grid;place-items:center;color:#9aa5b1}.dash2 .error-state{display:flex;align-items:center;justify-content:center;gap:9px;padding:24px;color:var(--red);font-size:13px;font-weight:800}.dash2 .error-state button{display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--orange);font-size:12px;font-weight:900}.dash2 .skeleton{background:linear-gradient(90deg,#f1f3f5 25%,#fafbfc 37%,#f1f3f5 63%);background-size:400% 100%;animation:shimmer 1.4s ease infinite;border-radius:8px}.dash2 .skeleton.k{height:130px}.dash2 .skeleton.panel-s{height:275px}.dash2 .skeleton.row-s{height:55px;margin:0 18px 8px}@keyframes shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}@media(max-width:1050px){.dash2 .container{padding:22px 20px 36px}.dash2 .layout{grid-template-columns:1fr}.dash2 .kpis{grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){.dash2 .container{padding:18px 13px 28px}.dash2 .hero{display:block}.dash2 .hero-actions{margin-top:16px}.dash2 .hero-actions .button.primary{flex:1}.dash2 h1{font-size:23px}.dash2 .kpis{gap:9px}.dash2 .kpi{padding:14px}.dash2 .kpi-value{font-size:21px}.dash2 .kpi-icon{width:33px;height:33px}.dash2 .kpi-note{font-size:10px}.dash2 .panel-head{padding:15px}.dash2 .chart-tools button{padding:5px 7px}.dash2 .order-list{padding-left:13px;padding-right:13px;overflow-x:auto}.dash2 .order-row{min-width:590px}.dash2 .checks{gap:9px}.dash2 .quick{grid-template-columns:repeat(2,1fr);padding:13px}.dash2 .store-state{width:max-content}.dash2 .tooltip{right:14px}}
  `

  return <AppShell active="dashboard" title="الرئيسية" badges={{ orders: activeOrders.length }} actions={<div className="topbar-date">{new Date().toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' })}</div>}>
    <style>{CSS}</style>
    <div className="dash2"><div className="container">
      <header className="hero"><div><h1>مرحبًا {firstName}</h1><p className="sub">إليك ملخص أداء {restaurant?.name || 'مطعمك'} اليوم، وما يحتاج انتباهك الآن.</p></div><div className="hero-actions"><div className="store-state"><span className="dot" /> المطعم مفتوح ويستقبل الطلبات</div><button className="button" onClick={() => window.open(`${window.location.origin}/menu/${restaurant?.slug}`, '_blank')}><Icon name="external" size={15} /> معاينة المنيو</button><button className="button" onClick={() => go('/qr')}><Icon name="qr" size={15} /> QR Code</button><button className="button primary" onClick={shareMenu}><Icon name="share" size={15} /> مشاركة المنيو</button></div></header>

      {error ? <div className="panel"><ErrorState retry={loadData} /></div> : <>
        <div className="kpis">{loading ? [1, 2, 3, 4].map(i => <Skeleton key={i} className="k" />) : <>
          {          [{ label: 'مبيعات اليوم', value: money(todayRevenue), note: todayRevenue ? `مقارنة بـ ${money(yesterdayRevenue)} أمس` : 'لا توجد مبيعات اليوم', icon: 'wallet', accent: '#f26622', trend: todayRevenue ? percent(todayRevenue, yesterdayRevenue) : undefined }, { label: 'طلبات اليوم', value: todayOrders.length, note: todayOrders.length ? `${activeOrders.length} طلبات تحتاج إجراء` : 'لا توجد طلبات اليوم', icon: 'cart', accent: '#3578d4', trend: todayOrders.length ? percent(todayOrders.length, yesterdayOrders.length) : undefined }, { label: 'متوسط قيمة الطلب', value: money(averageOrder), note: completed.length ? `${completed.length} طلبات مكتملة` : 'لا توجد طلبات مكتملة', icon: 'chart', accent: '#139a68' }, { label: 'العملاء', value: customers, note: customers ? (avgRating ? `متوسط التقييم ${avgRating} من 5` : 'لا توجد تقييمات بعد') : 'لا يوجد عملاء بعد', icon: 'users', accent: '#7b61d1' }].map(kpi => <div className="kpi" style={{ '--accent': kpi.accent }} key={kpi.label}><div className="kpi-top"><div className="kpi-icon"><Icon name={kpi.icon} size={18} /></div>{kpi.trend !== undefined && <span className={`trend ${kpi.trend < 0 ? 'down' : ''}`}>{kpi.trend >= 0 ? '↑' : '↓'} {Math.abs(kpi.trend)}%</span>}</div><div className="kpi-value">{kpi.value}</div><div className="kpi-label">{kpi.label}</div><div className="kpi-note">{kpi.note}</div></div>)}</>}</div>

        <div className="layout"><div className="stack">
          <Section title="المبيعات" eyebrow="نظرة أداء" action="عرض التقرير" onAction={() => go('/analytics')}>
            <div className="panel-head" style={{ borderBottom: 0, paddingTop: 0 }}><span className="muted">إجمالي الفترة: <b style={{ color: 'var(--ink)' }}>{chartHasData ? money((summary?.chart_daily || []).reduce((s, x) => s + Number(x.value || 0), 0)) : 'لا توجد مبيعات'}</b></span><div className="chart-tools">{[['today', 'اليوم'], ['week', '7 أيام'], ['month', '30 يوم'], ['quarter', '3 أشهر']].map(([key, label]) => <button key={key} className={period === key ? 'active' : ''} onClick={() => setPeriod(key)}>{label}</button>)}</div></div>
            {summaryLoading ? <div className="chart-wrap"><Skeleton className="panel-s" /></div> : !chartHasData ? <div className="chart-wrap chart-empty"><EmptyState icon="chart" title="لا توجد بيانات مبيعات بعد" text="ستظهر حركة المبيعات هنا بعد استقبال أول طلب." /></div> : <div className="chart-wrap"><svg className="chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="dash-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f26622" stopOpacity=".22"/><stop offset="1" stopColor="#f26622" stopOpacity="0"/></linearGradient></defs>{[20, 43, 66, 89].map(y => <line key={y} className="chart-grid" x1="0" y1={y} x2="100" y2={y} />)}{chart.length > 1 && <path className="chart-area" d={`${chartPath} L${chart[chart.length - 1].x} 90 L${chart[0].x} 90 Z`} />}{chart.length > 1 && <path className="chart-line" d={chartPath} />}{chart.map((point, index) => <g key={point.key} onMouseEnter={() => setSelectedPoint(point)} onFocus={() => setSelectedPoint(point)} tabIndex="0"><circle className={`chart-point ${selectedPoint?.key === point.key ? 'selected' : ''}`} cx={point.x} cy={point.y} r={selectedPoint?.key === point.key ? 1.8 : 1.1} /><text x={point.x} y="98" textAnchor="middle" fontSize="3.1" fill="#8995a2">{index % chartLabelStep === 0 || index === chart.length - 1 ? point.label : ''}</text></g>)}</svg>{selectedPoint && <div className="tooltip"><b>{selectedPoint.label}</b><br />المبيعات: {money(selectedPoint.value)}<br />الطلبات: {selectedPoint.orders}</div>}</div>}
          </Section>
          <Section title="آخر الطلبات" eyebrow="التشغيل اليومي" action="عرض جميع الطلبات" onAction={() => go('/orders')}>
            <div className="orders-tabs">{ORDER_FILTERS.map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div>
            {loading ? <div className="order-list">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="row-s" />)}</div> : filteredOrders.length === 0 ? <EmptyState icon="cart" title="لا توجد طلبات بهذا الفلتر" text="ستظهر الطلبات الجديدة هنا مباشرة." action="إدارة الطلبات" onAction={() => go('/orders')} /> : <div className="order-list">{filteredOrders.map(o => <div className="order-row" key={o.id} onClick={() => go('/orders')}><span className="order-no">#{o.order_number || o.id?.slice(0, 6)}</span><span className="customer"><span className="avatar">{(o.customer_name || 'ع').charAt(0)}</span><span className="truncate">{o.customer_name || 'عميل'}</span></span><span className="muted">{Array.isArray(o.items) ? `${o.items.length} أصناف` : 'طلب'}</span><span className={`badge ${STATUS[o.status]?.tone || 'neutral'}`}>{STATUS[o.status]?.label || o.status}</span><span className="amount">{money(o.total)}<small className="muted"> · {timeAgo(o.created_at)}</small></span></div>)}</div>}
          </Section>
        </div>
        <div className="stack">
          <Section title="يحتاج انتباهك" eyebrow="مركز الإجراءات" action={attention.length ? 'مراجعة' : undefined} onAction={() => go('/orders')}>
            {attention.length ? <div className="attention">{attention.map(item => <div className={`attention-item ${item.tone}`} key={item.label} onClick={() => go(item.path, item.state)}><div className="attention-icon"><Icon name={item.icon} size={16} /></div><div className="attention-copy"><strong>{item.label}</strong><span>{item.hint || 'اضغط للانتقال إلى الإجراء'}</span></div><span className="count">{item.count}</span><Icon name="arrow" size={14} /></div>)}</div> : <EmptyState icon="check" title="كل شيء على ما يرام" text="لا توجد إجراءات معلقة حاليًا." />}
          </Section>
          <Section title="الطلبات المباشرة" eyebrow="تحديث لحظي" action="فتح الطلبات" onAction={() => go('/orders')}>
            {activeOrders.length ? <div className="live-list">{activeOrders.slice(0, 4).map(o => <div className="live-item" key={o.id} onClick={() => go('/orders')}><div className="live-top"><span>#{o.order_number || o.id?.slice(0, 6)}</span><span className={`badge ${STATUS[o.status]?.tone || 'neutral'}`}>{STATUS[o.status]?.label || o.status}</span></div><div className="live-bottom"><span>{o.customer_name || 'عميل'}</span><b>{money(o.total)} · {timeAgo(o.created_at)}</b></div></div>)}</div> : <EmptyState icon="check" title="لا توجد طلبات نشطة" text="ستظهر الطلبات الجديدة هنا لحظة وصولها." />}
          </Section>
          <Section title="الأكثر طلبًا 🔥" eyebrow="أداء المنيو" action="عرض تقرير المنيو" onAction={() => go('/analytics')}>
            {summaryLoading ? <div className="product-list">{[1, 2, 3].map(i => <Skeleton key={i} className="row-s" />)}</div> : topProducts.length ? <div className="product-list">{topProducts.map((p, i) => <div className="product-row" key={p.name}><span className="rank">{i + 1}</span><span className="product-name truncate">{p.name}</span><span className="product-meta"><b>{Number(p.count || 0).toLocaleString('ar-SA')}</b> طلب</span><span className="product-meta"><b>غير متاح</b> الإيراد</span></div>)}</div> : <EmptyState icon="menu" title="لا توجد طلبات أصناف بعد" text="ستظهر الأصناف الأكثر طلبًا بعد أول الطلبات." />}
          </Section>
          <Section title="جاهزية المنيو" eyebrow={menuReadiness.minimumReady ? 'جاهز للمشاركة' : 'الأساسيات أولاً'} action={menuHealthAction} onAction={() => go('/menu')}><div className="health"><div className="health-score"><strong>{menuReadiness.minimumReady ? 'جاهز' : `${menuReadiness.essentialsDone}/${menuReadiness.essentialsTotal}`}</strong><span>{menuReadiness.minimumReady ? 'الحد الأدنى مكتمل' : `المتبقي: ${menuReadiness.nextEssential?.label || 'الأساسيات'}`}</span></div><div className="progress"><span style={{ width: `${(menuReadiness.essentialsDone / menuReadiness.essentialsTotal) * 100}%` }} /></div><div className="checks">{menuReadiness.essentials.map(check => <div className={`check ${check.complete ? 'ok' : 'warn'}`} key={check.key}><Icon name={check.complete ? 'check' : 'alert'} size={14} /> {check.label}</div>)}</div></div></Section>
          <Section title="إجراءات سريعة" eyebrow="اختصارات العمل"><div className="quick"><button className="primary" onClick={() => go('/menu', { tab: 'products' })}><Icon name="plus" size={18} />إضافة صنف</button><button onClick={() => go('/menu')}><Icon name="menu" size={18} />إدارة المنيو</button><button onClick={() => window.open(`${window.location.origin}/menu/${restaurant?.slug}`, '_blank')}><Icon name="external" size={18} />معاينة المنيو</button><button onClick={() => go('/qr')}><Icon name="qr" size={18} />QR Code</button><button onClick={() => go('/analytics')}><Icon name="chart" size={18} />التقرير</button><button onClick={shareMenu}><Icon name="share" size={18} />مشاركة المنيو</button></div></Section>
        </div></div>
      </>}
    </div></div>
  </AppShell>
}
