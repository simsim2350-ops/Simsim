import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, restaurant, signOut } = useAuthStore()
  const [stats, setStats] = useState({ orders:0, revenue:0, customers:0 })
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isMobile = window.innerWidth <= 768

  useEffect(() => {
    if (!restaurant) { setLoading(false); return }
    fetchData()
    const unsub = subscribeOrders()
    return unsub
  }, [restaurant])

  const fetchData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase.from('orders').select('*')
        .eq('restaurant_id', restaurant.id)
        .gte('created_at', today)
        .order('created_at', { ascending:false })
        .limit(10)
      if (data) {
        setOrders(data)
        setStats({
          orders: data.length,
          revenue: data.reduce((s,o) => s+(o.total||0), 0),
          customers: new Set(data.map(o => o.customer_phone)).size
        })
      }
    } finally { setLoading(false) }
  }

  const subscribeOrders = () => {
    if (!restaurant) return () => {}
    const ch = supabase.channel('orders-dash')
      .on('postgres_changes',
        { event:'INSERT', schema:'public', table:'orders', filter:`restaurant_id=eq.${restaurant.id}` },
        (p) => {
          setOrders(prev => [p.new, ...prev])
          setStats(s => ({ ...s, orders:s.orders+1, revenue:s.revenue+(p.new.total||0) }))
          toast.success(`🔔 طلب جديد! ${p.new.order_number}`)
        }
      ).subscribe()
    return () => supabase.removeChannel(ch)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const statusMap = {
    pending:   { label:'انتظار',  bg:'#FEF3C7', color:'#92400E' },
    preparing: { label:'تحضير',   bg:'#DBEAFE', color:'#1E40AF' },
    ready:     { label:'جاهز',    bg:'#D1FAE5', color:'#065F46' },
    completed: { label:'مكتمل',   bg:'#F3F4F6', color:'#6B7280' },
    cancelled: { label:'ملغي',    bg:'#FEE2E2', color:'#991B1B' },
  }

  const NavItem = ({ icon, label, active, onClick }) => (
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
    </div>
  )

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0F1117', color:'white', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,107,53,0.3)', borderTopColor:'#FF6B35', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      جارٍ التحميل...
    </div>
  )

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', direction:'rtl', position:'relative' }}>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:40 }}/>
      )}

      {/* Sidebar */}
      <div style={{
        position:'fixed', right:0, top:0,
        transform: !isMobile ? 'none' : sidebarOpen ? 'translateX(0)' : 'translateX(100%)',
        transition:'transform 0.3s ease',
        zIndex:50, height:'100vh',
      }}>
        <aside style={{ width:'240px', background:'#0F1117', height:'100vh', display:'flex', flexDirection:'column', borderLeft:'1px solid rgba(255,255,255,0.06)', overflowY:'auto' }}>

          {/* Logo */}
          <div style={{ padding:'20px 18px', display:'flex', alignItems:'center', gap:'10px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width:'34px', height:'34px', background:'linear-gradient(135deg,#FF6B35,#E85A24)', borderRadius:'9px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', color:'white' }}>S</div>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', color:'white' }}>SIM<span style={{ color:'#FF6B35' }}>SIM</span></span>
          </div>

          {/* Restaurant */}
          {restaurant && (
            <div style={{ margin:'12px', padding:'10px 12px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'11px', display:'flex', alignItems:'center', gap:'10px' }}>
              <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:'linear-gradient(135deg,#FF6B35,#FF9F6B)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px' }}>🍕</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{restaurant.name}</div>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', direction:'ltr' }}>{window.location.host}/menu/{restaurant.slug}</div>
              </div>
            </div>
          )}

          {/* Nav */}
          <nav style={{ padding:'8px 12px', flex:1, overflowY:'auto' }}>
            <NavItem icon="📊" label="الرئيسية" active={true} onClick={() => setSidebarOpen(false)} />
            <NavItem icon="🛒" label="الطلبات" onClick={() => { navigate('/orders'); setSidebarOpen(false) }} />
            <NavItem icon="📋" label="الأقسام" onClick={() => { navigate('/menu'); setSidebarOpen(false) }} />
            <NavItem icon="🍽️" label="الأصناف" onClick={() => { navigate('/menu'); setSidebarOpen(false) }} />
            <NavItem icon="👥" label="العملاء" onClick={() => toast('قريباً! 🔧')} />
            <NavItem icon="📱" label="QR Code" onClick={() => navigate('/qr')} />
            <NavItem icon="📈" label="التحليلات" onClick={() => navigate('/analytics')} />
            <NavItem icon="⚙️" label="الإعدادات" onClick={() => navigate('/settings')} />
          </nav>

          {/* User */}
          <div style={{ padding:'12px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', marginBottom:'8px' }}>
              <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'linear-gradient(135deg,#667eea,#764ba2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:'700', color:'white', fontFamily:'Cairo,sans-serif', flexShrink:0 }}>
                {user?.user_metadata?.full_name?.charAt(0) || 'م'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'13px', fontWeight:'700', color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.user_metadata?.full_name || 'المستخدم'}</div>
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
          {isMobile && (
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background:'none', border:'none', fontSize:'22px', cursor:'pointer', padding:'4px' }}>☰</button>
          )}
          <div style={{ flex:1 }}>
            <span style={{ fontSize:'16px', fontWeight:'800', color:'#0F1117' }}>لوحة التحكم</span>
            <span style={{ fontSize:'12px', color:'#9CA3AF', marginRight:'8px' }}>
              مرحباً، {user?.user_metadata?.full_name?.split(' ')[0] || 'بك'} 👋
            </span>
          </div>
          <button
            onClick={async () => {
              const menuURL = `${window.location.origin}/menu/${restaurant?.slug}`
              try {
                if (navigator.clipboard && window.isSecureContext) {
                  await navigator.clipboard.writeText(menuURL)
                } else {
                  const textarea = document.createElement('textarea')
                  textarea.value = menuURL
                  textarea.style.position = 'fixed'
                  textarea.style.opacity = '0'
                  document.body.appendChild(textarea)
                  textarea.focus()
                  textarea.select()
                  const ok = document.execCommand('copy')
                  document.body.removeChild(textarea)
                  if (!ok) throw new Error('execCommand failed')
                }
                toast.success('تم نسخ الرابط! 📋')
              } catch (err) {
                console.error('Copy failed:', err)
                toast.error('تعذّر نسخ الرابط')
              }
            }}
            style={{ padding:'8px 14px', borderRadius:'9px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer', whiteSpace:'nowrap' }}
          >
            📤 مشاركة
          </button>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>

          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'12px', marginBottom:'16px' }}>
            {[
              { icon:'🛒', val:stats.orders, label:'طلب اليوم', color:'#FF6B35', bg:'rgba(255,107,53,0.1)' },
              { icon:'💰', val:`${stats.revenue} ﷼`, label:'المبيعات', color:'#10B981', bg:'rgba(16,185,129,0.1)' },
              { icon:'👥', val:stats.customers, label:'عميل جديد', color:'#3B82F6', bg:'rgba(59,130,246,0.1)' },
              { icon:'⭐', val:'4.9', label:'التقييم', color:'#F59E0B', bg:'rgba(245,158,11,0.1)' },
            ].map(s => (
              <div key={s.label} style={{ background:'white', borderRadius:'14px', border:'1px solid #E5E7EB', padding:'16px' }}>
                <div style={{ width:'36px', height:'36px', borderRadius:'10px', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', marginBottom:'10px' }}>{s.icon}</div>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'22px', color:s.color, lineHeight:'1', marginBottom:'4px' }}>{s.val}</div>
                <div style={{ fontSize:'12px', color:'#9CA3AF' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Orders */}
          <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden', marginBottom:'16px' }}>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:'14px', fontWeight:'800' }}>🧾 آخر الطلبات</div>
              <span style={{ fontSize:'11px', color:'#10B981', fontWeight:'700', display:'flex', alignItems:'center', gap:'4px' }}>
                <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#10B981', display:'inline-block', animation:'blink 2s infinite' }}/>
                مباشر
                <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
              </span>
            </div>
            {orders.length === 0 ? (
              <div style={{ padding:'40px 16px', textAlign:'center', color:'#9CA3AF' }}>
                <div style={{ fontSize:'40px', opacity:0.3, marginBottom:'10px' }}>📭</div>
                <div style={{ fontSize:'14px', marginBottom:'6px', color:'#374151', fontWeight:'700' }}>لا توجد طلبات اليوم</div>
                <div style={{ fontSize:'12px' }}>شارك رابط منيوك لاستقبال أول طلب 🚀</div>
              </div>
            ) : (
              <div>
                {orders.map(order => {
                  const s = statusMap[order.status] || statusMap.pending
                  return (
                    <div key={order.id} style={{ padding:'12px 16px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px' }}>{order.order_number}</div>
                        <div style={{ fontSize:'12px', color:'#9CA3AF' }}>{order.customer_name || '—'}</div>
                      </div>
                      <div style={{ textAlign:'left' }}>
                        <span style={{ padding:'3px 8px', borderRadius:'100px', background:s.bg, color:s.color, fontSize:'11px', fontWeight:'700', display:'block', marginBottom:'4px' }}>{s.label}</span>
                        <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px' }}>{order.total} ﷼</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'12px' }}>
            {[
              { icon:'📋', label:'إدارة الأقسام', sub:'أضف وعدّل الأقسام', action: () => navigate('/menu') },
              { icon:'🍽️', label:'إضافة صنف', sub:'أضف أصنافاً جديدة', action: () => navigate('/menu') },
              { icon:'📱', label:'QR Code', sub:'حمّل وشارك QR', action: () => navigate('/qr') },
              { icon:'📊', label:'التحليلات', sub:'تقارير المبيعات', action: () => navigate('/analytics') },
            ].map(q => (
              <div key={q.label} onClick={q.action} style={{ background:'white', border:'1.5px solid #E5E7EB', borderRadius:'14px', padding:'16px 12px', cursor:'pointer', textAlign:'center', transition:'all 0.2s' }}>
                <div style={{ fontSize:'26px', marginBottom:'6px' }}>{q.icon}</div>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', marginBottom:'3px' }}>{q.label}</div>
                <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{q.sub}</div>
              </div>
            ))}
          </div>

        </div>
      </main>
    </div>
  )
}
