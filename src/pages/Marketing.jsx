import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { compressAndUploadImage } from '../lib/uploadImage'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import ConfirmDialog from '../components/ConfirmDialog'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

function Spinner() {
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0F1117', color:'white', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,107,53,0.3)', borderTopColor:'#FF6B35', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      جارٍ التحميل...
    </div>
  )
}

const inputStyle = {
  width:'100%', padding:'11px 13px',
  border:'1.5px solid #E5E7EB', borderRadius:'11px',
  fontFamily:'Tajawal,sans-serif', fontSize:'14px',
  outline:'none', boxSizing:'border-box',
}
const labelStyle = { display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px', color:'#374151' }

// تحويل ISO ↔ صيغة datetime-local (بلا ثوانٍ/منطقة زمنية) لملء حقول input[type=datetime-local]
const toDatetimeLocal = (iso) => iso ? new Date(iso).toISOString().slice(0, 16) : ''
const fromDatetimeLocal = (val) => val ? new Date(val).toISOString() : null

const EMPTY_BANNER = { title:'', subtitle:'', image_url:'', cta_text:'اطلب الآن', starts_at:'', ends_at:'', is_active:true }
const EMPTY_COUPON = { code:'', discount_type:'percent', discount_value:'', min_order_amount:'', expires_at:'', is_active:true }

export default function Marketing() {
  const navigate = useNavigate()
  const { restaurant } = useAuthStore()
  const [activeTab, setActiveTab] = useState('banners')
  const [loading, setLoading] = useState(true)
  const [banners, setBanners] = useState([])
  const [coupons, setCoupons] = useState([])

  const [bannerModalOpen, setBannerModalOpen] = useState(false)
  const [couponModalOpen, setCouponModalOpen] = useState(false)
  useBodyScrollLock(bannerModalOpen || couponModalOpen)
  const [editingBanner, setEditingBanner] = useState(null)
  const [editingCoupon, setEditingCoupon] = useState(null)
  const [bannerForm, setBannerForm] = useState(EMPTY_BANNER)
  const [couponForm, setCouponForm] = useState(EMPTY_COUPON)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [confirmDeleteBanner, setConfirmDeleteBanner] = useState(null)
  const [confirmDeleteCoupon, setConfirmDeleteCoupon] = useState(null)

  useEffect(() => {
    if (!restaurant) return
    fetchAll()
  }, [restaurant])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [{ data: b }, { data: c }] = await Promise.all([
        supabase.from('banners').select('*').eq('restaurant_id', restaurant.id).order('sort_order'),
        supabase.from('coupons').select('*').eq('restaurant_id', restaurant.id).order('created_at', { ascending:false }),
      ])
      if (b) setBanners(b)
      if (c) setCoupons(c)
    } finally {
      setLoading(false)
    }
  }

  // ===== بانرات =====
  const openAddBanner = () => { setEditingBanner(null); setBannerForm(EMPTY_BANNER); setBannerModalOpen(true) }
  const openEditBanner = (banner) => {
    setEditingBanner(banner)
    setBannerForm({
      title: banner.title, subtitle: banner.subtitle || '', image_url: banner.image_url || '',
      cta_text: banner.cta_text || 'اطلب الآن',
      starts_at: toDatetimeLocal(banner.starts_at), ends_at: toDatetimeLocal(banner.ends_at),
      is_active: banner.is_active,
    })
    setBannerModalOpen(true)
  }

  const handleBannerImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const url = await compressAndUploadImage(file, restaurant.id, 'banners')
      setBannerForm(f => ({ ...f, image_url: url }))
      toast.success('تم رفع الصورة ✅')
    } catch (err) {
      toast.error(err.message || 'فشل رفع الصورة')
    } finally {
      setUploadingImage(false)
      e.target.value = ''
    }
  }

  const saveBanner = async () => {
    if (!bannerForm.title.trim()) { toast.error('أدخل عنوان البانر'); return }
    const payload = {
      title: bannerForm.title.trim(),
      subtitle: bannerForm.subtitle.trim() || null,
      image_url: bannerForm.image_url || null,
      cta_text: bannerForm.cta_text.trim() || 'اطلب الآن',
      starts_at: fromDatetimeLocal(bannerForm.starts_at),
      ends_at: fromDatetimeLocal(bannerForm.ends_at),
      is_active: bannerForm.is_active,
    }
    try {
      if (editingBanner) {
        const { error } = await supabase.from('banners').update(payload).eq('id', editingBanner.id)
        if (error) throw error
        toast.success('تم تحديث البانر ✅')
      } else {
        const { error } = await supabase.from('banners').insert({ ...payload, restaurant_id: restaurant.id, sort_order: banners.length })
        if (error) throw error
        toast.success('تم إضافة البانر 🎉')
      }
      setBannerModalOpen(false)
      fetchAll()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const deleteBanner = async (banner) => {
    const { error } = await supabase.from('banners').delete().eq('id', banner.id)
    if (error) { toast.error(error.message); return }
    toast.success('تم حذف البانر')
    fetchAll()
  }

  const toggleBannerActive = async (banner) => {
    await supabase.from('banners').update({ is_active: !banner.is_active }).eq('id', banner.id)
    fetchAll()
  }

  // ===== كوبونات =====
  const openAddCoupon = () => { setEditingCoupon(null); setCouponForm(EMPTY_COUPON); setCouponModalOpen(true) }
  const openEditCoupon = (coupon) => {
    setEditingCoupon(coupon)
    setCouponForm({
      code: coupon.code, discount_type: coupon.discount_type, discount_value: String(coupon.discount_value),
      min_order_amount: coupon.min_order_amount ? String(coupon.min_order_amount) : '',
      expires_at: coupon.expires_at ? coupon.expires_at.slice(0, 10) : '',
      is_active: coupon.is_active,
    })
    setCouponModalOpen(true)
  }

  const saveCoupon = async () => {
    const code = couponForm.code.trim().toUpperCase()
    const value = parseFloat(couponForm.discount_value)
    if (!code) { toast.error('أدخل كود الكوبون'); return }
    if (!value || value <= 0) { toast.error('أدخل قيمة خصم صحيحة'); return }
    if (couponForm.discount_type === 'percent' && value > 100) { toast.error('نسبة الخصم لا يمكن أن تتجاوز 100%'); return }
    const payload = {
      code,
      discount_type: couponForm.discount_type,
      discount_value: value,
      min_order_amount: parseFloat(couponForm.min_order_amount) || 0,
      expires_at: couponForm.expires_at ? new Date(`${couponForm.expires_at}T23:59:59`).toISOString() : null,
      is_active: couponForm.is_active,
    }
    try {
      if (editingCoupon) {
        const { error } = await supabase.from('coupons').update(payload).eq('id', editingCoupon.id)
        if (error) throw error
        toast.success('تم تحديث الكوبون ✅')
      } else {
        const { error } = await supabase.from('coupons').insert({ ...payload, restaurant_id: restaurant.id })
        if (error) throw error
        toast.success('تم إضافة الكوبون 🎉')
      }
      setCouponModalOpen(false)
      fetchAll()
    } catch (err) {
      toast.error(err.code === '23505' ? 'هذا الكود مستخدم من قبل' : err.message)
    }
  }

  const deleteCoupon = async (coupon) => {
    const { error } = await supabase.from('coupons').delete().eq('id', coupon.id)
    if (error) { toast.error(error.message); return }
    toast.success('تم حذف الكوبون')
    fetchAll()
  }

  const toggleCouponActive = async (coupon) => {
    await supabase.from('coupons').update({ is_active: !coupon.is_active }).eq('id', coupon.id)
    fetchAll()
  }

  if (loading) return <Spinner />

  const TABS = [
    { key:'banners', label:'🎬 بانرات العروض' },
    { key:'coupons', label:'🎟️ الكوبونات' },
  ]

  return (
    <AppShell
      active="marketing"
      title="📣 العروض والكوبونات"
      actions={
        <button onClick={() => navigate('/dashboard')} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer', color:'#374151' }}>← الرئيسية</button>
      }
    >
      {/* Tabs */}
      <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', padding:'0 16px', overflowX:'auto', flexShrink:0 }}>
        {TABS.map(t => (
          <div key={t.key} onClick={() => setActiveTab(t.key)} style={{ padding:'12px 14px', fontSize:'13px', fontWeight:'700', color: activeTab === t.key ? '#FF6B35' : '#6B7280', borderBottom: activeTab === t.key ? '2.5px solid #FF6B35' : '2.5px solid transparent', cursor:'pointer', whiteSpace:'nowrap', transition:'all 0.2s' }}>
            {t.label}
          </div>
        ))}
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
        <div style={{ maxWidth:'600px', margin:'0 auto' }}>

          {activeTab === 'banners' && (
            <>
              <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'12px' }}>
                <button onClick={openAddBanner} style={{ padding:'8px 16px', borderRadius:'10px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}>＋ بانر جديد</button>
              </div>
              {banners.length === 0 ? (
                <div style={{ textAlign:'center', padding:'50px 16px', color:'#9CA3AF' }}>
                  <div style={{ fontSize:'44px', opacity:0.3, marginBottom:'10px' }}>🎬</div>
                  <div style={{ fontSize:'15px', fontWeight:'700', color:'#374151', marginBottom:'6px' }}>لا توجد بانرات بعد</div>
                  <div style={{ fontSize:'13px' }}>تظهر البانرات النشطة في أعلى صفحة اختيار الفرع</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  {banners.map(banner => (
                    <div key={banner.id} style={{ background:'white', borderRadius:'14px', border:'1.5px solid #E5E7EB', padding:'14px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                        <div style={{ width:'52px', height:'40px', borderRadius:'8px', background:'#F0ECE4', flexShrink:0, overflow:'hidden' }}>
                          {banner.image_url && <img src={banner.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px' }}>{banner.title}</span>
                            {!banner.is_active && <span style={{ fontSize:'10px', fontWeight:'700', color:'#9CA3AF', background:'#F3F4F6', padding:'2px 7px', borderRadius:'100px' }}>معطّل</span>}
                          </div>
                          {banner.subtitle && <div style={{ fontSize:'12px', color:'#9CA3AF' }}>{banner.subtitle}</div>}
                          {(banner.starts_at || banner.ends_at) && (
                            <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'2px' }}>
                              ⏱ {banner.starts_at ? new Date(banner.starts_at).toLocaleDateString('ar-SA') : '—'} إلى {banner.ends_at ? new Date(banner.ends_at).toLocaleDateString('ar-SA') : '∞'}
                            </div>
                          )}
                        </div>
                        <div style={{ display:'flex', gap:'5px', flexShrink:0 }}>
                          <button onClick={() => toggleBannerActive(banner)} style={{ padding:'5px 8px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background: banner.is_active ? '#D1FAE5' : '#F3F4F6', cursor:'pointer', fontSize:'11px' }}>{banner.is_active ? '👁️' : '🚫'}</button>
                          <button onClick={() => openEditBanner(banner)} style={{ width:'30px', height:'30px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background:'white', cursor:'pointer', fontSize:'13px' }}>✏️</button>
                          <button onClick={() => setConfirmDeleteBanner(banner)} style={{ width:'30px', height:'30px', borderRadius:'8px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'13px' }}>🗑️</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'coupons' && (
            <>
              <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'12px' }}>
                <button onClick={openAddCoupon} style={{ padding:'8px 16px', borderRadius:'10px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}>＋ كوبون جديد</button>
              </div>
              {coupons.length === 0 ? (
                <div style={{ textAlign:'center', padding:'50px 16px', color:'#9CA3AF' }}>
                  <div style={{ fontSize:'44px', opacity:0.3, marginBottom:'10px' }}>🎟️</div>
                  <div style={{ fontSize:'15px', fontWeight:'700', color:'#374151', marginBottom:'6px' }}>لا توجد كوبونات بعد</div>
                  <div style={{ fontSize:'13px' }}>الكوبونات النشطة تُطبَّق فعلياً على إجمالي الطلب عند الدفع</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  {coupons.map(coupon => (
                    <div key={coupon.id} style={{ background:'white', borderRadius:'14px', border:'1.5px solid #E5E7EB', padding:'14px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                        <div style={{ width:'44px', height:'44px', borderRadius:'10px', background:'#FFF0EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'15px', fontWeight:'900', color:'#E85A24', flexShrink:0 }}>
                          {coupon.discount_type === 'percent' ? `${coupon.discount_value}%` : `${coupon.discount_value}﷼`}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', direction:'ltr' }}>{coupon.code}</span>
                            {!coupon.is_active && <span style={{ fontSize:'10px', fontWeight:'700', color:'#9CA3AF', background:'#F3F4F6', padding:'2px 7px', borderRadius:'100px' }}>معطّل</span>}
                          </div>
                          <div style={{ fontSize:'12px', color:'#9CA3AF' }}>
                            {coupon.min_order_amount > 0 && `للطلبات فوق ${coupon.min_order_amount} ﷼ · `}
                            {coupon.expires_at ? `ينتهي ${new Date(coupon.expires_at).toLocaleDateString('ar-SA')}` : 'بلا تاريخ انتهاء'}
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:'5px', flexShrink:0 }}>
                          <button onClick={() => toggleCouponActive(coupon)} style={{ padding:'5px 8px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background: coupon.is_active ? '#D1FAE5' : '#F3F4F6', cursor:'pointer', fontSize:'11px' }}>{coupon.is_active ? '👁️' : '🚫'}</button>
                          <button onClick={() => openEditCoupon(coupon)} style={{ width:'30px', height:'30px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background:'white', cursor:'pointer', fontSize:'13px' }}>✏️</button>
                          <button onClick={() => setConfirmDeleteCoupon(coupon)} style={{ width:'30px', height:'30px', borderRadius:'8px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'13px' }}>🗑️</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Banner Modal */}
      {bannerModalOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={() => setBannerModalOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)' }}/>
          <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', padding:'20px', position:'relative', maxHeight:'85vh', overflowY:'auto' }}>
            <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', marginBottom:'16px' }}>{editingBanner ? 'تعديل البانر' : 'بانر جديد'}</h3>

            <div style={{ marginBottom:'14px' }}>
              <label style={labelStyle}>العنوان *</label>
              <input style={inputStyle} value={bannerForm.title} onChange={e => setBannerForm(f=>({...f,title:e.target.value}))} placeholder="وجبة العائلة بـ 20% أقل" />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={labelStyle}>وصف مختصر (اختياري)</label>
              <input style={inputStyle} value={bannerForm.subtitle} onChange={e => setBannerForm(f=>({...f,subtitle:e.target.value}))} placeholder="بيتزا كبيرة + مقبلات + مشروبات" />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={labelStyle}>صورة البانر (اختياري)</label>
              {bannerForm.image_url && (
                <div style={{ width:'100%', height:'100px', borderRadius:'10px', overflow:'hidden', marginBottom:'8px' }}>
                  <img src={bannerForm.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                </div>
              )}
              <input type="file" accept="image/*" onChange={handleBannerImageUpload} disabled={uploadingImage} style={{ fontSize:'13px' }} />
              {uploadingImage && <div style={{ fontSize:'12px', color:'#9CA3AF', marginTop:'4px' }}>جارٍ رفع الصورة...</div>}
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={labelStyle}>نص الزر</label>
              <input style={inputStyle} value={bannerForm.cta_text} onChange={e => setBannerForm(f=>({...f,cta_text:e.target.value}))} placeholder="اطلب الآن" />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'14px' }}>
              <div>
                <label style={labelStyle}>يبدأ (اختياري)</label>
                <input type="datetime-local" style={inputStyle} value={bannerForm.starts_at} onChange={e => setBannerForm(f=>({...f,starts_at:e.target.value}))} />
              </div>
              <div>
                <label style={labelStyle}>ينتهي (اختياري)</label>
                <input type="datetime-local" style={inputStyle} value={bannerForm.ends_at} onChange={e => setBannerForm(f=>({...f,ends_at:e.target.value}))} />
              </div>
            </div>
            <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'-8px', marginBottom:'18px' }}>اتركها فارغة ليظهر البانر دائماً بلا موعد انتهاء</div>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px', padding:'12px 14px', background:'#F8F9FB', borderRadius:'11px' }}>
              <span style={{ fontSize:'13px', fontWeight:'700' }}>تفعيل البانر</span>
              <label style={{ position:'relative', width:'46px', height:'25px', cursor:'pointer', flexShrink:0 }}>
                <input type="checkbox" checked={bannerForm.is_active} onChange={e => setBannerForm(f=>({...f,is_active:e.target.checked}))} style={{ opacity:0, width:0, height:0, position:'absolute' }}/>
                <div style={{ position:'absolute', inset:0, background: bannerForm.is_active ? '#10B981' : '#E5E7EB', borderRadius:'26px', transition:'0.3s' }}>
                  <div style={{ position:'absolute', width:'19px', height:'19px', background:'white', borderRadius:'50%', top:'3px', left: bannerForm.is_active ? '24px' : '3px', transition:'0.3s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
                </div>
              </label>
            </div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setBannerModalOpen(false)} style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', color:'#374151', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer' }}>إلغاء</button>
              <button onClick={saveBanner} style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer' }}>{editingBanner ? 'حفظ التعديلات' : 'إضافة البانر'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Coupon Modal */}
      {couponModalOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={() => setCouponModalOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)' }}/>
          <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', padding:'20px', position:'relative', maxHeight:'85vh', overflowY:'auto' }}>
            <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', marginBottom:'16px' }}>{editingCoupon ? 'تعديل الكوبون' : 'كوبون جديد'}</h3>

            <div style={{ marginBottom:'14px' }}>
              <label style={labelStyle}>الكود *</label>
              <input style={{ ...inputStyle, direction:'ltr', textAlign:'left', textTransform:'uppercase' }} value={couponForm.code} onChange={e => setCouponForm(f=>({...f,code:e.target.value.toUpperCase()}))} placeholder="WELCOME15" />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'14px' }}>
              <div>
                <label style={labelStyle}>نوع الخصم</label>
                <select style={{ ...inputStyle, cursor:'pointer' }} value={couponForm.discount_type} onChange={e => setCouponForm(f=>({...f,discount_type:e.target.value}))}>
                  <option value="percent">نسبة %</option>
                  <option value="fixed">مبلغ ثابت ﷼</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>القيمة *</label>
                <input type="number" style={inputStyle} value={couponForm.discount_value} onChange={e => setCouponForm(f=>({...f,discount_value:e.target.value}))} placeholder={couponForm.discount_type === 'percent' ? '15' : '20'} />
              </div>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={labelStyle}>الحد الأدنى للطلب (اختياري)</label>
              <input type="number" style={inputStyle} value={couponForm.min_order_amount} onChange={e => setCouponForm(f=>({...f,min_order_amount:e.target.value}))} placeholder="50" />
            </div>

            <div style={{ marginBottom:'18px' }}>
              <label style={labelStyle}>تاريخ الانتهاء (اختياري)</label>
              <input type="date" style={inputStyle} value={couponForm.expires_at} onChange={e => setCouponForm(f=>({...f,expires_at:e.target.value}))} />
            </div>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px', padding:'12px 14px', background:'#F8F9FB', borderRadius:'11px' }}>
              <span style={{ fontSize:'13px', fontWeight:'700' }}>تفعيل الكوبون</span>
              <label style={{ position:'relative', width:'46px', height:'25px', cursor:'pointer', flexShrink:0 }}>
                <input type="checkbox" checked={couponForm.is_active} onChange={e => setCouponForm(f=>({...f,is_active:e.target.checked}))} style={{ opacity:0, width:0, height:0, position:'absolute' }}/>
                <div style={{ position:'absolute', inset:0, background: couponForm.is_active ? '#10B981' : '#E5E7EB', borderRadius:'26px', transition:'0.3s' }}>
                  <div style={{ position:'absolute', width:'19px', height:'19px', background:'white', borderRadius:'50%', top:'3px', left: couponForm.is_active ? '24px' : '3px', transition:'0.3s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
                </div>
              </label>
            </div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setCouponModalOpen(false)} style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', color:'#374151', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer' }}>إلغاء</button>
              <button onClick={saveCoupon} style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer' }}>{editingCoupon ? 'حفظ التعديلات' : 'إضافة الكوبون'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteBanner}
        title="حذف البانر"
        body={confirmDeleteBanner ? `حذف بانر "${confirmDeleteBanner.title}"؟` : ''}
        confirmLabel="حذف"
        onCancel={() => setConfirmDeleteBanner(null)}
        onConfirm={() => { deleteBanner(confirmDeleteBanner); setConfirmDeleteBanner(null) }}
      />
      <ConfirmDialog
        open={!!confirmDeleteCoupon}
        title="حذف الكوبون"
        body={confirmDeleteCoupon ? `حذف كوبون "${confirmDeleteCoupon.code}"؟` : ''}
        confirmLabel="حذف"
        onCancel={() => setConfirmDeleteCoupon(null)}
        onConfirm={() => { deleteCoupon(confirmDeleteCoupon); setConfirmDeleteCoupon(null) }}
      />
    </AppShell>
  )
}
