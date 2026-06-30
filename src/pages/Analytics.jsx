import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

export default function Analytics() {
  const navigate = useNavigate()
  const { user, restaurant, signOut } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [period, setPeriod] = useState('week')
  const isMobile = window.innerWidth <= 768

  const [stats, setStats] = useState({
    totalRevenue: 0, totalOrders: 0, totalCustomers: 0,
    avgOrder: 0, completionRate: 0, topProducts: [],
    dailyRevenue: [], ordersByStatus: {}, ordersByType: {},
  })

  useEffect(() => {
    if (!restaurant) return
    fetchAnalytics()
  }, [restaurant, period])

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      // Date range
      const now = new Date()
      const from = new Date()
      if (period === 'week') from.setDate(now.getDate() - 7)
      else if (period === 'month') from.setDate(now.getDate() - 30)
      else from.setDate(now.getDate() - 90)

      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .gte('created_at', from.toISOString())
        .order('created_at', { ascending: true })

      if (!orders) return

      // Calculate stats
      const completed = orders.filter(o => o.status === 'completed')
      const totalRevenue = completed.reduce((s, o) => s + (o.total || 0), 0)
      const totalOrders = orders.length
      const avgOrder = totalOrders > 0 ? totalRevenue / (completed.length || 1) : 0
      const completionRate = totalOrders > 0 ? Math.round((completed.length / totalOrders) * 100) : 0
      const uniqueCustomers = new Set(orders.map(o => o.customer_phone).filter(Boolean)).size

      // Daily revenue
      const dailyMap = {}
      orders.forEach(o => {
        const day = new Date(o.created_at).toLocaleDateString('ar', { weekday:'short', month:'short', day:'numeric' })
        if (!dailyMap[day]) dailyMap[day] = { revenue:0, orders:0 }
        dailyMap[day].orders++
        if (o.status === 'completed') dailyMap[day].revenue += (o.total || 0)
      })
      const dailyRevenue = Object.entries(dailyMap).map(([day, data]) => ({ day, ...data }))

      // Orders by status
      const statusMap = {}
      orders.forEach(o => { statusMap[o.status] = (statusMap[o.status] || 0) + 1 })

      // Orders by type
      const typeMap = {}
      orders.forEach(o => { typeMap[o.type || 'dine_in'] = (typeMap[o.type || 'dine_in'] || 0) + 1 })

      // Top products
      const productMap = {}
      orders.forEach(o => {
        const items = Array.isArray(o.items) ? o.items : []
        items.forEach(item => {
          if (!productMap[item.name]) productMap[item.name] = { name:item.name, emoji:item.emoji||'🍽️', count:0, revenue:0 }
          productMap[item.name].count += item.qty || 1
          productMap[item.name].revenue += (item.price || 0) * (item.qty || 1)
        })
      })
      const topProducts = Object.values(productMap).sort((a,b) => b.count - a.count).slice(0, 5)

      setStats({ totalRevenue, totalOrders, totalCustomers: uniqueCustomers, avgOrder, completionRate, topProducts, dailyRevenue, ordersByStatus: statusMap, ordersByType: typeMap })
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => { await signOut(); navigate('/login') }

  const NavItem = ({ icon, label, active, onClick }) => (
    <div onClick={onClick} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', borderRadius:'10px', cursor:'pointer', background: active?'rgba(255,107,53,0.12)':'transparent', color: active?'#FF6B35':'rgba(255,255,255,0.55)', fontSize:'13px', fontWeight:'600', marginBottom:'2px', position:'relative', transition:'all 0.2s' }}>
      {active && <div style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', width:'3px', height:'20px', background:'#FF6B35', borderRadius:'0 3px 3px 0' }}/>}
      <span style={{ fontSize:'16px', width:'20px', textAlign:'center' }}>{icon}</span>
      {label}
    </div>
  )

  // Simple bar chart
  const BarChart = ({ data, maxVal }) => (
    <div style={{ display:'flex', alignItems:'flex-end', gap:'6px', height:'120px', padding:'8px 0' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', height:'100%', justifyContent:'flex-end' }}>
          <div style={{ fontSize:'10px', color:'#9CA3AF', fontFamily:'Cairo,sans-serif', fontWeight:'700' }}>
            {d.revenue > 0 ? Math.round(d.revenue) : ''}
          </div>
          <div style={{
            width:'100%', borderRadius:'4px 4px 0 0',
            background: i === data.length-1 ? '#FF6B35' : 'rgba(255,107,53,0.3)',
            height: maxVal > 0 ? `${Math.max((d.revenue / maxVal) * 80, d.revenue > 0 ? 4 : 0)}%` : '0%',
            minHeight: d.revenue > 0 ? '4px' : '0',
            transition:'height 0.5s ease',
          }}/>
          <div style={{ fontSize:'9px', color:'#9CA3AF', textAlign:'center', whiteSpace:'nowrap', overflow:'hidden', width:'100%', textOverflow:'ellipsis' }}>
            {d.day?.split('،')[0] || d.day}
          </div>
        </div>
      ))}
    </div>
  )

  const maxRevenue = Math.max(...(stats.dailyRevenue.map(d => d.revenue)), 1)

  const STATUS_LABELS = { pending:'انتظار', preparing:'تحضير', ready:'جاهز', completed:'مكتمل', cancelled:'ملغي' }
  const STATUS_COLORS = { pending:'#F59E0B', preparing:'#3B82F6', ready:'#10B981', completed:'#6B7280', cancelled:'#EF4444' }
  const TYPE_LABELS = { dine_in:'طاولة', takeaway:'تيك أواي', delivery:'توصيل' }
  const TYPE_COLORS = { dine_in:'#FF6B35', takeaway:'#3B82F6', delivery:'#10B981' }

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0F1117', color:'white', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,107,53,0.3)', borderTopColor:'#FF6B35', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      جارٍ تحميل التحليلات...
    </div>
  )

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', direction:'rtl', position:'relative' }}>

      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:40 }}/>}

      {/* Sidebar */}
      <div style={{ position:'fixed', right:0, top:0, transform: !isMobile?'none':sidebarOpen?'translateX(0)':'translateX(100%)', transition:'transform 0.3s ease', zIndex:50, height:'100vh' }}>
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
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', direction:'ltr' }}>{window.location.origin}/menu/{restaurant.slug}</div>
              </div>
            </div>
          )}

          <nav style={{ padding:'8px 12px', flex:1, overflowY:'auto' }}>
            <NavItem icon="📊" label="الرئيسية"   onClick={() => navigate('/dashboard')} />
            <NavItem icon="🛒" label="الطلبات"    onClick={() => navigate('/orders')} />
            <NavItem icon="📋" label="الأقسام"    onClick={() => navigate('/menu')} />
            <NavItem icon="🍽️" label="الأصناف"    onClick={() => navigate('/menu', { state: { tab: 'products' } })} />
            <NavItem icon="👥" label="العملاء"    onClick={() => navigate('/customers')} />
            <NavItem icon="🏢" label="الفروع"     onClick={() => navigate('/branches')} />
            <NavItem icon="📱" label="QR Code"    onClick={() => navigate('/qr')} />
            <NavItem icon="📈" label="التحليلات"  active={true} onClick={() => setSidebarOpen(false)} />
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
      <main style={{ marginRight: isMobile?'0':'240px', flex:1, display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>

        {/* Topbar */}
        <div style={{ height:'56px', background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', padding:'0 16px', gap:'10px', flexShrink:0 }}>
          {isMobile && <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background:'none', border:'none', fontSize:'22px', cursor:'pointer' }}>☰</button>}
          <span style={{ fontSize:'16px', fontWeight:'800' }}>📊 التحليلات</span>
          <div style={{ marginRight:'auto', display:'flex', gap:'6px' }}>
            {[
              { key:'week', label:'7 أيام' },
              { key:'month', label:'30 يوم' },
              { key:'quarter', label:'90 يوم' },
            ].map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)} style={{ padding:'6px 12px', borderRadius:'8px', border:`1.5px solid ${period===p.key?'#FF6B35':'#E5E7EB'}`, background: period===p.key?'#FFF0EB':'white', color: period===p.key?'#FF6B35':'#374151', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>

          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'12px', marginBottom:'16px' }}>
            {[
              { icon:'💰', val:`${Number(stats.totalRevenue).toFixed(2)} ﷼`, label:'إجمالي المبيعات', color:'#FF6B35', bg:'rgba(255,107,53,0.1)', sub:`متوسط الطلب: ${Math.round(stats.avgOrder)} ﷼` },
              { icon:'🛒', val:stats.totalOrders, label:'إجمالي الطلبات', color:'#3B82F6', bg:'rgba(59,130,246,0.1)', sub:`معدل الإتمام: ${stats.completionRate}%` },
              { icon:'👥', val:stats.totalCustomers, label:'عملاء فريدون', color:'#10B981', bg:'rgba(16,185,129,0.1)', sub:'بناءً على رقم الجوال' },
              { icon:'⭐', val:`${stats.completionRate}%`, label:'معدل إتمام الطلبات', color:'#F59E0B', bg:'rgba(245,158,11,0.1)', sub:`${stats.totalOrders - (stats.ordersByStatus.cancelled||0)} من ${stats.totalOrders}` },
            ].map(s => (
              <div key={s.label} style={{ background:'white', borderRadius:'14px', border:'1px solid #E5E7EB', padding:'14px' }}>
                <div style={{ width:'36px', height:'36px', borderRadius:'10px', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', marginBottom:'10px' }}>{s.icon}</div>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', color:s.color, marginBottom:'3px' }}>{s.val}</div>
                <div style={{ fontSize:'12px', color:'#374151', fontWeight:'700', marginBottom:'2px' }}>{s.label}</div>
                <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Revenue Chart */}
          <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden', marginBottom:'14px' }}>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:'14px', fontWeight:'800' }}>📈 المبيعات اليومية</span>
              <span style={{ fontSize:'12px', color:'#9CA3AF' }}>ريال</span>
            </div>
            <div style={{ padding:'16px' }}>
              {stats.dailyRevenue.length > 0 ? (
                <BarChart data={stats.dailyRevenue} maxVal={maxRevenue} />
              ) : (
                <div style={{ height:'120px', display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF', fontSize:'13px' }}>
                  لا توجد بيانات بعد
                </div>
              )}
            </div>
          </div>

          {/* Top Products */}
          <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden', marginBottom:'14px' }}>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>🏆 أكثر الأصناف طلباً</div>
            {stats.topProducts.length === 0 ? (
              <div style={{ padding:'32px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>لا توجد بيانات بعد</div>
            ) : (
              <div style={{ padding:'12px' }}>
                {stats.topProducts.map((p, i) => {
                  const maxCount = stats.topProducts[0]?.count || 1
                  const pct = Math.round((p.count / maxCount) * 100)
                  const medals = ['🥇','🥈','🥉','4️⃣','5️⃣']
                  return (
                    <div key={p.name} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 0', borderBottom: i < stats.topProducts.length-1 ? '1px solid #F3F4F6' : 'none' }}>
                      <span style={{ fontSize:'18px', flexShrink:0 }}>{medals[i]}</span>
                      <span style={{ fontSize:'22px', flexShrink:0 }}>{p.emoji}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'13px', fontWeight:'700', marginBottom:'4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                        <div style={{ height:'6px', background:'#F3F4F6', borderRadius:'3px', overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,#FF6B35,#FF9F6B)`, borderRadius:'3px', transition:'width 0.8s ease' }}/>
                        </div>
                      </div>
                      <div style={{ textAlign:'left', flexShrink:0 }}>
                        <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', color:'#FF6B35' }}>{p.count}</div>
                        <div style={{ fontSize:'10px', color:'#9CA3AF' }}>{Math.round(p.revenue)} ﷼</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Orders by status & type */}
          <div style={{ display:'grid', gridTemplateColumns: isMobile?'1fr':'1fr 1fr', gap:'14px', marginBottom:'14px' }}>

            {/* By Status */}
            <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>📋 الطلبات حسب الحالة</div>
              <div style={{ padding:'12px' }}>
                {Object.keys(STATUS_LABELS).map(status => {
                  const count = stats.ordersByStatus[status] || 0
                  if (count === 0) return null
                  const total = stats.totalOrders || 1
                  const pct = Math.round((count / total) * 100)
                  return (
                    <div key={status} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 0', borderBottom:'1px solid #F3F4F6' }}>
                      <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:STATUS_COLORS[status], flexShrink:0 }}/>
                      <span style={{ fontSize:'13px', fontWeight:'600', flex:1 }}>{STATUS_LABELS[status]}</span>
                      <div style={{ flex:2 }}>
                        <div style={{ height:'6px', background:'#F3F4F6', borderRadius:'3px', overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct}%`, background:STATUS_COLORS[status], borderRadius:'3px' }}/>
                        </div>
                      </div>
                      <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', minWidth:'30px', textAlign:'left' }}>{count}</span>
                    </div>
                  )
                })}
                {Object.values(stats.ordersByStatus).every(v => v === 0) && (
                  <div style={{ padding:'20px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>لا توجد بيانات</div>
                )}
              </div>
            </div>

            {/* By Type */}
            <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>🍽️ الطلبات حسب النوع</div>
              <div style={{ padding:'12px' }}>
                {Object.keys(TYPE_LABELS).map(type => {
                  const count = stats.ordersByType[type] || 0
                  if (count === 0) return null
                  const total = stats.totalOrders || 1
                  const pct = Math.round((count / total) * 100)
                  return (
                    <div key={type} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 0', borderBottom:'1px solid #F3F4F6' }}>
                      <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:TYPE_COLORS[type], flexShrink:0 }}/>
                      <span style={{ fontSize:'13px', fontWeight:'600', flex:1 }}>{TYPE_LABELS[type]}</span>
                      <div style={{ flex:2 }}>
                        <div style={{ height:'6px', background:'#F3F4F6', borderRadius:'3px', overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct}%`, background:TYPE_COLORS[type], borderRadius:'3px' }}/>
                        </div>
                      </div>
                      <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', minWidth:'30px', textAlign:'left' }}>{count}</span>
                    </div>
                  )
                })}
                {Object.values(stats.ordersByType).every(v => v === 0) && (
                  <div style={{ padding:'20px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }}>لا توجد بيانات</div>
                )}
              </div>
            </div>
          </div>

          {/* Summary card */}
          <div style={{ background:'linear-gradient(135deg,#0F1117,#1A1A2E)', borderRadius:'16px', padding:'20px', marginBottom:'14px' }}>
            <div style={{ fontSize:'14px', fontWeight:'800', color:'white', marginBottom:'14px' }}>📊 ملخص الفترة</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'12px' }}>
              {[
                { label:'متوسط الطلبات يومياً', val: stats.totalOrders > 0 ? Math.round(stats.totalOrders / (period==='week'?7:period==='month'?30:90)) : 0 },
                { label:'متوسط قيمة الطلب', val: `${Math.round(stats.avgOrder)} ﷼` },
                { label:'أعلى يوم مبيعاً', val: stats.dailyRevenue.length > 0 ? stats.dailyRevenue.reduce((a,b) => a.revenue>b.revenue?a:b, {revenue:0}).day?.split('،')[0] || '—' : '—' },
                { label:'معدل إتمام الطلبات', val: `${stats.completionRate}%` },
              ].map(s => (
                <div key={s.label} style={{ background:'rgba(255,255,255,0.05)', borderRadius:'12px', padding:'12px' }}>
                  <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.5)', marginBottom:'4px' }}>{s.label}</div>
                  <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', color:'#FF6B35' }}>{s.val}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
