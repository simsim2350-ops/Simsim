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

export default function Loyalty() {
  const navigate = useNavigate()
  const { user, restaurant, signOut } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('loyalty')
  const isMobile = window.innerWidth <= 768

  // إعدادات برنامج الولاء
  const [enabled, setEnabled] = useState(false)
  const [earnRate, setEarnRate] = useState(1)
  const [rewardThreshold, setRewardThreshold] = useState(100)
  const [rewardDescription, setRewardDescription] = useState('خصم 10 ﷼ على طلبك القادم')
  const [saving, setSaving] = useState(false)

  // بيانات
  const [orders, setOrders] = useState([])          // الطلبات المكتملة
  const [redemptions, setRedemptions] = useState([]) // سجل الاستبدالات
  const [branches, setBranches] = useState([])
  const [reviews, setReviews] = useState([])
  const [reviewBranch, setReviewBranch] = useState('all')

  useEffect(() => {
    if (!restaurant) { setLoading(false); return }
    fetchAll()
  }, [restaurant])

  const fetchAll = async () => {
    try {
      const [progRes, ordRes, redRes, brRes, revRes] = await Promise.all([
        supabase.from('loyalty_programs').select('*').eq('restaurant_id', restaurant.id).maybeSingle(),
        supabase.from('orders').select('customer_phone, customer_name, total, branch_id, status').eq('restaurant_id', restaurant.id).eq('status', 'completed'),
        supabase.from('loyalty_redemptions').select('*').eq('restaurant_id', restaurant.id),
        supabase.from('branches').select('id, name').eq('restaurant_id', restaurant.id).order('sort_order'),
        supabase.from('reviews').select('*').eq('restaurant_id', restaurant.id).order('created_at', { ascending:false }).limit(50),
      ])
      if (progRes.data) {
        setEnabled(progRes.data.enabled)
        setEarnRate(Number(progRes.data.earn_rate) || 1)
        setRewardThreshold(progRes.data.reward_threshold ?? 100)
        setRewardDescription(progRes.data.reward_description || '')
      }
      setOrders(ordRes.data || [])
      setRedemptions(redRes.data || [])
      setBranches(brRes.data || [])
      setReviews(revRes.data || [])
    } finally {
      setLoading(false)
    }
  }

  const saveProgram = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('loyalty_programs').upsert({
        restaurant_id: restaurant.id,
        enabled,
        earn_rate: Number(earnRate) || 0,
        reward_threshold: parseInt(rewardThreshold) || 0,
        reward_description: rewardDescription.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'restaurant_id' })
      if (error) throw error
      toast.success('تم حفظ إعدادات الولاء ✅')
    } catch (err) {
      toast.error(err.message || 'تعذّر الحفظ')
    } finally {
      setSaving(false)
    }
  }

  // لوحة النقاط: تجميع حسب رقم الجوال
  const leaderboard = useMemo(() => {
    const map = {}
    orders.forEach(o => {
      const phone = o.customer_phone
      if (!phone) return
      if (!map[phone]) map[phone] = { phone, name:o.customer_name || null, spent:0 }
      map[phone].spent += Number(o.total) || 0
      if (!map[phone].name && o.customer_name) map[phone].name = o.customer_name
    })
    const redByPhone = {}
    redemptions.forEach(r => { redByPhone[r.customer_phone] = (redByPhone[r.customer_phone] || 0) + (r.points || 0) })
    return Object.values(map).map(c => {
      const earned = Math.floor(c.spent * (Number(earnRate) || 0))
      const redeemed = redByPhone[c.phone] || 0
      return { ...c, earned, redeemed, balance: earned - redeemed }
    }).sort((a,b) => b.balance - a.balance)
  }, [orders, redemptions, earnRate])

  const recordRedemption = async (c) => {
    const pts = parseInt(rewardThreshold) || 0
    if (c.balance < pts) { toast.error('رصيد نقاط العميل لا يكفي للمكافأة'); return }
    if (!window.confirm(`تسجيل استبدال مكافأة لـ ${c.name || c.phone}؟\nسيُخصم ${pts} نقطة (${rewardDescription})`)) return
    try {
      const { data, error } = await supabase.from('loyalty_redemptions').insert({
        restaurant_id: restaurant.id,
        customer_phone: c.phone,
        points: pts,
        note: rewardDescription.trim() || null,
      }).select().single()
      if (error) throw error
      setRedemptions(prev => [...prev, data])
      toast.success('تم تسجيل الاستبدال 🎁')
    } catch (err) {
      toast.error('تعذّر تسجيل الاستبدال')
    }
  }

  const handleSignOut = async () => { await signOut(); navigate('/login') }

  const branchName = (bid) => {
    if (!bid) return '🏠 الرئيسي'
    const b = branches.find(x => x.id === bid)
    return b ? `🏢 ${b.name}` : '🏢 —'
  }

  const filteredReviews = useMemo(() => {
    if (reviewBranch === 'all') return reviews
    if (reviewBranch === '__main__') return reviews.filter(r => !r.branch_id)
    return reviews.filter(r => r.branch_id === reviewBranch)
  }, [reviews, reviewBranch])

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s,r) => s + (r.rating||0), 0) / reviews.length).toFixed(1)
    : null

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

  const inputStyle = { width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', outline:'none', boxSizing:'border-box' }
  const labelStyle = { display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px', color:'#374151' }

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
              <div style={{ width:'32px', height:'32px', borderRadius:'8px', background: restaurant.logo_url ? 'transparent' : 'linear-gradient(135deg,#FF6B35,#FF9F6B)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', overflow:'hidden' }}>{restaurant.logo_url ? <img src={restaurant.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : '🍕'}</div>
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
            <NavItem icon="🍽️" label="الأصناف"    onClick={() => navigate('/menu', { state: { tab: 'products' } })} />
            <NavItem icon="👥" label="العملاء"    onClick={() => navigate('/customers')} />
            <NavItem icon="🎁" label="الولاء والتقييمات" active={true} onClick={() => setSidebarOpen(false)} />
            <NavItem icon="🏢" label="الفروع"     onClick={() => navigate('/branches')} />
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
          <span style={{ fontSize:'16px', fontWeight:'800' }}>🎁 الولاء والتقييمات</span>
          <div style={{ marginRight:'auto' }}>
            <button onClick={() => navigate('/dashboard')} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer', color:'#374151' }}>
              ← الرئيسية
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', padding:'0 16px', gap:'6px', flexShrink:0 }}>
          {[
            { key:'loyalty', label:'💎 النقاط والولاء' },
            { key:'reviews', label:`⭐ التقييمات${reviews.length ? ` (${reviews.length})` : ''}` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding:'12px 14px', border:'none', background:'none', cursor:'pointer',
                fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px',
                color: activeTab===t.key ? '#FF6B35' : '#9CA3AF',
                borderBottom: activeTab===t.key ? '2.5px solid #FF6B35' : '2.5px solid transparent',
              }}
            >{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>

          {/* ========== تبويب الولاء ========== */}
          {activeTab === 'loyalty' && (
            <>
              {/* إعدادات البرنامج */}
              <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', padding:'18px', marginBottom:'16px', maxWidth:'640px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
                  <div style={{ fontSize:'15px', fontWeight:'800' }}>⚙️ إعدادات البرنامج</div>
                  <label style={{ position:'relative', width:'46px', height:'26px', cursor:'pointer' }}>
                    <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ opacity:0, width:0, height:0, position:'absolute' }}/>
                    <div style={{ position:'absolute', inset:0, background: enabled ? '#10B981' : '#E5E7EB', borderRadius:'20px', transition:'0.3s' }}>
                      <div style={{ position:'absolute', width:'20px', height:'20px', background:'white', borderRadius:'50%', top:'3px', left: enabled ? '23px' : '3px', transition:'0.3s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                    </div>
                  </label>
                </div>

                <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'14px', marginBottom:'14px' }}>
                  <div>
                    <label style={labelStyle}>نقاط لكل 1 ﷼ يُنفَق</label>
                    <input type="number" min="0" step="0.1" value={earnRate} onChange={e => setEarnRate(e.target.value)} style={inputStyle} />
                    <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'5px' }}>مثال: 1 = كل ﷼ يعطي نقطة</div>
                  </div>
                  <div>
                    <label style={labelStyle}>النقاط المطلوبة للمكافأة</label>
                    <input type="number" min="1" value={rewardThreshold} onChange={e => setRewardThreshold(e.target.value)} style={inputStyle} />
                    <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'5px' }}>عند بلوغها يستحق العميل المكافأة</div>
                  </div>
                </div>

                <div style={{ marginBottom:'16px' }}>
                  <label style={labelStyle}>وصف المكافأة</label>
                  <input value={rewardDescription} onChange={e => setRewardDescription(e.target.value)} placeholder="مثال: خصم 10 ﷼ أو مشروب مجاني" style={inputStyle} />
                </div>

                <button onClick={saveProgram} disabled={saving} style={{ width:'100%', padding:'12px', borderRadius:'11px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer', opacity: saving?0.7:1 }}>
                  💾 حفظ الإعدادات
                </button>

                {!enabled && (
                  <div style={{ marginTop:'12px', fontSize:'12px', color:'#92400E', background:'#FEF3C7', borderRadius:'10px', padding:'10px 12px' }}>
                    البرنامج متوقف حالياً — لن تظهر النقاط للعملاء في المنيو حتى تفعّله.
                  </div>
                )}
              </div>

              {/* لوحة نقاط العملاء */}
              <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                <div style={{ padding:'14px 16px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>
                  🏆 نقاط العملاء ({leaderboard.length})
                </div>
                {leaderboard.length === 0 ? (
                  <div style={{ padding:'32px 16px', textAlign:'center', color:'#9CA3AF' }}>
                    <div style={{ fontSize:'36px', opacity:0.3, marginBottom:'8px' }}>🎯</div>
                    <div style={{ fontSize:'13px' }}>لا توجد نقاط بعد — تُحتسب من الطلبات المكتملة</div>
                  </div>
                ) : (
                  <div>
                    {leaderboard.map((c, i) => {
                      const ready = c.balance >= (parseInt(rewardThreshold) || Infinity)
                      return (
                        <div key={c.phone} style={{ padding:'12px 16px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:'12px' }}>
                          <div style={{ width:'26px', fontSize:'13px', fontWeight:'800', color:'#9CA3AF', flexShrink:0, textAlign:'center' }}>{i+1}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name || 'عميل'}</div>
                            <div style={{ fontSize:'11px', color:'#9CA3AF', direction:'ltr', textAlign:'right' }}>{c.phone}</div>
                          </div>
                          <div style={{ textAlign:'center', flexShrink:0 }}>
                            <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', color:'#FF6B35', lineHeight:1 }}>{c.balance}</div>
                            <div style={{ fontSize:'10px', color:'#9CA3AF' }}>نقطة</div>
                          </div>
                          {ready && (
                            <button onClick={() => recordRedemption(c)} style={{ flexShrink:0, padding:'7px 10px', borderRadius:'9px', border:'none', background:'#10B981', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'11px', cursor:'pointer' }}>
                              🎁 استبدال
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                <div style={{ padding:'10px 16px', fontSize:'11px', color:'#9CA3AF', borderTop:'1px solid #F3F4F6' }}>
                  الرصيد = النقاط المكتسبة − المستبدَلة. زر «استبدال» يظهر عند بلوغ العميل حد المكافأة.
                </div>
              </div>
            </>
          )}

          {/* ========== تبويب التقييمات ========== */}
          {activeTab === 'reviews' && (
            <>
              {/* ملخص */}
              <div style={{ display:'flex', gap:'12px', marginBottom:'16px', flexWrap:'wrap' }}>
                <div style={{ background:'white', borderRadius:'14px', border:'1px solid #E5E7EB', padding:'16px', flex:1, minWidth:'140px' }}>
                  <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'26px', color:'#F59E0B', lineHeight:1 }}>{avgRating || '—'}</div>
                  <div style={{ fontSize:'12px', color:'#9CA3AF', marginTop:'6px' }}>متوسط التقييم من 5</div>
                </div>
                <div style={{ background:'white', borderRadius:'14px', border:'1px solid #E5E7EB', padding:'16px', flex:1, minWidth:'140px' }}>
                  <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'26px', color:'#3B82F6', lineHeight:1 }}>{reviews.length}</div>
                  <div style={{ fontSize:'12px', color:'#9CA3AF', marginTop:'6px' }}>إجمالي التقييمات</div>
                </div>
              </div>

              {/* فلتر الفرع */}
              {branches.length > 0 && (
                <select value={reviewBranch} onChange={e => setReviewBranch(e.target.value)} style={{ ...inputStyle, width:'auto', marginBottom:'14px', cursor:'pointer', background:'white' }}>
                  <option value="all">🏢 كل الفروع</option>
                  <option value="__main__">🏠 الفرع الرئيسي</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}

              <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                {filteredReviews.length === 0 ? (
                  <div style={{ padding:'40px 16px', textAlign:'center', color:'#9CA3AF' }}>
                    <div style={{ fontSize:'40px', opacity:0.3, marginBottom:'10px' }}>💬</div>
                    <div style={{ fontSize:'13px' }}>لا توجد تقييمات — تظهر بعد أن يقيّم العملاء طلباتهم المكتملة</div>
                  </div>
                ) : (
                  filteredReviews.map(r => (
                    <div key={r.id} style={{ padding:'14px 16px', borderBottom:'1px solid #F3F4F6' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: r.comment ? '8px' : 0, gap:'8px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', minWidth:0, flexWrap:'wrap' }}>
                          <span style={{ fontSize:'14px', fontWeight:'800', color:'#F59E0B', whiteSpace:'nowrap' }}>{'⭐'.repeat(r.rating || 0)}</span>
                          <span style={{ fontSize:'13px', fontWeight:'700', color:'#374151' }}>{r.customer_name || 'عميل'}</span>
                          <span style={{ fontSize:'10px', color:'#9CA3AF', background:'#F3F4F6', padding:'2px 7px', borderRadius:'100px' }}>{branchName(r.branch_id)}</span>
                        </div>
                        <span style={{ fontSize:'11px', color:'#9CA3AF', flexShrink:0 }}>{new Date(r.created_at).toLocaleDateString('ar', { day:'numeric', month:'short' })}</span>
                      </div>
                      {r.comment && (
                        <div style={{ fontSize:'13px', color:'#0F1117', lineHeight:'1.7', background:'#F8F9FB', borderRadius:'10px', padding:'9px 12px' }}>{r.comment}</div>
                      )}
                      {r.customer_phone && (
                        <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'6px', direction:'ltr', textAlign:'right' }}>📱 {r.customer_phone}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  )
}
