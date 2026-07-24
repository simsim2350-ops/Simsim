import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import ConfirmDialog from '../components/ConfirmDialog'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import {
  fetchLoyaltyData, saveLoyaltyProgram, fetchCustomerLedger,
  redeemReward, saveReward, toggleReward, deleteReward,
  saveTier, deleteTier, recomputeTiers,
} from '../lib/loyaltyApi'

// أنواع المكافآت — مصدر واحد للتسميات وأيّ حقل قيمة يلزم كل نوع
const REWARD_TYPES = [
  { key:'free_product',     label:'🍔 منتج مجاني',      valueLabel:null },
  { key:'fixed_discount',   label:'💵 خصم ثابت',        valueLabel:'قيمة الخصم (﷼)' },
  { key:'percent_discount', label:'٪ خصم نسبة',         valueLabel:'نسبة الخصم (٪)' },
  { key:'free_delivery',    label:'🚚 توصيل مجاني',      valueLabel:null },
  { key:'coupon',           label:'🎟️ قسيمة',           valueLabel:'قيمة القسيمة (﷼)' },
  { key:'gift',             label:'🎁 هدية',            valueLabel:null },
]
const rewardTypeLabel = (t) => (REWARD_TYPES.find(x => x.key === t)?.label || t)

function Spinner() {
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0F1117', color:'white', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,107,53,0.3)', borderTopColor:'#FF6B35', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      جارٍ التحميل...
    </div>
  )
}

export default function Loyalty() {
  const navigate = useNavigate()
  const { restaurant } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('loyalty')
  const { isMobile } = useBreakpoint()

  // إعدادات برنامج الولاء
  const [enabled, setEnabled] = useState(false)
  const [earnRate, setEarnRate] = useState(1)
  const [rewardThreshold, setRewardThreshold] = useState(100)
  const [rewardDescription, setRewardDescription] = useState('خصم 10 ﷼ على طلبك القادم')
  const [saving, setSaving] = useState(false)

  // بيانات (من الدفتر)
  const [accounts, setAccounts] = useState([])   // حسابات الولاء (لوحة الصدارة)
  const [rewards, setRewards] = useState([])      // كتالوج المكافآت
  const [tiers, setTiers] = useState([])          // مستويات العضوية
  const [branches, setBranches] = useState([])
  const [reviews, setReviews] = useState([])
  const [reviewBranch, setReviewBranch] = useState('all')

  // ورقة العميل (كشف حساب + استبدال)
  const [detailCustomer, setDetailCustomer] = useState(null)
  const [ledger, setLedger] = useState({ loading:false, tx:[] })
  const [confirmRedeem, setConfirmRedeem] = useState(null) // { reward }

  // نموذج المكافأة
  const [rewardForm, setRewardForm] = useState(null)       // null | {..reward}
  const [confirmDeleteReward, setConfirmDeleteReward] = useState(null)

  // نموذج المستوى
  const [tierForm, setTierForm] = useState(null)           // null | {..tier}
  const [confirmDeleteTier, setConfirmDeleteTier] = useState(null)

  useBodyScrollLock(!!detailCustomer)
  useBodyScrollLock(!!rewardForm)
  useBodyScrollLock(!!tierForm)

  useEffect(() => {
    if (!restaurant) { setLoading(false); return }
    fetchAll()
  }, [restaurant])

  const fetchAll = async () => {
    try {
      const { program, accounts, rewards, tiers, reviews, branches } = await fetchLoyaltyData(restaurant.id)
      if (program) {
        setEnabled(program.enabled)
        setEarnRate(Number(program.earn_rate) || 1)
        setRewardThreshold(program.reward_threshold ?? 100)
        setRewardDescription(program.reward_description || '')
      }
      setAccounts(accounts)
      setRewards(rewards)
      setTiers(tiers)
      setReviews(reviews)
      setBranches(branches)
    } finally {
      setLoading(false)
    }
  }

  // خريطة المستوى بالمعرّف (للشارات)
  const tierById = useMemo(() => {
    const m = {}
    tiers.forEach(t => { m[t.id] = t })
    return m
  }, [tiers])

  const TierBadge = ({ tierId, small }) => {
    const t = tierById[tierId]
    if (!t) return null
    return (
      <span style={{ display:'inline-flex', alignItems:'center', gap:'3px', padding: small ? '1px 6px' : '2px 8px', borderRadius:'100px', background:(t.color||'#9CA3AF')+'22', color:t.color||'#6B7280', fontSize: small ? '10px' : '11px', fontWeight:'800', whiteSpace:'nowrap' }}>
        {t.icon && <span>{t.icon}</span>}{t.name}
      </span>
    )
  }

  // ── حفظ مستوى ──
  const submitTier = async () => {
    const f = tierForm
    if (!f.name?.trim()) { toast.error('اكتب اسم المستوى'); return }
    if (parseInt(f.min_points) < 0 || isNaN(parseInt(f.min_points))) { toast.error('حدّد عتبة نقاط صحيحة'); return }
    if (!(Number(f.earn_multiplier) > 0)) { toast.error('المضاعف يجب أن يكون أكبر من صفر'); return }
    try {
      await saveTier(restaurant.id, f)
      await recomputeTiers(restaurant.id)
      toast.success(f.id ? 'تم تعديل المستوى ✅' : 'تمت إضافة المستوى ✅')
      setTierForm(null)
      await fetchAll()
    } catch (err) {
      toast.error(err.message || 'تعذّر الحفظ')
    }
  }

  const onDeleteTier = async (t) => {
    try {
      await deleteTier(t.id)
      await recomputeTiers(restaurant.id)
      toast.success('تم حذف المستوى')
      await fetchAll()
    } catch { toast.error('تعذّر الحذف') }
  }

  // عدد العملاء في كل مستوى (للعرض)
  const tierCounts = useMemo(() => {
    const m = {}
    accounts.forEach(a => { if (a.tier_id) m[a.tier_id] = (m[a.tier_id] || 0) + 1 })
    return m
  }, [accounts])

  const saveProgram = async () => {
    setSaving(true)
    try {
      await saveLoyaltyProgram(restaurant.id, { enabled, earnRate, rewardThreshold, rewardDescription })
      toast.success('تم حفظ إعدادات الولاء ✅')
    } catch (err) {
      toast.error(err.message || 'تعذّر الحفظ')
    } finally {
      setSaving(false)
    }
  }

  // ── فتح ورقة عميل: تحميل كشف الحساب كسولاً ──
  const openCustomer = async (acc) => {
    setDetailCustomer(acc)
    setLedger({ loading:true, tx:[] })
    try {
      const tx = await fetchCustomerLedger(restaurant.id, acc.customer_phone)
      setLedger({ loading:false, tx })
    } catch {
      setLedger({ loading:false, tx:[] })
    }
  }

  const activeRewards = useMemo(() => rewards.filter(r => r.is_active), [rewards])

  // ── تنفيذ الاستبدال ──
  const doRedeem = async (reward) => {
    try {
      await redeemReward({ restaurantId: restaurant.id, rewardId: reward.id, phone: detailCustomer.customer_phone })
      toast.success('تم تسجيل الاستبدال 🎁')
      await fetchAll()
      // تحديث الرصيد المعروض + كشف الحساب للعميل المفتوح
      const fresh = await fetchLoyaltyData(restaurant.id)
      const acc = fresh.accounts.find(a => a.customer_phone === detailCustomer.customer_phone)
      if (acc) setDetailCustomer(acc)
      const tx = await fetchCustomerLedger(restaurant.id, detailCustomer.customer_phone)
      setLedger({ loading:false, tx })
    } catch (err) {
      const map = {
        insufficient_points: 'رصيد العميل لا يكفي لهذه المكافأة',
        reward_inactive: 'المكافأة غير مفعّلة',
        reward_not_found: 'المكافأة غير موجودة',
        access_denied: 'لا تملك صلاحية هذا الإجراء',
      }
      toast.error(map[err.message] || 'تعذّر تسجيل الاستبدال')
    }
  }

  // ── حفظ مكافأة ──
  const submitReward = async () => {
    const f = rewardForm
    if (!f.name?.trim()) { toast.error('اكتب اسم المكافأة'); return }
    if (!(parseInt(f.points_cost) > 0)) { toast.error('حدّد تكلفة نقاط أكبر من صفر'); return }
    try {
      await saveReward(restaurant.id, f)
      toast.success(f.id ? 'تم تعديل المكافأة ✅' : 'تمت إضافة المكافأة ✅')
      setRewardForm(null)
      await fetchAll()
    } catch (err) {
      toast.error(err.message || 'تعذّر الحفظ')
    }
  }

  const onToggleReward = async (r) => {
    try {
      await toggleReward(r.id, !r.is_active)
      setRewards(prev => prev.map(x => x.id === r.id ? { ...x, is_active: !r.is_active } : x))
    } catch { toast.error('تعذّر التحديث') }
  }

  const onDeleteReward = async (r) => {
    try {
      await deleteReward(r.id)
      toast.success('تم حذف المكافأة')
      setRewards(prev => prev.filter(x => x.id !== r.id))
    } catch { toast.error('تعذّر الحذف') }
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
        <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', padding:'0 16px', gap:'6px', flexShrink:0, overflowX:'auto' }}>
          {[
            { key:'loyalty', label:'💎 النقاط والولاء' },
            { key:'rewards', label:`🎁 المكافآت${rewards.length ? ` (${rewards.length})` : ''}` },
            { key:'tiers', label:`🏅 المستويات${tiers.length ? ` (${tiers.length})` : ''}` },
            { key:'reviews', label:`⭐ التقييمات${reviews.length ? ` (${reviews.length})` : ''}` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding:'12px 14px', border:'none', background:'none', cursor:'pointer',
                fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', whiteSpace:'nowrap',
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
              {/* إعدادات البرنامج (بلا تغيير) */}
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
                    <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'5px' }}>على صافي قيمة الأصناف (بلا توصيل/ضريبة)</div>
                  </div>
                  <div>
                    <label style={labelStyle}>النقاط المطلوبة للمكافأة</label>
                    <input type="number" min="1" value={rewardThreshold} onChange={e => setRewardThreshold(e.target.value)} style={inputStyle} />
                    <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'5px' }}>تظهر للزبون في المنيو كهدف تقدّم</div>
                  </div>
                </div>

                <div style={{ marginBottom:'16px' }}>
                  <label style={labelStyle}>وصف المكافأة (يظهر للزبون في المنيو)</label>
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

              {/* لوحة نقاط العملاء (من الدفتر) */}
              <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                <div style={{ padding:'14px 16px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>
                  🏆 نقاط العملاء ({accounts.length})
                </div>
                {accounts.length === 0 ? (
                  <div style={{ padding:'32px 16px', textAlign:'center', color:'#9CA3AF' }}>
                    <div style={{ fontSize:'36px', opacity:0.3, marginBottom:'8px' }}>🎯</div>
                    <div style={{ fontSize:'13px' }}>لا توجد نقاط بعد — تُحتسب من الطلبات المكتملة</div>
                  </div>
                ) : (
                  <div>
                    {accounts.map((c, i) => (
                      <div key={c.customer_phone} onClick={() => openCustomer(c)} style={{ padding:'12px 16px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:'12px', cursor:'pointer' }}>
                        <div style={{ width:'26px', fontSize:'13px', fontWeight:'800', color:'#9CA3AF', flexShrink:0, textAlign:'center' }}>{i+1}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
                            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.customer_name || 'عميل'}</span>
                            <TierBadge tierId={c.tier_id} small />
                          </div>
                          <div style={{ fontSize:'11px', color:'#9CA3AF', direction:'ltr', textAlign:'right' }}>{c.customer_phone}</div>
                        </div>
                        <div style={{ textAlign:'center', flexShrink:0 }}>
                          <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', color:'#FF6B35', lineHeight:1 }}>{c.current_balance}</div>
                          <div style={{ fontSize:'10px', color:'#9CA3AF' }}>نقطة</div>
                        </div>
                        <span style={{ fontSize:'16px', color:'#D1D5DB', flexShrink:0 }}>‹</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ padding:'10px 16px', fontSize:'11px', color:'#9CA3AF', borderTop:'1px solid #F3F4F6' }}>
                  اضغط عميلاً لعرض كشف حساب نقاطه واستبدال مكافأة.
                </div>
              </div>
            </>
          )}

          {/* ========== تبويب المكافآت ========== */}
          {activeTab === 'rewards' && (
            <div style={{ maxWidth:'640px' }}>
              <button onClick={() => setRewardForm({ type:'gift', is_active:true, points_cost:'', name:'', value:'' })} style={{ width:'100%', padding:'12px', borderRadius:'11px', border:'1.5px dashed #FF6B35', background:'#FFF7ED', color:'#C2410C', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer', marginBottom:'14px' }}>
                ➕ مكافأة جديدة
              </button>

              {rewards.length === 0 ? (
                <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', padding:'40px 16px', textAlign:'center', color:'#9CA3AF' }}>
                  <div style={{ fontSize:'40px', opacity:0.3, marginBottom:'10px' }}>🎁</div>
                  <div style={{ fontSize:'13px' }}>لا توجد مكافآت — أضف أول مكافأة يستبدلها العملاء بنقاطهم</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  {rewards.map(r => (
                    <div key={r.id} style={{ background:'white', borderRadius:'14px', border:'1.5px solid #E5E7EB', padding:'14px 16px', opacity: r.is_active ? 1 : 0.6 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', marginBottom:'3px' }}>{r.name}</div>
                          <div style={{ fontSize:'11.5px', color:'#9CA3AF', display:'flex', gap:'8px', flexWrap:'wrap' }}>
                            <span>{rewardTypeLabel(r.type)}</span>
                            {r.value != null && <span>· {Number(r.value)}</span>}
                            {!r.is_active && <span style={{ color:'#EF4444', fontWeight:'700' }}>· معطّلة</span>}
                          </div>
                        </div>
                        <div style={{ textAlign:'center', flexShrink:0 }}>
                          <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', color:'#FF6B35', lineHeight:1 }}>{r.points_cost}</div>
                          <div style={{ fontSize:'10px', color:'#9CA3AF' }}>نقطة</div>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:'6px', marginTop:'12px', flexWrap:'wrap' }}>
                        <button onClick={() => setRewardForm({ ...r, points_cost:String(r.points_cost), value:r.value==null?'':String(r.value) })} style={{ background:'#F3F4F6', color:'#374151', border:'none', borderRadius:'8px', padding:'6px 12px', fontSize:'11.5px', fontWeight:'700', cursor:'pointer' }}>✏️ تعديل</button>
                        <button onClick={() => onToggleReward(r)} style={{ background: r.is_active ? '#FEF3C7' : '#DCFCE7', color: r.is_active ? '#92400E' : '#166534', border:'none', borderRadius:'8px', padding:'6px 12px', fontSize:'11.5px', fontWeight:'700', cursor:'pointer' }}>{r.is_active ? '⏸️ تعطيل' : '▶️ تفعيل'}</button>
                        <button onClick={() => setConfirmDeleteReward(r)} style={{ background:'#FEE2E2', color:'#991B1B', border:'none', borderRadius:'8px', padding:'6px 12px', fontSize:'11.5px', fontWeight:'700', cursor:'pointer' }}>🗑️ حذف</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========== تبويب المستويات ========== */}
          {activeTab === 'tiers' && (
            <div style={{ maxWidth:'640px' }}>
              <div style={{ fontSize:'12px', color:'#6B7280', background:'#F8F9FB', borderRadius:'10px', padding:'10px 12px', marginBottom:'14px' }}>
                يترقّى العميل تلقائياً حسب <b>إجمالي نقاطه المكتسبة</b>. مضاعف الكسب يمنح نقاطاً أكثر لأصحاب المستويات الأعلى (×1 = بلا مضاعفة).
              </div>

              <button onClick={() => setTierForm({ name:'', min_points:'', earn_multiplier:'1', color:'#9CA3AF', icon:'🏅', sort_order: tiers.length + 1 })} style={{ width:'100%', padding:'12px', borderRadius:'11px', border:'1.5px dashed #FF6B35', background:'#FFF7ED', color:'#C2410C', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer', marginBottom:'14px' }}>
                ➕ مستوى جديد
              </button>

              {tiers.length === 0 ? (
                <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', padding:'40px 16px', textAlign:'center', color:'#9CA3AF' }}>
                  <div style={{ fontSize:'40px', opacity:0.3, marginBottom:'10px' }}>🏅</div>
                  <div style={{ fontSize:'13px' }}>لا توجد مستويات — أضف أول مستوى</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  {tiers.map(t => (
                    <div key={t.id} style={{ background:'white', borderRadius:'14px', border:'1.5px solid #E5E7EB', borderRight:`4px solid ${t.color||'#E5E7EB'}`, padding:'14px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                        <div style={{ fontSize:'22px', flexShrink:0 }}>{t.icon || '🏅'}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px' }}>{t.name}</div>
                          <div style={{ fontSize:'11.5px', color:'#9CA3AF', display:'flex', gap:'10px', flexWrap:'wrap' }}>
                            <span>من {t.min_points} نقطة</span>
                            <span>كسب ×{Number(t.earn_multiplier)}</span>
                            <span>{tierCounts[t.id] || 0} عميل</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:'6px', marginTop:'12px', flexWrap:'wrap' }}>
                        <button onClick={() => setTierForm({ ...t, min_points:String(t.min_points), earn_multiplier:String(t.earn_multiplier) })} style={{ background:'#F3F4F6', color:'#374151', border:'none', borderRadius:'8px', padding:'6px 12px', fontSize:'11.5px', fontWeight:'700', cursor:'pointer' }}>✏️ تعديل</button>
                        <button onClick={() => setConfirmDeleteTier(t)} style={{ background:'#FEE2E2', color:'#991B1B', border:'none', borderRadius:'8px', padding:'6px 12px', fontSize:'11.5px', fontWeight:'700', cursor:'pointer' }}>🗑️ حذف</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========== تبويب التقييمات (بلا تغيير) ========== */}
          {activeTab === 'reviews' && (
            <>
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

      {/* ورقة العميل: كشف حساب + استبدال */}
      {detailCustomer && (
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={() => setDetailCustomer(null)}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', animation:'fadeIn 0.2s ease' }}/>
          <div onClick={e => e.stopPropagation()} style={{ position:'relative', background:'white', width:'100%', maxWidth:'480px', borderRadius:'24px 24px 0 0', padding:'12px 0 0', maxHeight:'86vh', display:'flex', flexDirection:'column', animation:'slideUp 0.25s ease' }}>
            <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'100px', margin:'0 auto 12px', flexShrink:0 }}/>

            <div style={{ padding:'0 18px 14px', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
                    <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px' }}>{detailCustomer.customer_name || 'عميل'}</span>
                    <TierBadge tierId={detailCustomer.tier_id} />
                  </div>
                  <div style={{ fontSize:'12px', color:'#9CA3AF', direction:'ltr', textAlign:'right' }}>{detailCustomer.customer_phone}</div>
                </div>
                <button onClick={() => setDetailCustomer(null)} style={{ background:'none', border:'none', fontSize:'20px', color:'#9CA3AF', cursor:'pointer', flexShrink:0 }}>✕</button>
              </div>
              <div style={{ marginTop:'12px', background:'linear-gradient(120deg,#FF6B3516,#FF6B3508)', border:'1px solid #FF6B3530', borderRadius:'14px', padding:'14px 16px' }}>
                <div style={{ fontSize:'12px', color:'#9CA3AF', fontWeight:'700', marginBottom:'2px' }}>الرصيد الحالي</div>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'28px', color:'#FF6B35', lineHeight:1 }}>{detailCustomer.current_balance} <span style={{ fontSize:'13px', fontWeight:'700' }}>نقطة</span></div>
                <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'6px' }}>مكتسبة: {detailCustomer.lifetime_earned} · مستبدَلة: {detailCustomer.lifetime_redeemed}</div>
              </div>
            </div>

            <div style={{ overflowY:'auto', padding:'4px 18px 24px', flex:1 }}>
              {/* المكافآت المتاحة */}
              <div style={{ fontSize:'13px', fontWeight:'800', margin:'6px 0 10px' }}>🎁 المكافآت</div>
              {activeRewards.length === 0 ? (
                <div style={{ fontSize:'12px', color:'#9CA3AF', background:'#F8F9FB', borderRadius:'10px', padding:'12px', marginBottom:'18px' }}>
                  لا توجد مكافآت مفعّلة. أضِفها من تبويب «المكافآت».
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'18px' }}>
                  {activeRewards.map(r => {
                    const canRedeem = detailCustomer.current_balance >= r.points_cost
                    return (
                      <div key={r.id} style={{ display:'flex', alignItems:'center', gap:'10px', border:'1px solid #E5E7EB', borderRadius:'12px', padding:'10px 12px' }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:'13px', fontWeight:'700' }}>{r.name}</div>
                          <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{rewardTypeLabel(r.type)} · {r.points_cost} نقطة</div>
                        </div>
                        {canRedeem ? (
                          <button onClick={() => setConfirmRedeem({ reward:r })} style={{ flexShrink:0, padding:'8px 12px', borderRadius:'9px', border:'none', background:'#10B981', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>استبدال</button>
                        ) : (
                          <span style={{ flexShrink:0, fontSize:'11px', color:'#9CA3AF', fontWeight:'700' }}>باقي {r.points_cost - detailCustomer.current_balance}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* كشف حساب النقاط */}
              <div style={{ fontSize:'13px', fontWeight:'800', margin:'6px 0 10px' }}>📒 كشف حساب النقاط</div>
              {ledger.loading ? (
                <div style={{ textAlign:'center', padding:'20px', color:'#9CA3AF', fontSize:'13px' }}>جارٍ التحميل...</div>
              ) : ledger.tx.length === 0 ? (
                <div style={{ fontSize:'12px', color:'#9CA3AF', background:'#F8F9FB', borderRadius:'10px', padding:'12px' }}>لا توجد حركات بعد.</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                  {ledger.tx.map(t => {
                    const pos = t.points > 0
                    return (
                      <div key={t.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', padding:'10px 12px', background:'#F8F9FB', borderRadius:'10px' }}>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:'12.5px', fontWeight:'600', color:'#0F1117' }}>{t.reason || t.type}</div>
                          <div style={{ fontSize:'10.5px', color:'#9CA3AF' }}>{new Date(t.created_at).toLocaleDateString('ar', { day:'numeric', month:'short' })} · رصيد: {t.balance_after}</div>
                        </div>
                        <div style={{ flexShrink:0, fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', color: pos ? '#10B981' : '#EF4444' }}>{pos ? '+' : ''}{t.points}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* نموذج المكافأة */}
      {rewardForm && (() => {
        const typeMeta = REWARD_TYPES.find(x => x.key === rewardForm.type) || REWARD_TYPES[0]
        return (
          <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={() => setRewardForm(null)}>
            <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', animation:'fadeIn 0.2s ease' }}/>
            <div onClick={e => e.stopPropagation()} style={{ position:'relative', background:'white', width:'100%', maxWidth:'480px', borderRadius:'24px 24px 0 0', padding:'12px 18px 24px', maxHeight:'86vh', overflowY:'auto', animation:'slideUp 0.25s ease' }}>
              <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'100px', margin:'0 auto 14px' }}/>
              <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', margin:'0 0 16px', textAlign:'center' }}>{rewardForm.id ? 'تعديل مكافأة' : 'مكافأة جديدة'}</h3>

              <label style={labelStyle}>اسم المكافأة</label>
              <input value={rewardForm.name} onChange={e => setRewardForm({ ...rewardForm, name:e.target.value })} placeholder="مثال: مشروب مجاني" style={{ ...inputStyle, marginBottom:'14px' }} />

              <label style={labelStyle}>النوع</label>
              <select value={rewardForm.type} onChange={e => setRewardForm({ ...rewardForm, type:e.target.value })} style={{ ...inputStyle, marginBottom:'14px', cursor:'pointer', background:'white' }}>
                {REWARD_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>

              <label style={labelStyle}>تكلفة النقاط</label>
              <input type="number" min="1" value={rewardForm.points_cost} onChange={e => setRewardForm({ ...rewardForm, points_cost:e.target.value })} placeholder="مثال: 100" style={{ ...inputStyle, marginBottom:'14px' }} />

              {typeMeta.valueLabel && (
                <>
                  <label style={labelStyle}>{typeMeta.valueLabel}</label>
                  <input type="number" min="0" value={rewardForm.value} onChange={e => setRewardForm({ ...rewardForm, value:e.target.value })} style={{ ...inputStyle, marginBottom:'14px' }} />
                </>
              )}

              <label style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', fontWeight:'700', color:'#374151', marginBottom:'18px', cursor:'pointer' }}>
                <input type="checkbox" checked={rewardForm.is_active !== false} onChange={e => setRewardForm({ ...rewardForm, is_active:e.target.checked })} />
                مفعّلة (متاحة للاستبدال)
              </label>

              <button onClick={submitReward} style={{ width:'100%', padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer' }}>
                💾 حفظ
              </button>
            </div>
          </div>
        )
      })()}

      {/* نموذج المستوى */}
      {tierForm && (
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={() => setTierForm(null)}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', animation:'fadeIn 0.2s ease' }}/>
          <div onClick={e => e.stopPropagation()} style={{ position:'relative', background:'white', width:'100%', maxWidth:'480px', borderRadius:'24px 24px 0 0', padding:'12px 18px 24px', maxHeight:'86vh', overflowY:'auto', animation:'slideUp 0.25s ease' }}>
            <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'100px', margin:'0 auto 14px' }}/>
            <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', margin:'0 0 16px', textAlign:'center' }}>{tierForm.id ? 'تعديل مستوى' : 'مستوى جديد'}</h3>

            <label style={labelStyle}>اسم المستوى</label>
            <input value={tierForm.name} onChange={e => setTierForm({ ...tierForm, name:e.target.value })} placeholder="مثال: ذهبي" style={{ ...inputStyle, marginBottom:'14px' }} />

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'14px' }}>
              <div>
                <label style={labelStyle}>العتبة (نقاط مكتسبة)</label>
                <input type="number" min="0" value={tierForm.min_points} onChange={e => setTierForm({ ...tierForm, min_points:e.target.value })} placeholder="0" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>مضاعف الكسب</label>
                <input type="number" min="0" step="0.1" value={tierForm.earn_multiplier} onChange={e => setTierForm({ ...tierForm, earn_multiplier:e.target.value })} placeholder="1" style={inputStyle} />
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'18px' }}>
              <div>
                <label style={labelStyle}>الأيقونة (إيموجي)</label>
                <input value={tierForm.icon || ''} onChange={e => setTierForm({ ...tierForm, icon:e.target.value })} placeholder="🥇" style={{ ...inputStyle, textAlign:'center' }} />
              </div>
              <div>
                <label style={labelStyle}>اللون</label>
                <input type="color" value={tierForm.color || '#9CA3AF'} onChange={e => setTierForm({ ...tierForm, color:e.target.value })} style={{ ...inputStyle, height:'44px', padding:'4px', cursor:'pointer' }} />
              </div>
            </div>

            <button onClick={submitTier} style={{ width:'100%', padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer' }}>
              💾 حفظ
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmRedeem}
        icon="🎁"
        danger={false}
        title="تأكيد الاستبدال"
        body={confirmRedeem ? `استبدال «${confirmRedeem.reward.name}» مقابل ${confirmRedeem.reward.points_cost} نقطة من رصيد ${detailCustomer?.customer_name || detailCustomer?.customer_phone}؟` : ''}
        confirmLabel="تأكيد الاستبدال"
        onCancel={() => setConfirmRedeem(null)}
        onConfirm={() => { const r = confirmRedeem.reward; setConfirmRedeem(null); doRedeem(r) }}
      />

      <ConfirmDialog
        open={!!confirmDeleteReward}
        icon="🗑️"
        danger={true}
        title="حذف المكافأة"
        body={confirmDeleteReward ? `حذف «${confirmDeleteReward.name}»؟ لن تظهر للاستبدال بعد الآن.` : ''}
        confirmLabel="حذف"
        onCancel={() => setConfirmDeleteReward(null)}
        onConfirm={() => { const r = confirmDeleteReward; setConfirmDeleteReward(null); onDeleteReward(r) }}
      />

      <ConfirmDialog
        open={!!confirmDeleteTier}
        icon="🗑️"
        danger={true}
        title="حذف المستوى"
        body={confirmDeleteTier ? `حذف مستوى «${confirmDeleteTier.name}»؟ سيُعاد تصنيف العملاء تلقائياً.` : ''}
        confirmLabel="حذف"
        onCancel={() => setConfirmDeleteTier(null)}
        onConfirm={() => { const t = confirmDeleteTier; setConfirmDeleteTier(null); onDeleteTier(t) }}
      />
    </AppShell>
  )
}
