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

  useEffect(() => {
    if (!restaurant) return
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
        setStats({ orders:data.length, revenue:data.reduce((s,o)=>s+(o.total||0),0), customers:new Set(data.map(o=>o.customer_phone)).size })
      }
    } finally { setLoading(false) }
  }

  const subscribeOrders = () => {
    const ch = supabase.channel('orders').on('postgres_changes',
      { event:'INSERT', schema:'public', table:'orders', filter:`restaurant_id=eq.${restaurant.id}` },
      (p) => {
        setOrders(prev=>[p.new,...prev])
        setStats(s=>({...s, orders:s.orders+1, revenue:s.revenue+(p.new.total||0)}))
        toast.success(`🔔 طلب جديد! ${p.new.order_number}`)
      }
    ).subscribe()
    return () => supabase.removeChannel(ch)
  }

  const statusMap = {
    pending:{label:'انتظار',bg:'#FEF3C7',color:'#92400E'},
    preparing:{label:'تحضير',bg:'#DBEAFE',color:'#1E40AF'},
    ready:{label:'جاهز',bg:'#D1FAE5',color:'#065F46'},
    completed:{label:'مكتمل',bg:'#F3F4F6',color:'#6B7280'},
    cancelled:{label:'ملغي',bg:'#FEE2E2',color:'#991B1B'},
  }

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0F1117', color:'white', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,107,53,0.3)', borderTopColor:'#FF6B35', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      جارٍ التحميل...
    </div>
  )

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', direction:'rtl' }}>

      {/* Sidebar */}
      <aside style={{ width:'240px', flexShrink:0, background:'#0F1117', height:'100vh', display:'flex', flexDirection:'column', borderLeft:'1px solid rgba(255,255,255,0.06)', position:'fixed', right:0, top:0 }}>
        <div style={{ padding:'20px 18px 16px', display:'flex', alignItems:'center', gap:'10px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width:'34px', height:'34px', background:'linear-gradient(135deg,#FF6B35,#E85A24)', borderRadius:'9px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', color:'white' }}>S</div>
          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', color:'white' }}>SIM<span style={{ color:'#FF6B35' }}>SIM</span></span>
        </div>

        {restaurant && (
          <div style={{ margin:'12px', padding:'10px 12px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'11px', display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:'linear-gradient(135deg,#FF6B35,#FF9F6B)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px' }}>🍕</div>
            <div>
              <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', color:'white' }}>{restaurant.name}</div>
              <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', direction:'ltr' }}>simsim.menu/{restaurant.slug}</div>
            </div>
          </div>
        )}

        <nav style={{ padding:'8px 12px', flex:1 }}>
          {[['📊','الرئيسية',true],['🛒','الطلبات',false],['📋','الأقسام',false],['🍽️','الأصناف',false],['👥','العملاء',false],['📱','QR Code',false],['📈','التحليلات',false],['⚙️','الإعدادات',false]].map(([icon,label,active])=>(
            <div key={label} onClick={()=>!active&&toast('قريباً! 🔧')} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 12px', borderRadius:'9px', cursor:'pointer', background:active?'rgba(255,107,53,0.12)':'transparent', color:active?'#FF6B35':'rgba(255,255,255,0.5)', fontSize:'13px', fontWeight:'600', marginBottom:'2px', position:'relative' }}>
              {active && <div style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', width:'3px', height:'20px', background:'#FF6B35', borderRadius:'0 3px 3px 0' }}/>}
              <span style={{ fontSize:'16px', width:'20px', textAlign:'center' }}>{icon}</span>
              {label}
            </div>
          ))}
        </nav>

        <div style={{ padding:'12px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', marginBottom:'8px' }}>
            <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'linear-gradient(135deg,#667eea,#764ba2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:'700', color:'white', fontFamily:'Cairo,sans-serif' }}>م</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'13px', fontWeight:'700', color:'white' }}>{user?.user_metadata?.full_name||'المستخدم'}</div>
              <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.email}</div>
            </div>
          </div>
          <button onClick={async()=>{await signOut();navigate('/login')}} style={{ width:'100%', padding:'9px', borderRadius:'9px', border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.4)', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer' }}>
            خروج 🚪
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ marginRight:'240px', flex:1, display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
        <div style={{ height:'60px', background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', padding:'0 24px', gap:'12px', flexShrink:0 }}>
          <div>
            <span style={{ fontSize:'17px', fontWeight:'800' }}>لوحة التحكم</span>
            <span style={{ fontSize:'13px', color:'#9CA3AF', marginRight:'8px' }}>مرحباً، {user?.user_metadata?.full_name?.split(' ')[0]||'بك'} 👋</span>
          </div>
          <div style={{ marginRight:'auto', display:'flex', gap:'10px' }}>
            <button onClick={()=>{navigator.clipboard.writeText(`https://simsim.menu/${restaurant?.slug}`);toast.success('تم نسخ الرابط! 📋')}} style={{ padding:'8px 16px', borderRadius:'9px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}>
              📤 مشاركة المنيو
            </button>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'22px 24px 40px' }}>

          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'14px', marginBottom:'18px' }}>
            {[
              {icon:'🛒',val:stats.orders,label:'طلب اليوم',color:'#FF6B35',bg:'rgba(255,107,53,0.1)'},
              {icon:'💰',val:`${stats.revenue.toLocaleString('ar')} ﷼`,label:'مبيعات اليوم',color:'#10B981',bg:'rgba(16,185,129,0.1)'},
              {icon:'👥',val:stats.customers,label:'عميل جديد',color:'#3B82F6',bg:'rgba(59,130,246,0.1)'},
              {icon:'⭐',val:'4.9',label:'تقييم العملاء',color:'#F59E0B',bg:'rgba(245,158,11,0.1)'},
            ].map(s=>(
              <div key={s.label} style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', padding:'18px 20px' }}>
                <div style={{ width:'40px', height:'40px', borderRadius:'11px', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', marginBottom:'12px' }}>{s.icon}</div>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'26px', color:s.color, lineHeight:'1', marginBottom:'4px' }}>{s.val}</div>
                <div style={{ fontSize:'13px', color:'#9CA3AF' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Orders */}
          <div style={{ background:'white', borderRadius:'18px', border:'1px solid #E5E7EB', overflow:'hidden', marginBottom:'18px' }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:'15px', fontWeight:'800' }}>🧾 آخر الطلبات</div>
              <span style={{ fontSize:'12px', color:'#10B981', fontWeight:'700', display:'flex', alignItems:'center', gap:'5px' }}>
                <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#10B981', display:'inline-block' }}/>مباشر
              </span>
            </div>

            {orders.length===0 ? (
              <div style={{ padding:'48px 24px', textAlign:'center', color:'#9CA3AF', fontSize:'14px' }}>
                <div style={{ fontSize:'48px', opacity:0.3, marginBottom:'12px' }}>📭</div>
                لا توجد طلبات اليوم<br/>
                <span style={{ fontSize:'13px', marginTop:'6px', display:'block' }}>شارك رابط منيوك لاستقبال أول طلب 🚀</span>
              </div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>{['الطلب','العميل','الحالة','المبلغ','الوقت'].map(h=>(
                      <th key={h} style={{ padding:'10px 16px', textAlign:'right', fontSize:'11px', fontWeight:'700', color:'#9CA3AF', textTransform:'uppercase', background:'#F8F9FB', borderBottom:'1px solid #E5E7EB' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {orders.map(order=>{
                      const s = statusMap[order.status]||statusMap.pending
                      return (
                        <tr key={order.id}>
                          <td style={{ padding:'13px 16px', borderBottom:'1px solid #E5E7EB', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px' }}>{order.order_number}</td>
                          <td style={{ padding:'13px 16px', borderBottom:'1px solid #E5E7EB', fontSize:'13px' }}>{order.customer_name||'—'}</td>
                          <td style={{ padding:'13px 16px', borderBottom:'1px solid #E5E7EB' }}>
                            <span style={{ padding:'3px 10px', borderRadius:'100px', background:s.bg, color:s.color, fontSize:'11px', fontWeight:'700' }}>{s.label}</span>
                          </td>
                          <td style={{ padding:'13px 16px', borderBottom:'1px solid #E5E7EB', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px' }}>{order.total} ﷼</td>
                          <td style={{ padding:'13px 16px', borderBottom:'1px solid #E5E7EB', fontSize:'12px', color:'#9CA3AF' }}>
                            {new Date(order.created_at).toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'})}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'14px' }}>
            {[
              {icon:'📋',label:'إدارة الأقسام',sub:'أضف وعدّل الأقسام'},
              {icon:'🍽️',label:'إضافة صنف',sub:'أضف أصنافاً جديدة'},
              {icon:'📱',label:'QR Code',sub:'حمّل وشارك QR'},
              {icon:'📊',label:'التحليلات',sub:'تقارير المبيعات'},
            ].map(q=>(
              <div key={q.label} onClick={()=>toast('قريباً! 🔧')} style={{ background:'white', border:'1.5px solid #E5E7EB', borderRadius:'14px', padding:'18px 14px', cursor:'pointer', textAlign:'center' }}>
                <div style={{ fontSize:'28px', marginBottom:'8px' }}>{q.icon}</div>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', marginBottom:'4px' }}>{q.label}</div>
                <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{q.sub}</div>
              </div>
            ))}
          </div>

        </div>
      </main>
    </div>
  )
}
