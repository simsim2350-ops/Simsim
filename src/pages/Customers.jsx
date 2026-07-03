import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'

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
  const { user, restaurant } = useAuthStore()
  const [orders, setOrders] = useState([])
  const [branches, setBranches] = useState([])
  const [branchFilter, setBranchFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('recent') // recent | spent | orders
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  useEffect(() => {
    if (!restaurant) return
    fetchOrders()
    fetchBranches()
  }, [restaurant])

  const fetchBranches = async () => {
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('sort_order')
    if (data) setBranches(data)
  }

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
          branchId: o.branch_id || null,   // فرع أحدث طلب
          branchIds: new Set(),            // كل الفروع اللي طلب منها
          orders: [],
        }
      }
      const c = map[phone]
      c.orderCount += 1
      c.totalSpent += Number(o.total) || 0
      c.orders.push(o)
      c.branchIds.add(o.branch_id || '__main__')
      // أحدث اسم متاح للعميل (لو دخل اسمه في طلب سابق ونسيه في طلب لاحق)
      if (!c.name && o.customer_name) c.name = o.customer_name
      if (new Date(o.created_at) > new Date(c.lastOrderAt)) {
        c.lastOrderAt = o.created_at
        c.branchId = o.branch_id || null   // الفرع يتبع أحدث طلب
      }
    })
    return Object.values(map)
  }, [orders])

  // اسم الفرع من معرّفه (null = الفرع الرئيسي)
  const branchName = (bid) => {
    if (!bid) return '🏠 الفرع الرئيسي'
    const br = branches.find(b => b.id === bid)
    return br ? `🏢 ${br.name}` : '🏢 فرع محذوف'
  }

  const filtered = useMemo(() => {
    let list = customers
    // فلتر الفرع: __main__ = العملاء اللي طلبوا من الفرع الرئيسي، أو معرّف فرع محدد
    if (branchFilter !== 'all') {
      const key = branchFilter === '__main__' ? '__main__' : branchFilter
      list = list.filter(c => c.branchIds.has(key))
    }
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
  }, [customers, search, sortBy, branchFilter, branches])

  const stats = useMemo(() => {
    const total = customers.length
    const vip = customers.filter(c => c.orderCount >= 10).length
    const totalSpent = customers.reduce((s,c) => s + c.totalSpent, 0)
    const avgSpent = total > 0 ? totalSpent / total : 0
    return { total, vip, totalSpent, avgSpent }
  }, [customers])

  if (loading) return <Spinner />

  return (
    <AppShell
      active="customers"
      title="👥 العملاء"
      actions={<button onClick={() => navigate('/dashboard')} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer', color:'#374151' }}>← الرئيسية</button>}
    >
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
            {branches.length > 0 && (
              <select
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value)}
                style={{ padding:'10px 14px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'13px', outline:'none', cursor:'pointer', background:'white' }}
              >
                <option value="all">🏢 كل الفروع</option>
                <option value="__main__">🏠 الفرع الرئيسي</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
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
                          <span style={{ padding:'2px 8px', borderRadius:'100px', background:'#F3F4F6', color:'#6B7280', fontSize:'10px', fontWeight:'700' }}>{branchName(c.branchId)}</span>
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
                                <span style={{ fontSize:'10px', color:'#9CA3AF', marginRight:'6px' }}>· {branchName(o.branch_id)}</span>
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
    </AppShell>
  )
}
