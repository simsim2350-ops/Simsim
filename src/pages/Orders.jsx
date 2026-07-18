import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { vatBreakdown, orderBreakdown, itemsGross } from '../lib/pricing'
import { fetchBranches } from '../lib/branchesApi'

const STATUS = {
  pending:   { label:'انتظار',      bg:'#FEF3C7', color:'#92400E', next:'preparing', nextLabel:'✓ قبول وتحضير' },
  preparing: { label:'قيد التحضير', bg:'#DBEAFE', color:'#1E40AF', next:'ready',     nextLabel:'✅ جاهز' },
  ready:     { label:'جاهز',        bg:'#D1FAE5', color:'#065F46', next:'completed',  nextLabel:'🎉 تم التسليم' },
  completed: { label:'مكتمل',       bg:'#F3F4F6', color:'#6B7280', next:null,         nextLabel:'' },
  cancelled: { label:'ملغي',        bg:'#FEE2E2', color:'#991B1B', next:null,         nextLabel:'' },
}

// أعمدة لوحة كانبان حسب تدفق العمل
const COLS = [
  { key:'pending',   label:'انتظار',        emoji:'⏳', accent:'#F59E0B' },
  { key:'preparing', label:'قيد التحضير',   emoji:'👨‍🍳', accent:'#3B82F6' },
  { key:'ready',     label:'جاهز للتسليم',  emoji:'✅', accent:'#10B981' },
  { key:'completed', label:'مكتمل',         emoji:'🎉', accent:'#9CA3AF' },
]

const TYPE_LABEL = { dine_in:'🪑 محلي', takeaway:'🥡 سفري', delivery:'🛵 توصيل' }
const TYPE_META = {
  dine_in:  { label:'محلي',  emoji:'🪑', c:'#7C3AED', bg:'#F3E8FF' },
  takeaway: { label:'سفري',  emoji:'🥡', c:'#B45309', bg:'#FEF3C7' },
  delivery: { label:'توصيل', emoji:'🛵', c:'#0369A1', bg:'#E0F2FE' },
}
const typeChip = (t) => TYPE_META[t] || TYPE_META.dine_in

function Spinner() {
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0F1117', color:'white', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,107,53,0.3)', borderTopColor:'#FF6B35', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      جارٍ التحميل...
    </div>
  )
}

export default function Orders() {
  const navigate = useNavigate()
  const { user, restaurant } = useAuthStore()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('active')
  const [branches, setBranches] = useState([])
  const [branchFilter, setBranchFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState(() => new Set())
  const [priorityFilter, setPriorityFilter] = useState(null) // null | 'late' | 'warn' | 'coupon' | 'attention'
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [queue, setQueue] = useState([]) // طابور الطلبات الجديدة (بانر التنبيه)
  const [cancelTarget, setCancelTarget] = useState(null) // الطلب المُراد إلغاؤه (نافذة السبب)
  const { isMobile } = useBreakpoint()

  // عرض كانبان أو جدول (يُحفظ)
  const [view, setView] = useState(() => localStorage.getItem('orders_view') || 'kanban')
  useEffect(() => { localStorage.setItem('orders_view', view) }, [view])

  // قفل تمرير الصفحة خلف نافذة تفاصيل الطلب أو نافذة سبب الإلغاء طول ما إحداهما مفتوحة
  // (عدّاد مشترك يدعم الحالتين معاً — نافذة الإلغاء تُفتح فوق نافذة التفاصيل)
  useBodyScrollLock(!!selectedOrder)
  useBodyScrollLock(!!cancelTarget)

  // أعمدة مطويّة (تُحفظ)
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('orders_collapsed') || '[]')) } catch { return new Set() }
  })
  const toggleCollapse = (key) => setCollapsed(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key)
    localStorage.setItem('orders_collapsed', JSON.stringify([...n]))
    return n
  })

  // عتبات الوقت اللونية (دقائق) — قابلة للضبط وتُحفظ
  const [th, setTh] = useState(() => {
    try { return JSON.parse(localStorage.getItem('orders_thresholds')) || { warn:10, late:20 } } catch { return { warn:10, late:20 } }
  })
  const [showTh, setShowTh] = useState(false)
  const saveTh = (patch) => setTh(prev => { const n = { ...prev, ...patch }; localStorage.setItem('orders_thresholds', JSON.stringify(n)); return n })

  // كتم صوت التنبيه (يُحفظ)
  const [muted, setMuted] = useState(() => localStorage.getItem('orders_muted') === '1')
  useEffect(() => { localStorage.setItem('orders_muted', muted ? '1' : '0') }, [muted])
  const mutedRef = useRef(muted)
  useEffect(() => { mutedRef.current = muted }, [muted])

  // نسخة حيّة من الطلبات لاستخدامها داخل رد نداء الاشتراك اللحظي (يتجنّب القيم القديمة المحصورة closure)
  const ordersRef = useRef([])
  useEffect(() => { ordersRef.current = orders }, [orders])

  // ساعة حيّة: تحدّث كل 20 ثانية لإعادة حساب الوقت المنقضي
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!restaurant) return
    fetchOrders()
    fetchBranches(restaurant.id).then(setBranches).catch(() => {})
    const unsub = subscribeOrders()
    return unsub
  }, [restaurant])

  const fetchOrders = async () => {
    try {
      const { data } = await supabase
        .from('orders').select('*')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (data) setOrders(data)
    } finally { setLoading(false) }
  }

  const audioCtxRef = useRef(null)
  useEffect(() => {
    const unlockAudio = () => {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        audioCtxRef.current = new AudioCtx()
      } else if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume()
      }
      window.removeEventListener('click', unlockAudio)
      window.removeEventListener('touchstart', unlockAudio)
    }
    window.addEventListener('click', unlockAudio)
    window.addEventListener('touchstart', unlockAudio)
    return () => {
      window.removeEventListener('click', unlockAudio)
      window.removeEventListener('touchstart', unlockAudio)
    }
  }, [])

  const playNewOrderSound = () => {
    if (mutedRef.current) return
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = audioCtxRef.current || new AudioCtx()
      audioCtxRef.current = ctx
      if (ctx.state === 'suspended') ctx.resume()
      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain()
        osc.type = 'sine'; osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, startTime)
        gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
        osc.connect(gain); gain.connect(ctx.destination)
        osc.start(startTime); osc.stop(startTime + duration)
      }
      const t = ctx.currentTime
      // النغمة التصاعدية مكررة 3 مرات (~1.5 ثانية) حتى تُسمع وسط ضجيج المطعم
      for (let i = 0; i < 3; i++) {
        const s = t + i * 0.5
        playTone(880, s, 0.15); playTone(1175, s + 0.16, 0.2)
      }
    } catch (err) { console.error('Sound play failed:', err) }
  }

  // صفّارتان بنفس النغمة (إيقاع مختلف عن صوت الطلب الجديد التصاعدي) — نفس آلية playNewOrderSound المُثبَتة حرفياً
  const playReadySound = () => {
    if (mutedRef.current) return
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = audioCtxRef.current || new AudioCtx()
      audioCtxRef.current = ctx
      if (ctx.state === 'suspended') ctx.resume()
      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain()
        osc.type = 'sine'; osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, startTime)
        gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
        osc.connect(gain); gain.connect(ctx.destination)
        osc.start(startTime); osc.stop(startTime + duration)
      }
      const t = ctx.currentTime
      // الصفّارتان مكررتان 3 مرات (~1.4 ثانية) — يبقى الإيقاع مميزاً عن نغمة الطلب الجديد التصاعدية
      for (let i = 0; i < 3; i++) {
        const s = t + i * 0.5
        playTone(1046, s, 0.14); playTone(1046, s + 0.2, 0.14)
      }
    } catch (err) { console.error('Sound play failed:', err) }
  }

  const subscribeOrders = () => {
    if (!restaurant) return () => {}
    const ch = supabase.channel('orders-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurant.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setOrders(prev => [payload.new, ...prev])
            setQueue(prev => [payload.new, ...prev.filter(q => q.id !== payload.new.id)])
            playNewOrderSound()
            if (!mutedRef.current && navigator.vibrate) navigator.vibrate([120, 60, 120])
          } else if (payload.eventType === 'UPDATE') {
            // تنبيه الكاشير عند تجهيز الطلب (تحضير → جاهز) — بصوت مختلف عن صوت الطلب الجديد
            const prevOrder = ordersRef.current.find(o => o.id === payload.new.id)
            if (prevOrder && prevOrder.status !== 'ready' && payload.new.status === 'ready') {
              playReadySound()
              if (!mutedRef.current && navigator.vibrate) navigator.vibrate([80])
              toast.success(`✅ الطلب ${payload.new.order_number} جاهز`)
            }
            setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o))
            setSelectedOrder(prev => prev?.id === payload.new.id ? payload.new : prev)
            // لو خرج الطلب من حالة الانتظار، يُزال من طابور التنبيه
            if (payload.new.status !== 'pending') setQueue(prev => prev.filter(q => q.id !== payload.new.id))
          }
        }
      ).subscribe()
    return () => supabase.removeChannel(ch)
  }

  // توست تراجع
  const showUndo = (orderId, prevStatus, msg) => {
    toast((t) => (
      <span style={{ display:'flex', alignItems:'center', gap:'10px', fontFamily:'Tajawal,sans-serif', fontWeight:'700' }}>
        {msg}
        <button
          onClick={async () => {
            toast.dismiss(t.id)
            await supabase.from('orders').update({ status: prevStatus, cancelled_by: null, cancel_reason: null }).eq('id', orderId)
            toast.success('تم التراجع ↩')
          }}
          style={{ padding:'5px 11px', borderRadius:'8px', border:'none', background:'#111827', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer', whiteSpace:'nowrap' }}
        >↩ تراجع</button>
      </span>
    ), { duration: 5000 })
  }

  const advanceOrder = async (order) => {
    const nextStatus = STATUS[order.status]?.next
    if (!nextStatus) return
    const prev = order.status
    const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', order.id)
    if (error) { toast.error(error.message); return }
    const msgs = { preparing:'👨‍🍳 بدأ التحضير', ready:'✅ الطلب جاهز!', completed:'🎉 تم التسليم' }
    showUndo(order.id, prev, msgs[nextStatus] || '✅')
  }

  // ===== بانر الطلبات الجديدة =====
  const itemsSummary = (order) => {
    const items = Array.isArray(order.items) ? order.items : []
    const txt = items.map(i => `${i.name}×${i.qty}`).join('، ')
    return txt.length > 60 ? txt.slice(0, 58) + '…' : txt
  }

  const dismissFromQueue = (id) => setQueue(prev => prev.filter(q => q.id !== id))

  const acceptFromBanner = async (order) => {
    dismissFromQueue(order.id)
    await supabase.from('orders').update({ status: 'preparing' }).eq('id', order.id)
    toast.success(`👨‍🍳 تم قبول ${order.order_number}`)
  }

  const acceptAllNew = async () => {
    const ids = queue.map(q => q.id)
    if (ids.length === 0) return
    setQueue([])
    await supabase.from('orders').update({ status: 'preparing' }).in('id', ids).eq('status', 'pending')
    toast.success(`👨‍🍳 تم قبول ${ids.length} طلب`)
  }

  const cancelOrder = (order) => setCancelTarget(order) // يفتح نافذة اختيار السبب

  const performCancel = async (order, reason) => {
    const prev = order.status
    setCancelTarget(null)
    await supabase.from('orders').update({ status:'cancelled', cancelled_by:'restaurant', cancel_reason: reason || null }).eq('id', order.id)
    if (selectedOrder?.id === order.id) setSelectedOrder(null)
    showUndo(order.id, prev, '🚫 تم إلغاء الطلب')
  }

  const toggleItemUnavailable = async (order, itemIndex) => {
    const items = Array.isArray(order.items) ? order.items : []
    const updatedItems = items.map((it, i) => i === itemIndex ? { ...it, unavailable: !it.unavailable } : it)
    const { gross: newGross, net: newNet, tax: newTax } = vatBreakdown(itemsGross(updatedItems))
    const newTotal = newGross + (Number(order.delivery_fee) || 0)
    const allUnavailable = updatedItems.every(it => it.unavailable)
    const updatePayload = { items: updatedItems, subtotal: newNet, tax: newTax, total: newTotal }
    if (allUnavailable) { updatePayload.status = 'cancelled'; updatePayload.cancelled_by = 'restaurant' }
    const { error } = await supabase.from('orders').update(updatePayload).eq('id', order.id)
    if (error) { toast.error(error.message); return }
    const item = items[itemIndex]
    if (allUnavailable) toast.error('🚫 تم إلغاء الطلب بالكامل — كل الأصناف غير متوفرة')
    else toast.success(item.unavailable ? `✅ ${item.name} أصبح متوفراً` : `⚠️ تم تعليم ${item.name} كغير متوفر`)
  }

  const phoneDigits = (p) => (p || '').replace(/[^\d]/g, '')

  // ===== حسابات الوقت والأولوية =====
  const minsSince = (iso) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
  const fmtElapsed = (m) => m < 1 ? 'الآن' : m < 60 ? `${m} د` : `${Math.floor(m/60)} س ${m%60} د`
  const timeStyle = (m) => m >= th.late
    ? { c:'#DC2626', bg:'#FEE2E2' }
    : m >= th.warn ? { c:'#B45309', bg:'#FEF3C7' } : { c:'#059669', bg:'#D1FAE5' }
  const isActive = (st) => ['pending','preparing','ready'].includes(st)
  const isLate = (o) => isActive(o.status) && minsSince(o.created_at) >= th.late
  const isWarn = (o) => isActive(o.status) && minsSince(o.created_at) >= th.warn && minsSince(o.created_at) < th.late

  // فلترة بالفرع (الأعمدة تتكفّل بالحالة)
  const byBranch = branchFilter === 'all' ? orders : orders.filter(o => o.branch_id === branchFilter)

  // ⭐ VIP: عميل تكرر طلبه 3 مرات فأكثر ضمن آخر 100 طلب محمّلة — مؤشر تقريبي سريع بلا استعلام إضافي لقاعدة البيانات
  const VIP_THRESHOLD = 3
  const customerOrderCounts = {}
  orders.forEach(o => { if (o.customer_phone) customerOrderCounts[o.customer_phone] = (customerOrderCounts[o.customer_phone] || 0) + 1 })
  const isVIP = (o) => !!o.customer_phone && customerOrderCounts[o.customer_phone] >= VIP_THRESHOLD

  // شريط الأولوية — عدادات عابرة للحالة، تُحسب على مستوى الفرع المختار بمعزل عن بقية الفلاتر
  const lateCount = byBranch.filter(isLate).length
  const warnCount = byBranch.filter(isWarn).length
  const couponCount = byBranch.filter(o => isActive(o.status) && o.coupon_code).length
  const vipCount = byBranch.filter(o => isActive(o.status) && isVIP(o)).length

  const toggleType = (t) => setTypeFilter(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n })
  const togglePriority = (p) => setPriorityFilter(prev => prev === p ? null : p)

  // شريط الفلاتر الموحّد — بحث + نوع الطلب + الأولوية، فوق فلترة الفرع
  const matchesSearch = (o) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (o.order_number || '').toLowerCase().includes(q)
      || (o.customer_name || '').toLowerCase().includes(q)
      || (o.customer_phone || '').includes(q)
  }
  const matchesType = (o) => typeFilter.size === 0 || typeFilter.has(o.type || 'dine_in')
  const matchesPriority = (o) => {
    if (!priorityFilter) return true
    if (priorityFilter === 'late') return isLate(o)
    if (priorityFilter === 'warn') return isWarn(o)
    if (priorityFilter === 'coupon') return !!o.coupon_code
    if (priorityFilter === 'vip') return isVIP(o)
    if (priorityFilter === 'attention') return isLate(o) || isWarn(o)
    return true
  }
  const filtered = byBranch.filter(o => matchesSearch(o) && matchesType(o) && matchesPriority(o))

  // أعمدة الكانبان الظاهرة تتبع تبويب الفلتر (نفس تبويبات الجدول، موحّدة بين العرضين)
  const CANCELLED_COL = { key:'cancelled', label:'ملغي', emoji:'🚫', accent:'#EF4444' }
  const visibleCols = filter === 'active' ? COLS.filter(c => c.key !== 'completed')
    : filter === 'completed' ? COLS.filter(c => c.key === 'completed')
    : filter === 'cancelled' ? [CANCELLED_COL]
    : [...COLS, CANCELLED_COL]

  const colOrders = (key) => {
    const list = filtered.filter(o => o.status === key)
    if (key === 'completed' || key === 'cancelled') return list.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 30)
    return list.sort((a,b) => new Date(a.created_at) - new Date(b.created_at))
  }

  const activeCount = byBranch.filter(o => isActive(o.status)).length

  // جدول: يحترم تبويب الفلتر + الفرز
  const [sort, setSort] = useState({ key:'created_at', dir:'desc' })
  const tableOrders = filtered.filter(o => {
    if (filter === 'active') return isActive(o.status)
    if (filter === 'completed') return o.status === 'completed'
    if (filter === 'cancelled') return o.status === 'cancelled'
    return true
  }).sort((a,b) => {
    let av, bv
    if (sort.key === 'total') { av = a.total||0; bv = b.total||0 }
    else if (sort.key === 'status') { av = a.status; bv = b.status }
    else { av = new Date(a.created_at); bv = new Date(b.created_at) }
    return sort.dir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })
  const setSortKey = (key) => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))

  if (loading) return <Spinner />

  const keyframes = `@keyframes spin{to{transform:rotate(360deg)}}@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}@keyframes latePulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.35)}50%{box-shadow:0 0 0 4px rgba(220,38,38,0)}}@keyframes slideUp{from{transform:translateY(30px);opacity:.6}to{transform:none;opacity:1}}@keyframes slideDown{from{transform:translateY(-16px);opacity:0}to{transform:none;opacity:1}}@keyframes ring{0%,100%{transform:rotate(0)}20%{transform:rotate(-14deg)}40%{transform:rotate(12deg)}60%{transform:rotate(-8deg)}80%{transform:rotate(6deg)}}@keyframes freshFlash{0%{background:#FFF1E8}100%{background:#fff}}`

  // ===== كارت الطلب (كانبان) =====
  const OrderCard = ({ order }) => {
    const s = STATUS[order.status] || STATUS.pending
    const items = Array.isArray(order.items) ? order.items : []
    const m = minsSince(order.created_at)
    const ts = timeStyle(m)
    const late = isActive(order.status) && m >= th.late
    const fresh = order.status === 'pending' && m < 2
    const tc = typeChip(order.type)
    const touch = useRef({ x:0, y:0, sw:false })
    const canAdvance = !!STATUS[order.status]?.next
    return (
      <div
        onTouchStart={(e) => { const t = e.touches[0]; touch.current = { x:t.clientX, y:t.clientY, sw:false } }}
        onTouchEnd={(e) => {
          const t = e.changedTouches[0]
          const dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y
          if (Math.abs(dx) > 70 && Math.abs(dy) < 40) {
            touch.current.sw = true
            if (canAdvance && dx < 0) advanceOrder(order)         // سحب لليسار = تقديم الحالة
            else if (order.status === 'pending' && dx > 0) cancelOrder(order) // سحب لليمين = إلغاء (قبل القبول فقط)
          }
        }}
        onClick={() => { if (touch.current.sw) { touch.current.sw = false; return } setSelectedOrder(order) }}
        style={{
          background:'white', borderRadius:'13px', border:'1px solid #E5E7EB',
          borderRight:`4px solid ${late ? '#DC2626' : s.color}`,
          padding:'11px 12px', cursor:'pointer', boxShadow:'0 1px 3px rgba(0,0,0,0.04)',
          animation: late ? 'latePulse 1.6s infinite' : fresh ? 'freshFlash 1.4s ease' : 'none',
        }}
      >
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'6px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px' }}>{order.order_number}</span>
            {fresh && <span style={{ fontSize:'9px', fontWeight:'800', color:'#FF6B35', background:'rgba(255,107,53,0.12)', padding:'1px 6px', borderRadius:'100px', animation:'blink 1.5s infinite' }}>جديد</span>}
            {isVIP(order) && <span title="عميل VIP" style={{ fontSize:'11px' }}>⭐</span>}
            {order.coupon_code && <span title="يحتوي كوبون" style={{ fontSize:'11px' }}>🎁</span>}
            {order.notes && <span title="ملاحظة من الزبون" style={{ fontSize:'11px' }}>📝</span>}
          </div>
          {isActive(order.status) && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:'3px', fontSize:'11px', fontWeight:'800', color:ts.c, background:ts.bg, padding:'2px 8px', borderRadius:'100px' }}>🕐 {fmtElapsed(m)}</span>
          )}
        </div>

        <div style={{ fontSize:'12px', color:'#6B7280', display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap', marginBottom:'8px' }}>
          {order.customer_name && <span style={{ fontWeight:'700', color:'#374151' }}>{order.customer_name}</span>}
          <span style={{ display:'inline-flex', alignItems:'center', gap:'3px', fontSize:'10px', fontWeight:'800', color:tc.c, background:tc.bg, padding:'2px 7px', borderRadius:'100px' }}>{tc.emoji} {tc.label}</span>
          {order.type === 'dine_in' && order.table_number && <span>طاولة {order.table_number}</span>}
        </div>

        {order.notes && <div style={{ fontSize:'11px', color:'#92400E', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:'8px', padding:'5px 8px', marginBottom:'8px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>📝 {order.notes}</div>}

        {/* ملخص الأصناف */}
        <div style={{ display:'flex', flexDirection:'column', gap:'2px', marginBottom:'8px' }}>
          {items.slice(0, 3).map((it, i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#374151', opacity: it.unavailable ? 0.45 : 1 }}>
              <span style={{ textDecoration: it.unavailable ? 'line-through' : 'none' }}>{it.emoji || '🍽️'} {it.name}</span>
              <span style={{ color:'#9CA3AF', fontWeight:'700' }}>×{it.qty}</span>
            </div>
          ))}
          {items.length > 3 && <div style={{ fontSize:'11px', color:'#9CA3AF' }}>+{items.length - 3} أصناف أخرى…</div>}
        </div>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px' }}>
          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', color:'#FF6B35' }}>{Number(order.total || 0).toFixed(0)} ﷼</span>
          {STATUS[order.status]?.next && (
            <button
              onClick={(e) => { e.stopPropagation(); advanceOrder(order) }}
              style={{ padding:'7px 12px', borderRadius:'9px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'11px', cursor:'pointer', whiteSpace:'nowrap' }}
            >{STATUS[order.status].nextLabel}</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <AppShell
      active="orders"
      badges={{ orders: activeCount }}
      title={<>الطلبات
        {activeCount > 0 && <span style={{ background:'#FF6B35', color:'white', fontSize:'11px', fontWeight:'800', padding:'3px 10px', borderRadius:'100px', marginRight:'6px' }}>{activeCount} نشط</span>}
        {lateCount > 0 && <span style={{ background:'#FEE2E2', color:'#DC2626', fontSize:'11px', fontWeight:'800', padding:'3px 10px', borderRadius:'100px', marginRight:'6px' }}>⚠️ {lateCount} متأخر</span>}
      </>}
      actions={<>
        <button onClick={() => setMuted(m => !m)} title={muted ? 'تشغيل الصوت' : 'كتم الصوت'} style={{ background:'none', border:'1.5px solid #E5E7EB', borderRadius:'9px', padding:'5px 9px', cursor:'pointer', fontSize:'14px' }}>{muted ? '🔕' : '🔔'}</button>
        <button onClick={() => setShowTh(v => !v)} title="عتبات الوقت" style={{ background:'none', border:'1.5px solid #E5E7EB', borderRadius:'9px', padding:'5px 9px', cursor:'pointer', fontSize:'14px' }}>⏱️</button>
        <div style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'12px', fontWeight:'700', color:'#10B981' }}>
          <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#10B981', display:'inline-block', animation:'blink 2s infinite' }}/>
          مباشر
        </div>
        <div style={{ display:'flex', background:'#F3F4F6', borderRadius:'10px', padding:'3px' }}>
          {[['kanban','▦ كانبان'], ['table','☰ جدول']].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{ padding:'6px 11px', borderRadius:'8px', border:'none', cursor:'pointer', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'11px', background: view===k ? 'white' : 'transparent', color: view===k ? '#FF6B35' : '#9CA3AF', boxShadow: view===k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>{l}</button>
          ))}
        </div>
      </>}
    >
        <style>{keyframes}</style>

        {/* لوحة ضبط العتبات */}
        {showTh && (
          <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', gap:'12px', padding:'10px 16px', fontSize:'12px', color:'#6B7280', flexWrap:'wrap', flexShrink:0 }}>
            <span style={{ fontWeight:'700' }}>عتبات لون الوقت:</span>
            <label style={{ display:'flex', alignItems:'center', gap:'5px' }}>🟡 أصفر بعد
              <input type="number" min="1" value={th.warn} onChange={e => saveTh({ warn: Math.max(1, +e.target.value||1) })} style={{ width:'52px', padding:'4px 6px', border:'1.5px solid #E5E7EB', borderRadius:'7px', textAlign:'center' }} /> د</label>
            <label style={{ display:'flex', alignItems:'center', gap:'5px' }}>🔴 أحمر بعد
              <input type="number" min="1" value={th.late} onChange={e => saveTh({ late: Math.max(1, +e.target.value||1) })} style={{ width:'52px', padding:'4px 6px', border:'1.5px solid #E5E7EB', borderRadius:'7px', textAlign:'center' }} /> د</label>
          </div>
        )}

        {/* ===== بانر الطلبات الجديدة (طابور) ===== */}
        {queue.length > 0 && (() => {
          const o = queue[0]
          return (
            <div style={{ background:'#0F1117', color:'white', padding:'11px 14px', display:'flex', alignItems:'center', gap:'10px', flexShrink:0, flexWrap:'wrap', animation:'slideDown .25s ease' }}>
              <div style={{ width:'40px', height:'40px', borderRadius:'11px', background:'rgba(255,107,53,0.22)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', flexShrink:0, animation:'ring 1.2s infinite' }}>🔔</div>
              <div style={{ flex:1, minWidth:'160px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
                  <span style={{ fontSize:'10px', fontWeight:'800', background:'#FF6B35', color:'white', padding:'1px 7px', borderRadius:'100px' }}>جديد</span>
                  <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px' }}>{o.order_number}</span>
                  <span style={{ fontSize:'12px', color:'rgba(255,255,255,0.6)' }}>{TYPE_LABEL[o.type] || '🪑 محلي'}{o.type === 'dine_in' && o.table_number ? ` · طاولة ${o.table_number}` : ''}</span>
                </div>
                <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.75)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:'2px' }}>{itemsSummary(o)} — {Number(o.total || 0).toFixed(0)} ﷼</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                {queue.length > 1 && (
                  <button onClick={acceptAllNew} style={{ padding:'9px 12px', borderRadius:'10px', border:'1.5px solid rgba(255,255,255,0.25)', background:'transparent', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer', whiteSpace:'nowrap' }}>قبول الكل ({queue.length})</button>
                )}
                <button onClick={() => acceptFromBanner(o)} style={{ padding:'9px 16px', borderRadius:'10px', border:'none', background:'#FF6B35', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', cursor:'pointer', whiteSpace:'nowrap' }}>قبول ✓</button>
                <button onClick={() => dismissFromQueue(o.id)} title="تجاهل" style={{ width:'36px', height:'36px', borderRadius:'10px', border:'none', background:'rgba(255,255,255,0.1)', color:'white', fontSize:'15px', cursor:'pointer', flexShrink:0 }}>✕</button>
              </div>
            </div>
          )
        })()}

        {/* شريط الأولوية — يظهر فقط عند وجود ما يستحق الانتباه */}
        {(lateCount > 0 || warnCount > 0 || couponCount > 0 || vipCount > 0) && (
          <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', padding:'10px 16px', display:'flex', gap:'8px', flexWrap:'wrap', flexShrink:0 }}>
            {lateCount > 0 && (
              <button onClick={() => togglePriority('late')} style={{ padding:'6px 12px', borderRadius:'100px', border:`1.5px solid ${priorityFilter==='late' ? '#DC2626' : '#FEE2E2'}`, background: priorityFilter==='late' ? '#FEE2E2' : '#FEF2F2', color:'#DC2626', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer' }}>🔥 {lateCount} طلبات متأخرة</button>
            )}
            {warnCount > 0 && (
              <button onClick={() => togglePriority('warn')} style={{ padding:'6px 12px', borderRadius:'100px', border:`1.5px solid ${priorityFilter==='warn' ? '#B45309' : '#FDE68A'}`, background: priorityFilter==='warn' ? '#FEF3C7' : '#FFFBEB', color:'#B45309', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer' }}>⚠️ {warnCount} معرّضة للتأخير</button>
            )}
            {couponCount > 0 && (
              <button onClick={() => togglePriority('coupon')} style={{ padding:'6px 12px', borderRadius:'100px', border:`1.5px solid ${priorityFilter==='coupon' ? '#059669' : '#D1FAE5'}`, background: priorityFilter==='coupon' ? '#D1FAE5' : '#ECFDF5', color:'#059669', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer' }}>🎁 {couponCount} فيها كوبون</button>
            )}
            {vipCount > 0 && (
              <button onClick={() => togglePriority('vip')} style={{ padding:'6px 12px', borderRadius:'100px', border:`1.5px solid ${priorityFilter==='vip' ? '#B08A2E' : '#FDE68A'}`, background: priorityFilter==='vip' ? '#FEF3C7' : '#FFFBEB', color:'#B08A2E', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer' }}>⭐ {vipCount} عملاء VIP</button>
            )}
          </div>
        )}

        {/* شريط الفلاتر الموحّد — بحث + فرع + نوع الطلب + فلتر جاهز */}
        <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', padding:'10px 16px', display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center', flexShrink:0 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 بحث برقم الطلب/العميل/الجوال"
            style={{ flex:'1 1 200px', minWidth:'160px', padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', fontFamily:'Tajawal,sans-serif', fontSize:'12px', outline:'none' }}
          />
          {branches.length > 0 && (
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', fontFamily:'Tajawal,sans-serif', fontSize:'12px', fontWeight:'700', color:'#374151', outline:'none', cursor:'pointer', background:'white' }}>
              <option value="all">🏢 كل الفروع</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.is_primary ? '🏠' : '🏢'} {b.name}</option>)}
            </select>
          )}
          <div style={{ display:'flex', gap:'5px' }}>
            {[['dine_in','🪑 محلي'], ['takeaway','🥡 سفري'], ['delivery','🛵 توصيل']].map(([k,l]) => (
              <button key={k} onClick={() => toggleType(k)} style={{ padding:'6px 11px', borderRadius:'9px', border:`1.5px solid ${typeFilter.has(k) ? '#FF6B35' : '#E5E7EB'}`, background: typeFilter.has(k) ? '#FFF0EB' : 'white', color: typeFilter.has(k) ? '#FF6B35' : '#6B7280', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'11px', cursor:'pointer', whiteSpace:'nowrap' }}>{l}</button>
            ))}
          </div>
          <button onClick={() => togglePriority('attention')} style={{ padding:'6px 11px', borderRadius:'9px', border:`1.5px solid ${priorityFilter==='attention' ? '#FF6B35' : '#E5E7EB'}`, background: priorityFilter==='attention' ? '#FFF0EB' : 'white', color: priorityFilter==='attention' ? '#FF6B35' : '#6B7280', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'11px', cursor:'pointer', whiteSpace:'nowrap' }}>⚡ يحتاج تدخل</button>
        </div>

        {/* Filter tabs — تتحكم بأعمدة الكانبان الظاهرة وبفلترة الجدول معاً، دائمة الظهور في العرضين */}
        <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', padding:'0 16px', flexShrink:0, overflowX:'auto' }}>
          {[
            { key:'active', label:`🔥 النشطة (${activeCount})` },
            { key:'all', label:`📋 الكل (${byBranch.length})` },
            { key:'completed', label:'✅ المكتملة' },
            { key:'cancelled', label:'🚫 الملغية' },
          ].map(t => (
            <div key={t.key} onClick={() => setFilter(t.key)} style={{ padding:'12px 14px', fontSize:'13px', fontWeight:'700', color: filter === t.key ? '#FF6B35' : '#6B7280', borderBottom: filter === t.key ? '2.5px solid #FF6B35' : '2.5px solid transparent', cursor:'pointer', whiteSpace:'nowrap' }}>{t.label}</div>
          ))}
        </div>

        {/* ===== المحتوى ===== */}
        {view === 'kanban' ? (
          <div style={{ flex:1, overflowX:'auto', overflowY:'hidden', padding:'14px', display:'flex', gap:'12px', background:'#F8F9FB' }}>
            {visibleCols.map(col => {
              const list = colOrders(col.key)
              const total = list.reduce((s, o) => s + (Number(o.total) || 0), 0)
              const isCol = collapsed.has(col.key)
              return (
                <div key={col.key} style={{ flexShrink:0, width: isCol ? '54px' : (isMobile ? '270px' : '300px'), display:'flex', flexDirection:'column', background:'#EFF1F5', borderRadius:'16px', overflow:'hidden', transition:'width 0.2s' }}>
                  <div onClick={() => toggleCollapse(col.key)} style={{ padding:'12px', borderTop:`3px solid ${col.accent}`, background:'white', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px', ...(isCol ? { writingMode:'vertical-rl', justifyContent:'center', height:'100%' } : {}) }}>
                    <span style={{ fontSize:'15px' }}>{col.emoji}</span>
                    <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', flex:1 }}>{col.label}</span>
                    <span style={{ background:col.accent, color:'white', fontSize:'11px', fontWeight:'800', padding:'1px 8px', borderRadius:'100px' }}>{list.length}</span>
                    {!isCol && total > 0 && <span style={{ fontSize:'11px', fontWeight:'800', color:'#6B7280' }}>{total.toFixed(0)} ﷼</span>}
                  </div>
                  {!isCol && (
                    <div style={{ flex:1, overflowY:'auto', padding:'10px', display:'flex', flexDirection:'column', gap:'9px' }}>
                      {list.length === 0 ? (
                        <div style={{ textAlign:'center', color:'#B6BAC3', padding:'30px 8px', fontSize:'12px' }}>
                          <div style={{ fontSize:'26px', opacity:0.5, marginBottom:'6px' }}>{col.emoji}</div>
                          لا توجد طلبات
                        </div>
                      ) : list.map(o => <OrderCard key={o.id} order={o} />)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ flex:1, overflowY:'auto', padding:'12px', background:'#F8F9FB' }}>
            {tableOrders.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 16px', color:'#9CA3AF' }}>
                <div style={{ fontSize:'48px', opacity:0.3, marginBottom:'12px' }}>📭</div>
                <div style={{ fontSize:'16px', fontWeight:'700', color:'#374151' }}>لا توجد طلبات</div>
              </div>
            ) : (
              <div style={{ background:'white', borderRadius:'14px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                <div style={{ display:'grid', gridTemplateColumns:'70px 1fr 90px 90px 90px', gap:'8px', padding:'11px 14px', borderBottom:'1px solid #E5E7EB', background:'#F8F9FB', fontSize:'11px', fontWeight:'800', color:'#9CA3AF' }}>
                  <span>الطلب</span>
                  <span>العميل / النوع</span>
                  <button onClick={() => setSortKey('status')} style={{ background:'none', border:'none', cursor:'pointer', fontWeight:'800', color:'#9CA3AF', fontSize:'11px', textAlign:'right' }}>الحالة {sort.key==='status' ? (sort.dir==='asc'?'▲':'▼') : ''}</button>
                  <button onClick={() => setSortKey('created_at')} style={{ background:'none', border:'none', cursor:'pointer', fontWeight:'800', color:'#9CA3AF', fontSize:'11px', textAlign:'right' }}>الوقت {sort.key==='created_at' ? (sort.dir==='asc'?'▲':'▼') : ''}</button>
                  <button onClick={() => setSortKey('total')} style={{ background:'none', border:'none', cursor:'pointer', fontWeight:'800', color:'#9CA3AF', fontSize:'11px', textAlign:'right' }}>الإجمالي {sort.key==='total' ? (sort.dir==='asc'?'▲':'▼') : ''}</button>
                </div>
                {tableOrders.map(o => {
                  const s = STATUS[o.status] || STATUS.pending
                  const m = minsSince(o.created_at); const ts = timeStyle(m)
                  return (
                    <div key={o.id} onClick={() => setSelectedOrder(o)} style={{ display:'grid', gridTemplateColumns:'70px 1fr 90px 90px 90px', gap:'8px', padding:'11px 14px', borderBottom:'1px solid #F3F4F6', alignItems:'center', cursor:'pointer', fontSize:'12px' }}>
                      <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800' }}>{o.order_number}</span>
                      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.customer_name || '—'} · <span style={{ color:'#9CA3AF' }}>{TYPE_LABEL[o.type] || 'محلي'}</span></span>
                      <span><span style={{ padding:'2px 8px', borderRadius:'100px', background:s.bg, color:s.color, fontSize:'10px', fontWeight:'800' }}>{s.label}</span></span>
                      <span style={{ color: isActive(o.status) ? ts.c : '#9CA3AF', fontWeight:'700' }}>{isActive(o.status) ? fmtElapsed(m) : new Date(o.created_at).toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'})}</span>
                      <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', color:'#FF6B35' }}>{Number(o.total||0).toFixed(0)} ﷼</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      {/* ===== نافذة تفاصيل الطلب ===== */}
      {selectedOrder && (() => {
        const order = selectedOrder
        const items = Array.isArray(order.items) ? order.items : []
        const s = STATUS[order.status] || STATUS.pending
        return (
          <div onClick={() => setSelectedOrder(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:60, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background:'white', width:'100%', maxWidth:'520px', maxHeight:'88vh', borderRadius:'20px 20px 0 0', overflowY:'auto', animation:'slideUp .25s ease' }}>
              <div style={{ position:'sticky', top:0, background:'white', padding:'16px 18px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between', zIndex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px' }}>{order.order_number}</span>
                  <span style={{ padding:'3px 10px', borderRadius:'100px', background:s.bg, color:s.color, fontSize:'12px', fontWeight:'800' }}>{s.label}</span>
                </div>
                <button onClick={() => setSelectedOrder(null)} style={{ background:'#F3F4F6', border:'none', width:'32px', height:'32px', borderRadius:'50%', cursor:'pointer', fontSize:'16px' }}>✕</button>
              </div>

              <div style={{ padding:'16px 18px' }}>
                <div style={{ fontSize:'13px', color:'#6B7280', display:'flex', gap:'10px', flexWrap:'wrap', marginBottom:'14px' }}>
                  {order.customer_name && <span>👤 {order.customer_name}</span>}
                  <span>{TYPE_LABEL[order.type] || '🪑 محلي'}</span>
                  {order.type === 'dine_in' && order.table_number && <span>طاولة {order.table_number}</span>}
                  {order.type === 'delivery' && order.delivery_address && <span>📍 {order.delivery_address}</span>}
                  {order.customer_phone && (
                    <span style={{ direction:'ltr', display:'inline-flex', alignItems:'center', gap:'6px' }}>
                      📱 {order.customer_phone}
                      <a href={`tel:${phoneDigits(order.customer_phone)}`} onClick={e => e.stopPropagation()} style={{ textDecoration:'none', background:'#EFF6FF', color:'#2563EB', borderRadius:'8px', padding:'3px 8px', fontSize:'12px', fontWeight:'700' }}>📞 اتصال</a>
                      <a href={`https://wa.me/${phoneDigits(order.customer_phone)}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ textDecoration:'none', background:'#ECFDF5', color:'#059669', borderRadius:'8px', padding:'3px 8px', fontSize:'12px', fontWeight:'700' }}>واتساب</a>
                    </span>
                  )}
                  <span>🕐 {new Date(order.created_at).toLocaleTimeString('ar', { hour:'2-digit', minute:'2-digit' })}</span>
                </div>

                {items.length > 0 && (
                  <div style={{ marginBottom:'12px' }}>
                    <div style={{ fontSize:'12px', fontWeight:'700', color:'#9CA3AF', marginBottom:'8px' }}>الأصناف</div>
                    {items.map((item, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #F0F0F0', opacity: item.unavailable ? 0.5 : 1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                          <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0, overflow:'hidden' }}>{item.image_url ? <img src={item.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (item.emoji || '🍽️')}</div>
                          <div>
                            <div style={{ fontSize:'13px', fontWeight:'700', textDecoration: item.unavailable ? 'line-through' : 'none' }}>{item.name}{item.unavailable && <span style={{ fontSize:'10px', fontWeight:'700', color:'#EF4444', background:'#FEF2F2', padding:'2px 6px', borderRadius:'100px', marginRight:'6px' }}>غير متوفر</span>}</div>
                            {Array.isArray(item.selectedOptions) && item.selectedOptions.length > 0 && <div style={{ fontSize:'11px', color:'#FF6B35', fontWeight:'600' }}>{item.selectedOptions.map(o => o.choiceName).join(' + ')}</div>}
                            {item.notes && <div style={{ fontSize:'11px', color:'#9CA3AF' }}>📝 {item.notes}</div>}
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                          {order.status === 'pending' && (
                            <button onClick={() => toggleItemUnavailable(order, i)} style={{ padding:'5px 9px', borderRadius:'7px', border:`1.5px solid ${item.unavailable ? '#D1FAE5' : '#FEE2E2'}`, background: item.unavailable ? '#ECFDF5' : '#FEF2F2', color: item.unavailable ? '#065F46' : '#EF4444', fontSize:'11px', fontWeight:'700', cursor:'pointer', whiteSpace:'nowrap' }}>{item.unavailable ? '↺ إعادة' : '⚠️ غير متوفر'}</button>
                          )}
                          <div style={{ textAlign:'left' }}>
                            <div style={{ fontSize:'12px', color:'#9CA3AF' }}>× {item.qty}</div>
                            <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', textDecoration: item.unavailable ? 'line-through' : 'none' }}>{item.price * item.qty} ﷼</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {order.notes && <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:'10px', padding:'10px 12px', marginBottom:'12px', fontSize:'13px' }}>📝 {order.notes}</div>}

                <div style={{ background:'#F8F9FB', borderRadius:'10px', padding:'10px 12px', marginBottom:'14px', border:'1px solid #E5E7EB' }}>
                  {(() => {
                    const { deliv, net, tax: taxAmt } = orderBreakdown(order)
                    return (
                      <>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#9CA3AF', marginBottom:'4px' }}><span>الصافي (قبل الضريبة)</span><span>{net.toFixed(2)} ﷼</span></div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#9CA3AF', marginBottom: deliv > 0 ? '4px' : '6px' }}><span>ض.ق.م 15%</span><span>{taxAmt.toFixed(2)} ﷼</span></div>
                        {deliv > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#9CA3AF', marginBottom:'6px' }}><span>🛵 رسوم التوصيل</span><span>{deliv.toFixed(2)} ﷼</span></div>}
                        <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px', paddingTop:'6px', borderTop:'1px solid #E5E7EB' }}><span>الإجمالي <span style={{ fontSize:'10px', color:'#9CA3AF', fontWeight:'600' }}>(شامل الضريبة)</span></span><span style={{ color:'#FF6B35' }}>{Number(order.total ?? 0).toFixed(2)} ﷼</span></div>
                      </>
                    )
                  })()}
                </div>

                <div style={{ display:'flex', gap:'8px' }}>
                  {STATUS[order.status]?.next && (
                    <button onClick={() => advanceOrder(order)} style={{ flex:2, padding:'12px', borderRadius:'11px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', cursor:'pointer' }}>{STATUS[order.status].nextLabel}</button>
                  )}
                  {order.status === 'pending' && (
                    <button onClick={() => cancelOrder(order)} style={{ flex:1, padding:'12px', borderRadius:'11px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', color:'#EF4444', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}>إلغاء</button>
                  )}
                  {!STATUS[order.status]?.next && (
                    <div style={{ flex:1, padding:'12px', borderRadius:'11px', background:'#F3F4F6', textAlign:'center', fontSize:'13px', color:'#9CA3AF', fontWeight:'600' }}>{order.status === 'completed' ? '✅ مكتمل' : order.cancelled_by === 'customer' ? '🚫 ملغي من العميل' : '🚫 ملغي من المطعم'}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ===== نافذة سبب الإلغاء ===== */}
      {cancelTarget && (
        <div onClick={() => setCancelTarget(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:70, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'white', borderRadius:'18px', padding:'20px', width:'100%', maxWidth:'360px', animation:'slideUp .2s ease' }}>
            <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', marginBottom:'4px' }}>إلغاء الطلب {cancelTarget.order_number}؟</div>
            <div style={{ fontSize:'13px', color:'#6B7280', marginBottom:'14px' }}>اختر سبب الإلغاء (يظهر في التحليلات):</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {['نفدت الأصناف', 'طلب الزبون الإلغاء', 'المحل مغلق', 'خطأ في الطلب', 'سبب آخر'].map(r => (
                <button key={r} onClick={() => performCancel(cancelTarget, r)} style={{ padding:'11px 13px', borderRadius:'11px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer', textAlign:'right' }}>{r}</button>
              ))}
            </div>
            <button onClick={() => setCancelTarget(null)} style={{ width:'100%', marginTop:'12px', padding:'11px', borderRadius:'11px', border:'none', background:'#F3F4F6', color:'#374151', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}>تراجع</button>
          </div>
        </div>
      )}
    </AppShell>
  )
}
