import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

const STATUS = {
  pending:   { label:'انتظار',      bg:'#FEF3C7', color:'#92400E', next:'preparing', nextLabel:'✓ قبول وتحضير' },
  preparing: { label:'قيد التحضير', bg:'#DBEAFE', color:'#1E40AF', next:'ready',     nextLabel:'✅ جاهز' },
  ready:     { label:'جاهز',        bg:'#D1FAE5', color:'#065F46', next:'completed',  nextLabel:'🎉 تم التسليم' },
  completed: { label:'مكتمل',       bg:'#F3F4F6', color:'#6B7280', next:null,         nextLabel:'' },
  cancelled: { label:'ملغي',        bg:'#FEE2E2', color:'#991B1B', next:null,         nextLabel:'' },
}

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
  const { user, restaurant, signOut } = useAuthStore()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('active')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isMobile = window.innerWidth <= 768

  useEffect(() => {
    if (!restaurant) return
    fetchOrders()
    const unsub = subscribeOrders()
    return unsub
  }, [restaurant])

  const fetchOrders = async () => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (data) setOrders(data)
    } finally {
      setLoading(false)
    }
  }

  const audioCtxRef = useRef(null)

  useEffect(() => {
    // تفعيل AudioContext عند أول تفاعل من المستخدم (مطلوب من المتصفحات لتشغيل الصوت)
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

  // نغمة تنبيه قصيرة (نغمتين صاعدتين) عبر Web Audio API — لا تحتاج ملف صوتي خارجي
  const playNewOrderSound = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = audioCtxRef.current || new AudioCtx()
      audioCtxRef.current = ctx
      if (ctx.state === 'suspended') ctx.resume()
      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, startTime)
        gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(startTime)
        osc.stop(startTime + duration)
      }
      const now = ctx.currentTime
      playTone(880, now, 0.15)
      playTone(1175, now + 0.16, 0.2)
    } catch (err) {
      console.error('Sound play failed:', err)
    }
  }

  const subscribeOrders = () => {
    if (!restaurant) return () => {}
    const ch = supabase.channel('orders-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurant.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setOrders(prev => [payload.new, ...prev])
            playNewOrderSound()
            toast.success(`🔔 طلب جديد! ${payload.new.order_number}`)
          } else if (payload.eventType === 'UPDATE') {
            setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o))
            if (selectedOrder?.id === payload.new.id) setSelectedOrder(payload.new)
          }
        }
      ).subscribe()
    return () => supabase.removeChannel(ch)
  }

  const advanceOrder = async (order) => {
    const nextStatus = STATUS[order.status]?.next
    if (!nextStatus) return
    const { error } = await supabase
      .from('orders')
      .update({ status: nextStatus })
      .eq('id', order.id)
    if (error) { toast.error(error.message); return }
    const msgs = { preparing:'👨‍🍳 بدأ التحضير', ready:'✅ الطلب جاهز!', completed:'🎉 تم التسليم' }
    toast.success(msgs[nextStatus] || '✅')
  }

  const cancelOrder = async (order) => {
    if (!window.confirm('إلغاء الطلب؟')) return
    await supabase.from('orders').update({ status:'cancelled', cancelled_by:'restaurant' }).eq('id', order.id)
    toast.success('تم إلغاء الطلب')
    if (selectedOrder?.id === order.id) setSelectedOrder(null)
  }

  // تعليم/إلغاء تعليم صنف كـ"غير متوفر" داخل الطلب، مع إعادة حساب الإجمالي تلقائياً
  const toggleItemUnavailable = async (order, itemIndex) => {
    const items = Array.isArray(order.items) ? order.items : []
    const updatedItems = items.map((it, i) =>
      i === itemIndex ? { ...it, unavailable: !it.unavailable } : it
    )
    // المجموع الجزئي من الأصناف المتاحة فقط (item.price يشمل أصلاً سعر الخيارات المختارة)
    const newSubtotal = updatedItems.reduce((sum, it) => {
      if (it.unavailable) return sum
      return sum + (it.price * it.qty)
    }, 0)
    const newTax = newSubtotal * 0.15
    const newTotal = newSubtotal + newTax
    // لو كل الأصناف بقت غير متوفرة، يُلغى الطلب بالكامل تلقائياً
    const allUnavailable = updatedItems.every(it => it.unavailable)

    const updatePayload = { items: updatedItems, subtotal: newSubtotal, tax: newTax, total: newTotal }
    if (allUnavailable) { updatePayload.status = 'cancelled'; updatePayload.cancelled_by = 'restaurant' }

    const { error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', order.id)

    if (error) { toast.error(error.message); return }
    const item = items[itemIndex]
    if (allUnavailable) {
      toast.error('🚫 تم إلغاء الطلب بالكامل — كل الأصناف غير متوفرة')
    } else {
      toast.success(item.unavailable ? `✅ ${item.name} أصبح متوفراً` : `⚠️ تم تعليم ${item.name} كغير متوفر`)
    }
  }

  const handleSignOut = async () => { await signOut(); navigate('/login') }

  // Filter orders
  const filteredOrders = orders.filter(o => {
    if (filter === 'active') return ['pending','preparing','ready'].includes(o.status)
    if (filter === 'completed') return o.status === 'completed'
    if (filter === 'cancelled') return o.status === 'cancelled'
    return true
  })

  const activeCount = orders.filter(o => ['pending','preparing','ready'].includes(o.status)).length
  const pendingCount = orders.filter(o => o.status === 'pending').length

  const NavItem = ({ icon, label, active, onClick, badge }) => (
    <div onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:'10px',
      padding:'10px 14px', borderRadius:'10px', cursor:'pointer',
      background: active ? 'rgba(255,107,53,0.12)' : 'transparent',
      color: active ? '#FF6B35' : 'rgba(255,255,255,0.55)',
      fontSize:'13px', fontWeight:'600', marginBottom:'2px',
      position:'relative', transition:'all 0.2s',
    }}>
      {active && <div style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', width:'3px', height:'20px', background:'#FF6B35', borderRadius:'0 3px 3px 0' }}/>}
      <span style={{ fontSize:'16px', width:'20px', textAlign:'center' }}>{icon}</span>
      {label}
      {badge > 0 && <span style={{ marginRight:'auto', background:'#FF6B35', color:'white', fontSize:'10px', fontWeight:'800', padding:'2px 7px', borderRadius:'100px' }}>{badge}</span>}
    </div>
  )

  if (loading) return <Spinner />

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', direction:'rtl', position:'relative' }}>

      {/* Mobile overlay */}
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:40 }}/>}

      {/* Sidebar */}
      <div style={{ position:'fixed', right:0, top:0, transform: !isMobile ? 'none' : sidebarOpen ? 'translateX(0)' : 'translateX(100%)', transition:'transform 0.3s ease', zIndex:50, height:'100vh' }}>
        <aside style={{ width:'240px', background:'#0F1117', height:'100dvh', display:'flex', flexDirection:'column', borderLeft:'1px solid rgba(255,255,255,0.06)', overflowY:'auto' }}>
          <div style={{ padding:'20px 18px', display:'flex', alignItems:'center', gap:'10px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width:'34px', height:'34px', background:'linear-gradient(135deg,#FF6B35,#E85A24)', borderRadius:'9px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', color:'white' }}>S</div>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', color:'white' }}>SIM<span style={{ color:'#FF6B35' }}>SIM</span></span>
          </div>

          {restaurant && (
            <div style={{ margin:'12px', padding:'10px 12px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'11px', display:'flex', alignItems:'center', gap:'10px' }}>
              <div style={{ width:'32px', height:'32px', borderRadius:'8px', background: restaurant.logo_url ? 'transparent' : 'linear-gradient(135deg,#FF6B35,#FF9F6B)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', overflow:'hidden' }}>{restaurant.logo_url ? <img src={restaurant.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : '🍕'}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{restaurant.name}</div>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', direction:'ltr' }}>{window.location.host}/menu/{restaurant.slug}</div>
              </div>
            </div>
          )}

          <nav style={{ padding:'8px 12px', flex:1, overflowY:'auto' }}>
            <NavItem icon="📊" label="الرئيسية" onClick={() => navigate('/dashboard')} />
            <NavItem icon="🛒" label="الطلبات" active={true} badge={activeCount} onClick={() => setSidebarOpen(false)} />
            <NavItem icon="📋" label="الأقسام" onClick={() => navigate('/menu')} />
            <NavItem icon="🍽️" label="الأصناف" onClick={() => navigate('/menu', { state: { tab: 'products' } })} />
            <NavItem icon="👥" label="العملاء" onClick={() => navigate('/customers')} />
            <NavItem icon="📱" label="QR Code" onClick={() => navigate('/qr')} />
            <NavItem icon="📈" label="التحليلات" onClick={() => navigate('/analytics')} />
            <NavItem icon="⚙️" label="الإعدادات" onClick={() => navigate('/settings')} />
          </nav>

          <div style={{ padding:'12px', borderTop:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', marginBottom:'8px' }}>
              <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'linear-gradient(135deg,#667eea,#764ba2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:'700', color:'white', flexShrink:0 }}>
                {user?.user_metadata?.full_name?.charAt(0) || 'م'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'13px', fontWeight:'700', color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.user_metadata?.full_name}</div>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.email}</div>
              </div>
            </div>
            <button onClick={handleSignOut} style={{ width:'100%', padding:'9px', borderRadius:'9px', border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.08)', color:'#FC8181', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>
              تسجيل الخروج 🚪
            </button>
          </div>
        </aside>
      </div>

      {/* Main */}
      <main style={{ marginRight: isMobile ? '0' : '240px', flex:1, display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>

        {/* Topbar */}
        <div style={{ height:'56px', background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', padding:'0 16px', gap:'10px', flexShrink:0 }}>
          {isMobile && <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background:'none', border:'none', fontSize:'22px', cursor:'pointer' }}>☰</button>}
          <span style={{ fontSize:'16px', fontWeight:'800' }}>الطلبات</span>
          {activeCount > 0 && (
            <span style={{ background:'#FF6B35', color:'white', fontSize:'11px', fontWeight:'800', padding:'3px 10px', borderRadius:'100px' }}>
              {activeCount} نشط
            </span>
          )}
          <div style={{ marginRight:'auto', display:'flex', alignItems:'center', gap:'8px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'12px', fontWeight:'700', color:'#10B981' }}>
              <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#10B981', display:'inline-block', animation:'blink 2s infinite' }}/>
              <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
              مباشر
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', padding:'12px 16px', display:'flex', gap:'10px', overflowX:'auto', flexShrink:0 }}>
          {[
            { label:'كل الطلبات', val:orders.length, color:'#374151', bg:'#F3F4F6' },
            { label:'⏳ انتظار', val:orders.filter(o=>o.status==='pending').length, color:'#92400E', bg:'#FEF3C7' },
            { label:'👨‍🍳 تحضير', val:orders.filter(o=>o.status==='preparing').length, color:'#1E40AF', bg:'#DBEAFE' },
            { label:'✅ جاهز', val:orders.filter(o=>o.status==='ready').length, color:'#065F46', bg:'#D1FAE5' },
            { label:'🎉 مكتمل', val:orders.filter(o=>o.status==='completed').length, color:'#6B7280', bg:'#F3F4F6' },
          ].map(s => (
            <div key={s.label} style={{ flexShrink:0, padding:'8px 14px', borderRadius:'10px', background:s.bg, textAlign:'center', minWidth:'70px' }}>
              <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', color:s.color }}>{s.val}</div>
              <div style={{ fontSize:'10px', color:s.color, fontWeight:'600', whiteSpace:'nowrap' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', padding:'0 16px', flexShrink:0, overflowX:'auto', scrollbarWidth:'none' }}>
          {[
            { key:'active', label:`🔥 النشطة (${activeCount})` },
            { key:'all', label:`📋 الكل (${orders.length})` },
            { key:'completed', label:'✅ المكتملة' },
            { key:'cancelled', label:'🚫 الملغية' },
          ].map(t => (
            <div key={t.key} onClick={() => setFilter(t.key)} style={{
              padding:'12px 14px', fontSize:'13px', fontWeight:'700',
              color: filter === t.key ? '#FF6B35' : '#6B7280',
              borderBottom: filter === t.key ? '2.5px solid #FF6B35' : '2.5px solid transparent',
              cursor:'pointer', whiteSpace:'nowrap',
            }}>
              {t.label}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, overflow:'hidden', display:'flex' }}>

          {/* Orders list */}
          <div style={{ flex:1, overflowY:'auto', padding:'12px' }}>
            {filteredOrders.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 16px', color:'#9CA3AF' }}>
                <div style={{ fontSize:'48px', opacity:0.3, marginBottom:'12px' }}>📭</div>
                <div style={{ fontSize:'16px', fontWeight:'700', color:'#374151', marginBottom:'8px' }}>
                  {filter === 'active' ? 'لا توجد طلبات نشطة' : 'لا توجد طلبات'}
                </div>
                <div style={{ fontSize:'13px' }}>
                  {filter === 'active' ? 'الطلبات الجديدة ستظهر هنا فوراً' : 'ستظهر الطلبات هنا عند وصولها'}
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                {filteredOrders.map(order => {
                  const s = STATUS[order.status] || STATUS.pending
                  const isSelected = selectedOrder?.id === order.id
                  const items = Array.isArray(order.items) ? order.items : []

                  return (
                    <div
                      key={order.id}
                      onClick={() => setSelectedOrder(isSelected ? null : order)}
                      style={{
                        background:'white', borderRadius:'14px',
                        border: `1.5px solid ${isSelected ? '#FF6B35' : '#E5E7EB'}`,
                        overflow:'hidden', cursor:'pointer',
                        boxShadow: isSelected ? '0 0 0 3px rgba(255,107,53,0.12)' : 'none',
                        transition:'all 0.2s',
                      }}
                    >
                      {/* Order header */}
                      <div style={{ padding:'12px 14px', display:'flex', alignItems:'center', gap:'10px' }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
                            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px' }}>{order.order_number}</span>
                            <span style={{ padding:'2px 8px', borderRadius:'100px', background:s.bg, color:s.color, fontSize:'11px', fontWeight:'700' }}>
                              {order.status === 'cancelled'
                                ? (order.cancelled_by === 'customer' ? 'ملغي من العميل' : 'ملغي من المطعم')
                                : s.label}
                            </span>
                            {order.status === 'pending' && (
                              <span style={{ fontSize:'10px', fontWeight:'700', color:'#FF6B35', background:'rgba(255,107,53,0.1)', padding:'2px 6px', borderRadius:'100px', animation:'blink 1.5s infinite' }}>جديد!</span>
                            )}
                          </div>
                          <div style={{ fontSize:'12px', color:'#9CA3AF', display:'flex', gap:'8px', flexWrap:'wrap' }}>
                            {order.customer_name && <span>👤 {order.customer_name}</span>}
                            <span>{{ dine_in:'🪑 محلي', takeaway:'🥡 سفري', delivery:'🛵 توصيل' }[order.type] || '🪑 محلي'}</span>
                            {order.type === 'dine_in' && order.table_number && <span>طاولة {order.table_number}</span>}
                            {order.type === 'delivery' && order.delivery_address && <span>📍 {order.delivery_address}</span>}
                            {order.customer_phone && <span style={{ direction:'ltr', display:'inline-block' }}>📱 {order.customer_phone}</span>}
                            <span>🕐 {new Date(order.created_at).toLocaleTimeString('ar', { hour:'2-digit', minute:'2-digit' })}</span>
                          </div>
                        </div>
                        <div style={{ textAlign:'left', flexShrink:0 }}>
                          <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', color:'#FF6B35' }}>{order.total} ﷼</div>
                          <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{items.length} أصناف</div>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isSelected && (
                        <div style={{ borderTop:'1px solid #F3F4F6', padding:'12px 14px', background:'#FAFAFA' }}>

                          {/* Items */}
                          {items.length > 0 && (
                            <div style={{ marginBottom:'12px' }}>
                              <div style={{ fontSize:'12px', fontWeight:'700', color:'#9CA3AF', marginBottom:'8px', textTransform:'uppercase', letterSpacing:'0.5px' }}>الأصناف</div>
                              {items.map((item, i) => (
                                <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #F0F0F0', opacity: item.unavailable ? 0.5 : 1 }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                                    <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0, overflow:'hidden' }}>
                                      {item.image_url
                                        ? <img src={item.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                                        : (item.emoji || '🍽️')}
                                    </div>
                                    <div>
                                      <div style={{ fontSize:'13px', fontWeight:'700', textDecoration: item.unavailable ? 'line-through' : 'none' }}>
                                        {item.name}
                                        {item.unavailable && <span style={{ fontSize:'10px', fontWeight:'700', color:'#EF4444', background:'#FEF2F2', padding:'2px 6px', borderRadius:'100px', marginRight:'6px' }}>غير متوفر</span>}
                                      </div>
                                      {Array.isArray(item.selectedOptions) && item.selectedOptions.length > 0 && (
                                        <div style={{ fontSize:'11px', color:'#FF6B35', fontWeight:'600' }}>
                                          {item.selectedOptions.map(o => o.choiceName).join(' + ')}
                                        </div>
                                      )}
                                      {item.notes && <div style={{ fontSize:'11px', color:'#9CA3AF' }}>📝 {item.notes}</div>}
                                    </div>
                                  </div>
                                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                                    {order.status === 'pending' && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); toggleItemUnavailable(order, i) }}
                                        style={{ padding:'4px 8px', borderRadius:'7px', border:`1.5px solid ${item.unavailable ? '#D1FAE5' : '#FEE2E2'}`, background: item.unavailable ? '#ECFDF5' : '#FEF2F2', color: item.unavailable ? '#065F46' : '#EF4444', fontSize:'10px', fontWeight:'700', cursor:'pointer', whiteSpace:'nowrap' }}
                                      >
                                        {item.unavailable ? '↺ إعادة' : '⚠️ غير متوفر'}
                                      </button>
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

                          {/* Notes */}
                          {order.notes && (
                            <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:'10px', padding:'10px 12px', marginBottom:'12px', fontSize:'13px' }}>
                              📝 {order.notes}
                            </div>
                          )}

                          {/* Summary */}
                          <div style={{ background:'white', borderRadius:'10px', padding:'10px 12px', marginBottom:'12px', border:'1px solid #E5E7EB' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#9CA3AF', marginBottom:'4px' }}>
                              <span>المجموع الجزئي</span><span>{(order.subtotal ?? order.total ?? 0).toFixed ? (order.subtotal ?? order.total).toFixed(2) : (order.subtotal ?? order.total)} ﷼</span>
                            </div>
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#9CA3AF', marginBottom: order.delivery_fee > 0 ? '4px' : '6px' }}>
                              <span>الضريبة 15%</span><span>{(order.tax ?? 0).toFixed(2)} ﷼</span>
                            </div>
                            {order.delivery_fee > 0 && (
                              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#9CA3AF', marginBottom:'6px' }}>
                                <span>🛵 رسوم التوصيل</span><span>{Number(order.delivery_fee).toFixed(2)} ﷼</span>
                              </div>
                            )}
                            <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px', paddingTop:'6px', borderTop:'1px solid #E5E7EB' }}>
                              <span>الإجمالي</span>
                              <span style={{ color:'#FF6B35' }}>{(order.total ?? 0).toFixed(2)} ﷼</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display:'flex', gap:'8px' }}>
                            {STATUS[order.status]?.next && (
                              <button
                                onClick={(e) => { e.stopPropagation(); advanceOrder(order) }}
                                style={{ flex:2, padding:'11px', borderRadius:'11px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', cursor:'pointer' }}
                              >
                                {STATUS[order.status]?.nextLabel}
                              </button>
                            )}
                            {['pending','preparing','ready'].includes(order.status) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); cancelOrder(order) }}
                                style={{ flex:1, padding:'11px', borderRadius:'11px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', color:'#EF4444', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}
                              >
                                إلغاء
                              </button>
                            )}
                            {!STATUS[order.status]?.next && (
                              <div style={{ flex:1, padding:'11px', borderRadius:'11px', background:'#F3F4F6', textAlign:'center', fontSize:'13px', color:'#9CA3AF', fontWeight:'600' }}>
                                {order.status === 'completed'
                                  ? '✅ مكتمل'
                                  : order.cancelled_by === 'customer'
                                    ? '🚫 ملغي من العميل'
                                    : order.status === 'cancelled'
                                      ? '🚫 ملغي من المطعم'
                                      : '🚫 ملغي'}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
