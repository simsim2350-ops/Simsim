import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

function Spinner() {
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0F1117', color:'white', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,107,53,0.3)', borderTopColor:'#FF6B35', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      جارٍ التحميل...
    </div>
  )
}

// تصنيف العميل بناءً على عدد طلباته
function getTier(orderCount) {
  if (orderCount >= 10) return { key:'vip', label:'💎 VIP', bg:'#EDE9FE', color:'#6D28D9' }
  if (orderCount >= 3) return { key:'regular', label:'⭐ مميز', bg:'#FEF3C7', color:'#92400E' }
  return { key:'new', label:'🆕 جديد', bg:'#DBEAFE', color:'#1E40AF' }
}

export default function Customers() {
  const navigate = useNavigate()
  const { user, restaurant, signOut } = useAuthStore()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('recent') // recent | spent | orders
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const isMobile = window.innerWidth <= 768

  useEffect(() => {
    if (!restaurant) return
    fetchOrders()
  }, [restaurant])

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false })
      if (data) setOrders(data)
    } finally {
      setLoading(false)
    }
  }

  // تجميع الطلبات في عملاء، بالاعتماد على رقم الجوال كمفتاح أساسي
  const customers = useMemo(() => {
    const map = {}
    orders.forEach(o => {
      const phone = (o.customer_phone || '').trim()
      if (!phone) return // طلبات قديمة بدون رقم جوال لا يمكن ربطها بعميل
      if (!map[phone]) {
        map[phone] = {
          phone,
          name: o.customer_name || null,
          orderCount: 0,
          totalSpent: 0,
          lastOrderAt: o.created_at,
          orders: [],
        }
      }
      const c = map[phone]
      c.orderCount += 1
      c.totalSpent += Number(o.total) || 0
      c.orders.push(o)
      // أحدث اسم متاح للعميل (لو دخل اسمه في طلب سابق ونسيه في طلب لاحق)
      if (!c.name && o.customer_name) c.name = o.customer_name
      if (new Date(o.created_at) > new Date(c.lastOrderAt)) c.lastOrderAt = o.created_at
    })
    return Object.values(map)
  }, [orders])

  const filtered = useMemo(() => {
    let list = customers
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) || c.phone.includes(q)
      )
    }
    const sorted = [...list]
    if (sortBy === 'spent') sorted.sort((a,b) => b.totalSpent - a.totalSpent)
    else if (sortBy === 'orders') sorted.sort((a,b) => b.orderCount - a.orderCount)
    else sorted.sort((a,b) => new Date(b.lastOrderAt) - new Date(a.lastOrderAt))
    return sorted
  }, [customers, search, sortBy])

  const stats = useMemo(() => {
    const total = customers.length
    const vip = customers.filter(c => c.orderCount >= 10).length
    const totalSpent = customers.reduce((s,c) => s + c.totalSpent, 0)
    const avgSpent = total > 0 ? totalSpent / total : 0
    return { total, vip, totalSpent, avgSpent }
  }, [customers])

  const handleSignOut = async () => { await signOut(); navigate('/login') }

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

  if (loading) return <Spinner />

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', direction:'rtl', position:'relative' }}>

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
              <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:'linear-gradient(135deg,#FF6B35,#FF9F6B)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px' }}>🍕</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{restaurant.name}</div>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', direction:'ltr' }}>{window.location.host}/menu/{restaurant.slug}</div>
              </div>
            </div>
          )}

          <nav style={{ padding:'8px 12px', flex:1, overflowY:'auto' }}>
            <NavItem icon="📊" label="الرئيسية"   onClick={() => navigate('/dashboard')} />
            <NavItem icon="🛒" label="الطلبات"    onClick={() => navigate('/orders')} />
            <NavItem icon="📋" label="الأقسام"    onClick={() => navigate('/menu')} />
            <NavItem icon="🍽️" label="الأصناف"    onClick={() => navigate('/menu')} />
            <NavItem icon="👥" label="العملاء"    active={true} onClick={() => setSidebarOpen(false)} />
            <NavItem icon="📱" label="QR Code"    onClick={() => navigate('/qr')} />
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
          <span style={{ fontSize:'16px', fontWeight:'800' }}>👥 العملاء</span>
          <div style={{ marginRight:'auto' }}>
            <button onClick={() => navigate('/dashboard')} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer', color:'#374151' }}>
              ← الرئيسية
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>

          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'12px', marginBottom:'16px' }}>
            {[
              { icon:'👥', val:stats.total, label:'إجمالي العملاء', color:'#3B82F6', bg:'rgba(59,130,246,0.1)' },
              { icon:'💎', val:stats.vip, label:'عملاء مميزون', color:'#6D28D9', bg:'rgba(109,40,217,0.1)' },
              { icon:'💰', val:`${stats.totalSpent.toFixed(2)} ﷼`, label:'إجمالي الإنفاق', color:'#10B981', bg:'rgba(16,185,129,0.1)' },
              { icon:'📊', val:`${stats.avgSpent.toFixed(2)} ﷼`, label:'متوسط إنفاق العميل', color:'#F59E0B', bg:'rgba(245,158,11,0.1)' },
            ].map(s => (
              <div key={s.label} style={{ background:'white', borderRadius:'14px', border:'1px solid #E5E7EB', padding:'14px' }}>
                <div style={{ width:'36px', height:'36px', borderRadius:'10px', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', marginBottom:'10px' }}>{s.icon}</div>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', color:s.color, marginBottom:'3px' }}>{s.val}</div>
                <div style={{ fontSize:'12px', color:'#374151', fontWeight:'700' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Search + sort */}
          <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:'160px', position:'relative' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو رقم الجوال..."
                style={{ width:'100%', padding:'10px 14px 10px 36px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'13px', outline:'none', textAlign:'right', boxSizing:'border-box' }}
              />
              <span style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', fontSize:'14px', color:'#9CA3AF' }}>🔍</span>
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{ padding:'10px 14px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'13px', outline:'none', cursor:'pointer', background:'white' }}
            >
              <option value="recent">الأحدث</option>
              <option value="spent">الأكثر إنفاقاً</option>
              <option value="orders">الأكثر طلباً</option>
            </select>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 16px', color:'#9CA3AF' }}>
              <div style={{ fontSize:'48px', opacity:0.3, marginBottom:'12px' }}>👥</div>
              <div style={{ fontSize:'16px', fontWeight:'700', color:'#374151', marginBottom:'8px' }}>
                {customers.length === 0 ? 'لا يوجد عملاء بعد' : 'لا توجد نتائج مطابقة'}
              </div>
              <div style={{ fontSize:'13px' }}>
                {customers.length === 0 ? 'سيظهر العملاء هنا تلقائياً مع أول طلب يدخل رقم جواله' : 'جرّب كلمة بحث مختلفة'}
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              {filtered.map(c => {
                const tier = getTier(c.orderCount)
                const isSelected = selectedCustomer?.phone === c.phone
                return (
                  <div key={c.phone} style={{ background:'white', borderRadius:'14px', border:`1.5px solid ${isSelected ? '#FF6B35' : '#E5E7EB'}`, overflow:'hidden' }}>
                    <div
                      onClick={() => setSelectedCustomer(isSelected ? null : c)}
                      style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px', cursor:'pointer' }}
                    >
                      <div style={{ width:'44px', height:'44px', borderRadius:'50%', background:'linear-gradient(135deg,#667eea,#764ba2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'17px', fontWeight:'700', color:'white', fontFamily:'Cairo,sans-serif', flexShrink:0 }}>
                        {(c.name || c.phone).charAt(0)}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'3px', flexWrap:'wrap' }}>
                          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px' }}>{c.name || 'بدون اسم'}</span>
                          <span style={{ padding:'2px 8px', borderRadius:'100px', background:tier.bg, color:tier.color, fontSize:'10px', fontWeight:'700' }}>{tier.label}</span>
                        </div>
                        <div style={{ fontSize:'12px', color:'#9CA3AF', direction:'ltr', textAlign:'right' }}>{c.phone}</div>
                      </div>
                      <div style={{ textAlign:'left', flexShrink:0 }}>
                        <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px', color:'#FF6B35' }}>{c.totalSpent.toFixed(2)} ﷼</div>
                        <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{c.orderCount} طلب</div>
                      </div>
                    </div>

                    {isSelected && (
                      <div style={{ borderTop:'1px solid #F3F4F6', padding:'12px 16px', background:'#FAFAFA' }}>
                        <div style={{ fontSize:'12px', fontWeight:'700', color:'#9CA3AF', marginBottom:'8px', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                          سجل الطلبات ({c.orders.length})
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                          {c.orders.map(o => (
                            <div key={o.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', background:'white', borderRadius:'8px', border:'1px solid #F0F0F0' }}>
                              <div>
                                <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px' }}>{o.order_number}</span>
                                <span style={{ fontSize:'11px', color:'#9CA3AF', marginRight:'8px' }}>
                                  {new Date(o.created_at).toLocaleDateString('ar', { day:'numeric', month:'short' })}
                                </span>
                              </div>
                              <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', color:'#FF6B35' }}>{Number(o.total).toFixed(2)} ﷼</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

        </div>
      </main>
    </div>
  )
               }
