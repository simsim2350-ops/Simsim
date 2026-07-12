import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import ConfirmDialog from '../components/ConfirmDialog'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { fetchBranches } from '../lib/branchesApi'

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
  const { user, restaurant } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('loyalty')
  const { isMobile } = useBreakpoint()

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
  const [confirmRedeem, setConfirmRedeem] = useState(null)

  useEffect(() => {
    if (!restaurant) { setLoading(false); return }
    fetchAll()
  }, [restaurant])

  const fetchAll = async () => {
    try {
      const [progRes, ordRes, redRes, revRes, br] = await Promise.all([
        supabase.from('loyalty_programs').select('*').eq('restaurant_id', restaurant.id).maybeSingle(),
        supabase.from('orders').select('customer_phone, customer_name, total, status').eq('restaurant_id', restaurant.id).eq('status', 'completed'),
        supabase.from('loyalty_redemptions').select('*').eq('restaurant_id', restaurant.id),
        supabase.from('reviews').select('*').eq('restaurant_id', restaurant.id).order('created_at', { ascending:false }).limit(50),
        fetchBranches(restaurant.id),
      ])
      if (progRes.data) {
        setEnabled(progRes.data.enabled)
        setEarnRate(Number(progRes.data.earn_rate) || 1)
        setRewardThreshold(progRes.data.reward_threshold ?? 100)
        setRewardDescription(progRes.data.reward_description || '')
      }
      setOrders(ordRes.data || [])
      setRedemptions(redRes.data || [])
      setReviews(revRes.data || [])
      setBranches(br || [])
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

  const openRedeemConfirm = (c) => {
    const pts = parseInt(rewardThreshold) || 0
    if (c.balance < pts) { toast.error('رصيد نقاط العميل لا يكفي للمكافأة'); return }
    setConfirmRedeem(c)
  }

  const recordRedemption = async (c) => {
    const pts = parseInt(rewardThreshold) || 0
    if (c.balance < pts) { toast.error('رصيد نقاط العميل لا يكفي للمكافأة'); return }
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

  const branchName = (bid) => {
    const b = branches.find(x => x.id === bid)
    return b ? `${b.is_primary ? '🏠' : '🏢'} ${b.name}` : '🏢 —'
  }

  const filteredReviews = useMemo(() => {
    if (reviewBranch === 'all') return reviews
    return reviews.filter(r => r.branch_id === reviewBranch)
  }, [reviews, reviewBranch])

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s,r) => s + (r.rating||0), 0) / reviews.length).toFixed(1)
    : null

  const inputStyle = { width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', outline:'none', boxSizing:'border-box' }
  const labelStyle = { display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px', color:'#374151' }

  if (loading) return <Spinner />

  return (
    <AppShell
      active="loyalty"
      title="🎁 الولاء والتقييمات"
      actions={<button onClick={() => navigate('/dashboard')} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer', color:'#374151' }}>← الرئيسية</button>}
    >
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
                            <button onClick={() => openRedeemConfirm(c)} style={{ flexShrink:0, padding:'7px 10px', borderRadius:'9px', border:'none', background:'#10B981', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'11px', cursor:'pointer' }}>
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
                  {branches.map(b => <option key={b.id} value={b.id}>{b.is_primary ? '🏠' : '🏢'} {b.name}</option>)}
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
                          {r.branch_id && <span style={{ fontSize:'10px', color:'#9CA3AF', background:'#F3F4F6', padding:'2px 7px', borderRadius:'100px' }}>{branchName(r.branch_id)}</span>}
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

      <ConfirmDialog
        open={!!confirmRedeem}
        icon="🎁"
        danger={false}
        title="تسجيل استبدال مكافأة"
        body={confirmRedeem ? `تسجيل استبدال مكافأة لـ ${confirmRedeem.name || confirmRedeem.phone}؟ سيُخصم ${parseInt(rewardThreshold) || 0} نقطة (${rewardDescription})` : ''}
        confirmLabel="تأكيد الاستبدال"
        onCancel={() => setConfirmRedeem(null)}
        onConfirm={() => { recordRedemption(confirmRedeem); setConfirmRedeem(null) }}
      />
    </AppShell>
  )
}
