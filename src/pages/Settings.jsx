import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { compressAndUploadImage } from '../lib/uploadImage'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import { useBreakpoint } from '../hooks/useBreakpoint'

const BRAND_COLORS = ['#FF6B35','#E85A24','#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B','#0F1117']
const CURRENCIES = ['SAR - ريال سعودي','AED - درهم إماراتي','KWD - دينار كويتي','BHD - دينار بحريني','QAR - ريال قطري','OMR - ريال عماني','EGP - جنيه مصري']
const COMMON_ALLERGENS = [
  { icon:'🐟', label:'الأسماك ومنتجاتها' },
  { icon:'🥚', label:'البيض ومنتجاته' },
  { icon:'🥜', label:'الفول السوداني ومنتجاته' },
  { icon:'🌾', label:'الغلوتين (القمح والشعير)' },
  { icon:'🥛', label:'الحليب ومنتجاته' },
  { icon:'🦐', label:'القشريات (الجمبري، الكابوريا)' },
  { icon:'🌰', label:'المكسرات (لوز، جوز، فستق)' },
  { icon:'🫘', label:'الصويا ومنتجاتها' },
  { icon:'🌻', label:'بذور السمسم ومنتجاتها' },
  { icon:'🦪', label:'الرخويات (المحار، الحبار)' },
  { icon:'🍷', label:'الكبريتيت (في بعض المشروبات والمخللات)' },
  { icon:'🌿', label:'الخردل ومنتجاته' },
  { icon:'🥬', label:'الكرفس ومنتجاته' },
  { icon:'🌱', label:'الترمس (اللوبيا) ومنتجاته' },
]

export default function Settings() {
  const navigate = useNavigate()
  const { user, restaurant, fetchRestaurant } = useAuthStore()
  const [activeTab, setActiveTab] = useState('restaurant')
  const [loading, setLoading] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const { isMobile } = useBreakpoint()
  // Restaurant form
  const [restForm, setRestForm] = useState({
    name: '', slug: '', description: '',
    phone: '', whatsapp_message: '', address: '', currency: 'SAR - ريال سعودي',
    delivery_enabled: false, delivery_fee: '',
    social_links: { instagram:'', whatsapp_social:'', snapchat:'', twitter:'', tiktok:'' },
    allergens: [],
    menu_layout: 'list',
    logo_url: '',
    cover_url: '',
    brand_color: '#FF6B35', type: 'restaurant',
  })

  // Profile form
  const [profileForm, setProfileForm] = useState({
    full_name: '', phone: '',
  })

  // Password form
  const [passForm, setPassForm] = useState({
    current: '', newPass: '', confirm: '',
  })

  // Working hours
  const [hours, setHours] = useState([
    { day:'الأحد',    open:true,  from:'09:00', to:'23:00' },
    { day:'الاثنين',  open:true,  from:'09:00', to:'23:00' },
    { day:'الثلاثاء', open:true,  from:'09:00', to:'23:00' },
    { day:'الأربعاء', open:true,  from:'09:00', to:'23:00' },
    { day:'الخميس',  open:true,  from:'09:00', to:'23:00' },
    { day:'الجمعة',  open:true,  from:'12:00', to:'24:00' },
    { day:'السبت',   open:false, from:'09:00', to:'23:00' },
  ])
  const [branches, setBranches] = useState([])
  const [hoursTarget, setHoursTarget] = useState('__main__') // '__main__' أو معرّف فرع

  useEffect(() => {
    if (restaurant) {
      setRestForm({
        name: restaurant.name || '',
        slug: restaurant.slug || '',
        description: restaurant.description || '',
        phone: restaurant.phone || '',
        whatsapp_message: restaurant.whatsapp_message || '',
        delivery_enabled: restaurant.delivery_enabled || false,
        social_links: { instagram:'', whatsapp_social:'', snapchat:'', twitter:'', tiktok:'', ...(restaurant.social_links || {}) },
        allergens: Array.isArray(restaurant.allergens)
          ? restaurant.allergens.map(a => {
              if (typeof a !== 'string') return a
              const matched = COMMON_ALLERGENS.find(c => c.label === a)
              return matched ? { label:a, icon:matched.icon } : { label:a, icon:'⚠️' }
            })
          : [],
        menu_layout: restaurant.menu_layout || 'list',
        logo_url: restaurant.logo_url || '',
        cover_url: restaurant.cover_url || '',
        delivery_fee: restaurant.delivery_fee ?? '',
        address: restaurant.address || '',
        currency: restaurant.currency || 'SAR - ريال سعودي',
        brand_color: restaurant.brand_color || '#FF6B35',
        type: restaurant.type || 'restaurant',
      })
    }
    if (user) {
      setProfileForm({
        full_name: user.user_metadata?.full_name || '',
        phone: user.user_metadata?.phone || '',
      })
    }
  }, [restaurant, user])

  // Save restaurant
  const saveRestaurant = async () => {
    if (!restForm.name.trim()) { toast.error('اسم المطعم مطلوب'); return }
    if (!restForm.slug.trim()) { toast.error('رابط المنيو مطلوب'); return }
    setLoading(true)
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({
          name: restForm.name,
          slug: restForm.slug,
          description: restForm.description,
          phone: restForm.phone,
          whatsapp_message: restForm.whatsapp_message,
          delivery_enabled: restForm.delivery_enabled,
          delivery_fee: restForm.delivery_fee ? parseFloat(restForm.delivery_fee) : 0,
          social_links: restForm.social_links,
          allergens: restForm.allergens,
          menu_layout: restForm.menu_layout,
          logo_url: restForm.logo_url,
          address: restForm.address,
          currency: restForm.currency.split(' - ')[0],
          brand_color: restForm.brand_color,
          type: restForm.type,
        })
        .eq('id', restaurant.id)
      if (error) throw error
      await fetchRestaurant(user.id)
      toast.success('تم حفظ إعدادات المطعم ✅')
    } catch (err) {
      toast.error(err.code === '23505' ? 'هذا الرابط مستخدم، جرب آخر' : err.message)
    } finally { setLoading(false) }
  }

  // رفع شعار المطعم — يُضغط ويُرفع فوراً، ويُحفظ في قاعدة البيانات بدون انتظار زر الحفظ العام
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const url = await compressAndUploadImage(file, restaurant.id, 'logo')
      const { error } = await supabase.from('restaurants').update({ logo_url: url }).eq('id', restaurant.id)
      if (error) throw error
      setRestForm(f => ({ ...f, logo_url: url }))
      await fetchRestaurant(user.id)
      toast.success('تم تحديث الشعار ✅')
    } catch (err) {
      toast.error(err.message || 'فشل رفع الصورة')
    } finally {
      setUploadingLogo(false)
      e.target.value = '' // إعادة تصفير الحقل للسماح برفع نفس الملف مرة أخرى لو احتاج
    }
  }

  // رفع صورة الغلاف — تُضغط وتُرفع فوراً، ويُحفظ في قاعدة البيانات بدون انتظار زر الحفظ العام
  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCover(true)
    try {
      const url = await compressAndUploadImage(file, restaurant.id, 'cover')
      const { error } = await supabase.from('restaurants').update({ cover_url: url }).eq('id', restaurant.id)
      if (error) throw error
      setRestForm(f => ({ ...f, cover_url: url }))
      await fetchRestaurant(user.id)
      toast.success('تم تحديث صورة الغلاف ✅')
    } catch (err) {
      toast.error(err.message || 'فشل رفع الصورة')
    } finally {
      setUploadingCover(false)
      e.target.value = ''
    }
  }

  // Save profile
  const saveProfile = async () => {
    if (!profileForm.full_name.trim()) { toast.error('الاسم مطلوب'); return }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: profileForm.full_name, phone: profileForm.phone }
      })
      if (error) throw error
      toast.success('تم تحديث الملف الشخصي ✅')
    } catch (err) {
      toast.error(err.message)
    } finally { setLoading(false) }
  }

  // Change password
  const changePassword = async () => {
    if (!passForm.newPass) { toast.error('أدخل كلمة المرور الجديدة'); return }
    if (passForm.newPass.length < 8) { toast.error('كلمة المرور 8 أحرف على الأقل'); return }
    if (passForm.newPass !== passForm.confirm) { toast.error('كلمتا المرور غير متطابقتين'); return }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: passForm.newPass })
      if (error) throw error
      setPassForm({ current:'', newPass:'', confirm:'' })
      toast.success('تم تغيير كلمة المرور ✅')
    } catch (err) {
      toast.error(err.message)
    } finally { setLoading(false) }
  }

  // Toggle restaurant active
  const toggleActive = async () => {
    const { error } = await supabase
      .from('restaurants')
      .update({ is_active: !restaurant.is_active })
      .eq('id', restaurant.id)
    if (error) { toast.error(error.message); return }
    await fetchRestaurant(user.id)
    toast.success(restaurant.is_active ? 'تم إيقاف المطعم مؤقتاً' : 'تم تفعيل المطعم ✅')
  }

  const updateHour = (i, field, val) => {
    setHours(prev => prev.map((h, idx) => idx === i ? { ...h, [field]: val } : h))
  }

  // ===== أوقات العمل حسب الفرع =====
  const DAY_LABELS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']
  const defaultHours = () => DAY_LABELS.map((day, i) => ({ day, open: i !== 6, from: i === 5 ? '12:00' : '09:00', to: i === 5 ? '24:00' : '23:00' }))
  const toEditorHours = (oh) => (Array.isArray(oh) && oh.length === 7)
    ? oh.map((h, i) => ({ day: DAY_LABELS[i], open: !!h.open, from: h.from || '09:00', to: h.to || '23:00' }))
    : defaultHours()

  // تحميل أوقات الهدف المختار (الرئيسي أو فرع)
  useEffect(() => {
    if (hoursTarget === '__main__') setHours(toEditorHours(restaurant?.opening_hours))
    else setHours(toEditorHours(branches.find(b => b.id === hoursTarget)?.opening_hours))
    // eslint-disable-next-line
  }, [hoursTarget, restaurant, branches])

  // جلب الفروع
  useEffect(() => {
    if (!restaurant) return
    supabase.from('branches').select('*').eq('restaurant_id', restaurant.id).order('sort_order')
      .then(({ data }) => setBranches(data || []))
  }, [restaurant])

  // حفظ أوقات العمل للهدف المختار
  const saveHours = async () => {
    setLoading(true)
    try {
      if (hoursTarget === '__main__') {
        const { error } = await supabase.from('restaurants').update({ opening_hours: hours }).eq('id', restaurant.id)
        if (error) throw error
        await fetchRestaurant(user.id)
      } else {
        const { error } = await supabase.from('branches').update({ opening_hours: hours }).eq('id', hoursTarget)
        if (error) throw error
        setBranches(prev => prev.map(b => b.id === hoursTarget ? { ...b, opening_hours: hours } : b))
      }
      const name = hoursTarget === '__main__' ? 'الفرع الرئيسي' : (branches.find(b => b.id === hoursTarget)?.name || 'الفرع')
      toast.success(`تم حفظ أوقات ${name} ✅`)
    } catch (err) {
      toast.error(err.message || 'تعذّر حفظ أوقات العمل')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = { width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'#F8F9FB', outline:'none', textAlign:'right', direction:'rtl', boxSizing:'border-box' }
  const labelStyle = { display:'block', fontSize:'13px', fontWeight:'700', color:'#0F1117', marginBottom:'6px' }

  const TABS = [
    { key:'restaurant', label:'🏪 المطعم' },
    { key:'hours',      label:'🕐 أوقات العمل' },
    { key:'profile',    label:'👤 الملف الشخصي' },
    { key:'password',   label:'🔒 كلمة المرور' },
    { key:'danger',     label:'⚠️ متقدم' },
  ]

  return (
    <AppShell
      active="settings"
      title="⚙️ الإعدادات"
      actions={
        <button onClick={() => navigate('/dashboard')} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer', color:'#374151' }}>← الرئيسية</button>
      }
    >
        {/* Tabs */}
        <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', padding:'0 16px', overflowX:'auto', flexShrink:0, scrollbarWidth:'none' }}>
          {TABS.map(t => (
            <div key={t.key} onClick={() => setActiveTab(t.key)} style={{ padding:'12px 14px', fontSize:'13px', fontWeight:'700', color: activeTab === t.key ? '#FF6B35' : '#6B7280', borderBottom: activeTab === t.key ? '2.5px solid #FF6B35' : '2.5px solid transparent', cursor:'pointer', whiteSpace:'nowrap', transition:'all 0.2s' }}>
              {t.label}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
          <div style={{ maxWidth:'600px', margin:'0 auto' }}>

            {/* ===== RESTAURANT TAB ===== */}
            {activeTab === 'restaurant' && (
              <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>

                <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                  <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>🏪 معلومات المطعم</div>
                  <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:'14px' }}>

                    {/* Logo upload */}
                    <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
                      <div style={{ width:'64px', height:'64px', borderRadius:'14px', background:'#F8F9FB', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'28px', overflow:'hidden', flexShrink:0 }}>
                        {restForm.logo_url
                          ? <img src={restForm.logo_url} alt="شعار المطعم" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                          : '🍕'}
                      </div>
                      <div style={{ flex:1 }}>
                        <label style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'9px 16px', borderRadius:'10px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer', color:'#374151' }}>
                          {uploadingLogo ? 'جارٍ الرفع...' : '📷 تغيير الشعار'}
                          <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} style={{ display:'none' }} />
                        </label>
                        <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'6px' }}>يُفضَّل صورة مربعة، حتى 5 ميجابايت</div>
                      </div>
                    </div>

                    {/* Cover upload */}
                    <div>
                      <div style={{ width:'100%', height:'90px', borderRadius:'12px', background:'#F8F9FB', border:'1.5px solid #E5E7EB', overflow:'hidden', marginBottom:'10px' }}>
                        {restForm.cover_url && (
                          <img src={restForm.cover_url} alt="صورة الغلاف" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                        )}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                        <label style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'9px 16px', borderRadius:'10px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer', color:'#374151' }}>
                          {uploadingCover ? 'جارٍ الرفع...' : '🖼️ صورة الغلاف'}
                          <input type="file" accept="image/*" onChange={handleCoverUpload} disabled={uploadingCover} style={{ display:'none' }} />
                        </label>
                        <span style={{ fontSize:'11px', color:'#9CA3AF' }}>تظهر خلف الشعار في المنيو العام</span>
                      </div>
                    </div>

                    <div><label style={labelStyle}>اسم المطعم *</label>
                      <input style={inputStyle} value={restForm.name} onChange={e => setRestForm(f=>({...f,name:e.target.value}))} placeholder="مطعم البيت" />
                    </div>

                    <div><label style={labelStyle}>رابط المنيو *</label>
                      <div style={{ display:'flex', border:'1.5px solid #E5E7EB', borderRadius:'11px', overflow:'hidden' }}>
                        <span style={{ padding:'11px 12px', background:'#E5E7EB', fontSize:'12px', fontWeight:'600', color:'#6B7280', whiteSpace:'nowrap', direction:'ltr', borderLeft:'1.5px solid #E5E7EB' }}>
                          {window.location.origin}/menu/
                        </span>
                        <input style={{ ...inputStyle, border:'none', borderRadius:'0', direction:'ltr', textAlign:'left', background:'white' }} value={restForm.slug} onChange={e => setRestForm(f=>({...f,slug:e.target.value.toLowerCase().replace(/[^\w-]/g,'')}))} placeholder="al-bait" />
                      </div>
                    </div>

                    <div><label style={labelStyle}>الوصف</label>
                      <textarea style={{ ...inputStyle, minHeight:'80px', resize:'vertical' }} value={restForm.description} onChange={e => setRestForm(f=>({...f,description:e.target.value}))} placeholder="وصف مطعمك..." />
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'12px' }}>
                      <div><label style={labelStyle}>رقم التواصل (واتساب) *</label>
                        <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} type="tel" value={restForm.phone} onChange={e => setRestForm(f=>({...f,phone:e.target.value}))} placeholder="9665XXXXXXXX" />
                        <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'5px', lineHeight:'1.5' }}>
                          اكتب الرقم بصيغة دولية كاملة بدون + أو مسافات، يبدأ بكود الدولة<br/>
                          مثال السعودية: 9665XXXXXXXX — الإمارات: 9715XXXXXXX — الكويت: 965XXXXXXXX
                        </div>
                      </div>
                      <div><label style={labelStyle}>العملة</label>
                        <select style={{ ...inputStyle, cursor:'pointer' }} value={restForm.currency} onChange={e => setRestForm(f=>({...f,currency:e.target.value}))}>
                          {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>

                    <div><label style={labelStyle}>رسالة ترحيب واتساب (اختياري)</label>
                      <input style={inputStyle} value={restForm.whatsapp_message} onChange={e => setRestForm(f=>({...f,whatsapp_message:e.target.value}))} placeholder="شكراً لطلبك من مطعم البيت! 🍕" />
                      <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'5px' }}>
                        تظهر هذه الجملة في بداية رسالة تأكيد الطلب وفي زر التواصل المباشر عبر واتساب
                      </div>
                    </div>

                    <div><label style={labelStyle}>العنوان</label>
                      <input style={inputStyle} value={restForm.address} onChange={e => setRestForm(f=>({...f,address:e.target.value}))} placeholder="الرياض، حي النزهة..." />
                    </div>

                  </div>
                </div>

                {/* Delivery settings */}
                <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                  <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>🚚 خيارات التوصيل</div>
                  <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:'14px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'3px' }}>تفعيل التوصيل</div>
                        <div style={{ fontSize:'12px', color:'#9CA3AF' }}>إظهار خيار "توصيل" للعميل عند الطلب</div>
                      </div>
                      <label style={{ position:'relative', width:'48px', height:'26px', cursor:'pointer', flexShrink:0 }}>
                        <input type="checkbox" checked={restForm.delivery_enabled} onChange={e => setRestForm(f=>({...f,delivery_enabled:e.target.checked}))} style={{ opacity:0, width:0, height:0, position:'absolute' }}/>
                        <div style={{ position:'absolute', inset:0, background: restForm.delivery_enabled ? '#10B981' : '#E5E7EB', borderRadius:'26px', transition:'0.3s' }}>
                          <div style={{ position:'absolute', width:'20px', height:'20px', background:'white', borderRadius:'50%', top:'3px', left: restForm.delivery_enabled ? '25px' : '3px', transition:'0.3s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
                        </div>
                      </label>
                    </div>
                    {restForm.delivery_enabled && (
                      <div><label style={labelStyle}>رسوم التوصيل (ريال)</label>
                        <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} type="number" min="0" step="0.5" value={restForm.delivery_fee} onChange={e => setRestForm(f=>({...f,delivery_fee:e.target.value}))} placeholder="0.00" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Social links */}
                <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                  <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>🔗 روابط التواصل الاجتماعي</div>
                  <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:'12px' }}>
                    {[
                      { key:'instagram', icon:'📷', label:'إنستقرام', placeholder:'https://instagram.com/your_page' },
                      { key:'whatsapp_social', icon:'💬', label:'واتساب', placeholder:'https://wa.me/9665XXXXXXXX' },
                      { key:'snapchat', icon:'👻', label:'سناب شات', placeholder:'https://snapchat.com/add/your_username' },
                      { key:'twitter', icon:'🐦', label:'تويتر / X', placeholder:'https://x.com/your_page' },
                      { key:'tiktok', icon:'🎵', label:'تيك توك', placeholder:'https://tiktok.com/@your_page' },
                    ].map(s => (
                      <div key={s.key}>
                        <label style={labelStyle}>{s.icon} {s.label}</label>
                        <input
                          style={{ ...inputStyle, direction:'ltr', textAlign:'left' }}
                          value={restForm.social_links[s.key]}
                          onChange={e => setRestForm(f => ({ ...f, social_links: { ...f.social_links, [s.key]: e.target.value } }))}
                          placeholder={s.placeholder}
                        />
                      </div>
                    ))}
                    <div style={{ fontSize:'11px', color:'#9CA3AF' }}>اتركها فاضية لإخفاء أي منصة لا تستخدمها</div>
                  </div>
                </div>

                {/* Allergens */}
                <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                  <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>⚠️ مسبّبات الحساسية</div>
                  <div style={{ padding:'16px 18px' }}>
                    <div style={{ fontSize:'12px', color:'#9CA3AF', marginBottom:'12px', lineHeight:'1.6' }}>
                      حدّد المسبّبات الموجودة في أصنافك بشكل عام. تظهر هذه القائمة للعميل في المنيو العام عبر زر "مسبّبات الحساسية"
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:'4px', marginBottom:'14px' }}>
                      {COMMON_ALLERGENS.map(a => {
                        const checked = restForm.allergens.some(x => x.label === a.label)
                        return (
                          <label key={a.label} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 6px', cursor:'pointer', borderRadius:'8px' }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                setRestForm(f => ({
                                  ...f,
                                  allergens: e.target.checked
                                    ? [...f.allergens, { label:a.label, icon:a.icon }]
                                    : f.allergens.filter(x => x.label !== a.label),
                                }))
                              }}
                              style={{ width:'17px', height:'17px', accentColor:'#FF6B35', flexShrink:0 }}
                            />
                            <span style={{ fontSize:'16px' }}>{a.icon}</span>
                            <span style={{ fontSize:'13px', fontWeight:'600' }}>{a.label}</span>
                          </label>
                        )
                      })}
                    </div>

                    {/* Custom allergens added beyond the common list */}
                    {restForm.allergens.filter(a => !COMMON_ALLERGENS.some(c => c.label === a.label)).map(a => (
                      <div key={a.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', background:'#FFF7ED', borderRadius:'8px', marginBottom:'6px' }}>
                        <span style={{ fontSize:'13px', fontWeight:'600' }}>{a.icon} {a.label}</span>
                        <button onClick={() => setRestForm(f => ({ ...f, allergens: f.allergens.filter(x => x.label !== a.label) }))} style={{ background:'none', border:'none', color:'#EF4444', fontSize:'12px', cursor:'pointer', fontWeight:'700' }}>حذف</button>
                      </div>
                    ))}

                    <div style={{ display:'flex', gap:'8px', marginTop:'8px' }}>
                      <input
                        id="custom-allergen-input"
                        style={{ ...inputStyle, flex:1 }}
                        placeholder="مسبّب آخر غير مذكور بالأعلى..."
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const val = e.target.value.trim()
                            if (val && !restForm.allergens.some(x => x.label === val)) {
                              setRestForm(f => ({ ...f, allergens: [...f.allergens, { label:val, icon:'⚠️' }] }))
                              e.target.value = ''
                            }
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          const input = document.getElementById('custom-allergen-input')
                          const val = input.value.trim()
                          if (val && !restForm.allergens.some(x => x.label === val)) {
                            setRestForm(f => ({ ...f, allergens: [...f.allergens, { label:val, icon:'⚠️' }] }))
                            input.value = ''
                          }
                        }}
                        style={{ padding:'0 16px', borderRadius:'11px', border:'none', background:'#FF6B35', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}
                      >
                        إضافة
                      </button>
                    </div>
                  </div>
                </div>

                {/* Menu layout */}
                <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                  <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>🧩 شكل عرض الأصناف</div>
                  <div style={{ padding:'16px 18px', display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap:'10px' }}>
                    {[
                      { key:'list', label:'قائمة', desc:'صورة صغيرة جانبية' },
                      { key:'grid', label:'شبكة', desc:'صورة كبيرة مربعة' },
                      { key:'circles', label:'دوائر', desc:'صورة دائرية أنيقة' },
                    ].map(opt => (
                      <div
                        key={opt.key}
                        onClick={() => setRestForm(f => ({ ...f, menu_layout: opt.key }))}
                        style={{
                          padding:'12px 8px', borderRadius:'14px', cursor:'pointer', textAlign:'center',
                          border: `2px solid ${restForm.menu_layout === opt.key ? '#FF6B35' : '#E5E7EB'}`,
                          background: restForm.menu_layout === opt.key ? '#FFF7F2' : 'white',
                        }}
                      >
                        {opt.key === 'list' && (
                          <div style={{ display:'flex', flexDirection:'column', gap:'4px', marginBottom:'10px' }}>
                            {[1,2,3].map(i => (
                              <div key={i} style={{ display:'flex', alignItems:'center', gap:'5px', background:'#F8F9FB', borderRadius:'6px', padding:'4px' }}>
                                <div style={{ width:'18px', height:'18px', borderRadius:'4px', background:'#E5E7EB', flexShrink:0 }}/>
                                <div style={{ flex:1, height:'4px', background:'#E5E7EB', borderRadius:'2px' }}/>
                              </div>
                            ))}
                          </div>
                        )}
                        {opt.key === 'grid' && (
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px', marginBottom:'10px' }}>
                            {[1,2,3,4].map(i => (
                              <div key={i} style={{ background:'#F8F9FB', borderRadius:'6px', padding:'5px' }}>
                                <div style={{ width:'100%', height:'20px', background:'#E5E7EB', borderRadius:'4px', marginBottom:'3px' }}/>
                                <div style={{ width:'70%', height:'3px', background:'#E5E7EB', borderRadius:'2px' }}/>
                              </div>
                            ))}
                          </div>
                        )}
                        {opt.key === 'circles' && (
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'10px', justifyItems:'center' }}>
                            {[1,2,3,4].map(i => (
                              <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'3px' }}>
                                <div style={{ width:'26px', height:'26px', borderRadius:'50%', background:'#F0F1F3', boxShadow:'inset 0 0 0 1px #E5E7EB' }}/>
                                <div style={{ width:'70%', height:'3px', background:'#E5E7EB', borderRadius:'2px' }}/>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', color: restForm.menu_layout===opt.key ? '#FF6B35' : '#374151', marginBottom:'2px' }}>{opt.label}</div>
                        <div style={{ fontSize:'10px', color:'#9CA3AF' }}>{opt.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Brand color */}
                <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                  <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>🎨 لون المطعم</div>
                  <div style={{ padding:'16px 18px' }}>
                    <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', marginBottom:'12px' }}>
                      {BRAND_COLORS.map(c => (
                        <div key={c} onClick={() => setRestForm(f=>({...f,brand_color:c}))} style={{ width:'38px', height:'38px', borderRadius:'50%', background:c, cursor:'pointer', border:`3px solid ${restForm.brand_color===c?'#0F1117':'transparent'}`, boxShadow:restForm.brand_color===c?'0 0 0 2px white inset':'none', transition:'all 0.2s', transform:restForm.brand_color===c?'scale(1.1)':'scale(1)' }}/>
                      ))}
                      <div style={{ position:'relative', width:'38px', height:'38px', borderRadius:'50%', border:'2px dashed #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', cursor:'pointer' }}>
                        🎨
                        <input type="color" value={restForm.brand_color} onChange={e => setRestForm(f=>({...f,brand_color:e.target.value}))} style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer', width:'100%', height:'100%' }}/>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', background:'#F8F9FB', borderRadius:'10px' }}>
                      <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:restForm.brand_color }}/>
                      <span style={{ fontSize:'13px', color:'#6B7280' }}>اللون الحالي:</span>
                      <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'700', color:restForm.brand_color }}>{restForm.brand_color}</span>
                    </div>
                  </div>
                </div>

                {/* Restaurant status */}
                <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                  <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>📡 حالة المطعم</div>
                  <div style={{ padding:'16px 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                      <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'3px' }}>
                        {restaurant?.is_active ? '✅ المطعم مفتوح' : '🔴 المطعم مغلق مؤقتاً'}
                      </div>
                      <div style={{ fontSize:'12px', color:'#9CA3AF' }}>
                        {restaurant?.is_active ? 'المنيو ظاهر ويقبل الطلبات' : 'المنيو مخفي ولا يقبل طلبات'}
                      </div>
                    </div>
                    <label style={{ position:'relative', width:'48px', height:'26px', cursor:'pointer' }}>
                      <input type="checkbox" checked={restaurant?.is_active || false} onChange={toggleActive} style={{ opacity:0, width:0, height:0, position:'absolute' }}/>
                      <div style={{ position:'absolute', inset:0, background: restaurant?.is_active ? '#10B981' : '#E5E7EB', borderRadius:'26px', transition:'0.3s' }}>
                        <div style={{ position:'absolute', width:'20px', height:'20px', background:'white', borderRadius:'50%', top:'3px', left: restaurant?.is_active ? '25px' : '3px', transition:'0.3s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
                      </div>
                    </label>
                  </div>
                </div>

                <button onClick={saveRestaurant} disabled={loading} style={{ padding:'14px', borderRadius:'13px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', cursor:'pointer', boxShadow:'0 6px 20px rgba(255,107,53,0.35)', opacity:loading?0.8:1 }}>
                  {loading ? 'جارٍ الحفظ...' : '💾 حفظ إعدادات المطعم'}
                </button>
              </div>
            )}

            {/* ===== HOURS TAB ===== */}
            {activeTab === 'hours' && (
              <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>🕐 أوقات العمل</div>
                {branches.length > 0 && (
                  <div style={{ padding:'12px 16px 0' }}>
                    <label style={{ display:'block', fontSize:'12px', fontWeight:'700', color:'#6B7280', marginBottom:'6px' }}>اختر الفرع لضبط أوقاته:</label>
                    <select value={hoursTarget} onChange={e => setHoursTarget(e.target.value)} style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', fontWeight:'700', color:'#0F1117', background:'white', cursor:'pointer', outline:'none' }}>
                      <option value="__main__">🏠 الفرع الرئيسي (المطعم كله)</option>
                      {branches.map(b => <option key={b.id} value={b.id}>🏢 {b.name}</option>)}
                    </select>
                    <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'6px' }}>لكل فرع أوقاته المستقلة. الفرع الرئيسي يُطبّق عند عدم تحديد أوقات للفرع.</div>
                  </div>
                )}
                <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:'8px' }}>
                  {hours.map((h, i) => (
                    <div key={h.day} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background: h.open ? 'white' : '#F8F9FB' }}>
                      {/* Toggle */}
                      <label style={{ position:'relative', width:'36px', height:'20px', cursor:'pointer', flexShrink:0 }}>
                        <input type="checkbox" checked={h.open} onChange={e => updateHour(i,'open',e.target.checked)} style={{ opacity:0, width:0, height:0, position:'absolute' }}/>
                        <div style={{ position:'absolute', inset:0, background: h.open ? '#10B981' : '#E5E7EB', borderRadius:'20px', transition:'0.3s' }}>
                          <div style={{ position:'absolute', width:'14px', height:'14px', background:'white', borderRadius:'50%', top:'3px', left: h.open ? '19px' : '3px', transition:'0.3s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                        </div>
                      </label>

                      <span style={{ fontSize:'13px', fontWeight:'700', width:'52px', flexShrink:0, color: h.open ? '#0F1117' : '#9CA3AF' }}>{h.day}</span>

                      {h.open ? (
                        <div style={{ display:'flex', alignItems:'center', gap:'6px', flex:1, justifyContent:'flex-end', direction:'ltr' }}>
                          <input type="time" value={h.from} onChange={e => updateHour(i,'from',e.target.value)} style={{ padding:'5px 6px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontFamily:'Tajawal,sans-serif', fontSize:'12px', outline:'none', width:'92px' }}/>
                          <span style={{ color:'#9CA3AF', fontSize:'12px' }}>—</span>
                          <input type="time" value={h.to} onChange={e => updateHour(i,'to',e.target.value)} style={{ padding:'5px 6px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontFamily:'Tajawal,sans-serif', fontSize:'12px', outline:'none', width:'92px' }}/>
                        </div>
                      ) : (
                        <span style={{ fontSize:'13px', color:'#9CA3AF', flex:1 }}>مغلق</span>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ padding:'0 16px 16px' }}>
                  <button onClick={saveHours} disabled={loading} style={{ width:'100%', padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer', opacity: loading ? 0.8 : 1 }}>
                    {loading ? 'جارٍ الحفظ...' : '💾 حفظ أوقات العمل'}
                  </button>
                </div>
              </div>
            )}

            {/* ===== PROFILE TAB ===== */}
            {activeTab === 'profile' && (
              <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                  <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>👤 الملف الشخصي</div>
                  <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:'14px' }}>

                    {/* Avatar */}
                    <div style={{ display:'flex', alignItems:'center', gap:'14px', padding:'14px', background:'#F8F9FB', borderRadius:'12px' }}>
                      <div style={{ width:'56px', height:'56px', borderRadius:'50%', background:'linear-gradient(135deg,#667eea,#764ba2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px', fontWeight:'700', color:'white', fontFamily:'Cairo,sans-serif', flexShrink:0 }}>
                        {profileForm.full_name?.charAt(0) || 'م'}
                      </div>
                      <div>
                        <div style={{ fontSize:'15px', fontWeight:'800', marginBottom:'3px' }}>{profileForm.full_name}</div>
                        <div style={{ fontSize:'12px', color:'#9CA3AF' }}>{user?.email}</div>
                      </div>
                    </div>

                    <div><label style={labelStyle}>الاسم الكامل *</label>
                      <input style={inputStyle} value={profileForm.full_name} onChange={e => setProfileForm(f=>({...f,full_name:e.target.value}))} placeholder="محمد العتيبي" />
                    </div>

                    <div><label style={labelStyle}>رقم الجوال</label>
                      <input style={inputStyle} type="tel" value={profileForm.phone} onChange={e => setProfileForm(f=>({...f,phone:e.target.value}))} placeholder="05XXXXXXXX" />
                    </div>

                    <div style={{ padding:'12px 14px', background:'#F8F9FB', borderRadius:'10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ fontSize:'13px', fontWeight:'700', marginBottom:'2px' }}>البريد الإلكتروني</div>
                        <div style={{ fontSize:'12px', color:'#9CA3AF' }}>لا يمكن تغيير البريد</div>
                      </div>
                      <span style={{ fontSize:'13px', color:'#9CA3AF', direction:'ltr' }}>{user?.email}</span>
                    </div>

                    <button onClick={saveProfile} disabled={loading} style={{ padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer', opacity:loading?0.8:1 }}>
                      {loading ? 'جارٍ الحفظ...' : '💾 حفظ الملف الشخصي'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ===== PASSWORD TAB ===== */}
            {activeTab === 'password' && (
              <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>🔒 تغيير كلمة المرور</div>
                <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:'14px' }}>

                  <div style={{ padding:'12px 14px', background:'#FFF0EB', border:'1px solid rgba(255,107,53,0.2)', borderRadius:'10px', fontSize:'13px', color:'#E85A24' }}>
                    💡 اختر كلمة مرور قوية لا تشاركها مع أحد
                  </div>

                  <div><label style={labelStyle}>كلمة المرور الجديدة *</label>
                    <input style={inputStyle} type="password" value={passForm.newPass} onChange={e => setPassForm(f=>({...f,newPass:e.target.value}))} placeholder="8 أحرف على الأقل" autoComplete="new-password" />
                  </div>

                  <div><label style={labelStyle}>تأكيد كلمة المرور *</label>
                    <input style={inputStyle} type="password" value={passForm.confirm} onChange={e => setPassForm(f=>({...f,confirm:e.target.value}))} placeholder="••••••••" autoComplete="new-password" />
                  </div>

                  {passForm.newPass && passForm.confirm && passForm.newPass !== passForm.confirm && (
                    <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:'10px', fontSize:'13px', color:'#EF4444' }}>
                      ⚠️ كلمتا المرور غير متطابقتين
                    </div>
                  )}

                  <button onClick={changePassword} disabled={loading} style={{ padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer', opacity:loading?0.8:1 }}>
                    {loading ? 'جارٍ التغيير...' : '🔒 تغيير كلمة المرور'}
                  </button>
                </div>
              </div>
            )}

            {/* ===== DANGER TAB ===== */}
            {activeTab === 'danger' && (
              <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>

                {/* Menu URL */}
                <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                  <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>🔗 رابط المنيو</div>
                  <div style={{ padding:'16px 18px' }}>
                    <div style={{ display:'flex', gap:'8px' }}>
                      <input readOnly value={`${window.location.origin}/menu/${restaurant?.slug}`} style={{ ...inputStyle, direction:'ltr', textAlign:'left', color:'#9CA3AF' }}/>
                      <button onClick={async () => {
                        const url = `${window.location.origin}/menu/${restaurant?.slug}`
                        try {
                          if (navigator.clipboard && window.isSecureContext) {
                            await navigator.clipboard.writeText(url)
                          } else {
                            const textarea = document.createElement('textarea')
                            textarea.value = url
                            textarea.style.position = 'fixed'
                            textarea.style.opacity = '0'
                            document.body.appendChild(textarea)
                            textarea.focus()
                            textarea.select()
                            const ok = document.execCommand('copy')
                            document.body.removeChild(textarea)
                            if (!ok) throw new Error('execCommand failed')
                          }
                          toast.success('تم النسخ!')
                        } catch (err) {
                          console.error('Copy failed:', err)
                          toast.error('تعذّر نسخ الرابط')
                        }
                      }} style={{ padding:'11px 14px', borderRadius:'11px', border:'none', background:'#FF6B35', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer', whiteSpace:'nowrap' }}>
                        نسخ
                      </button>
                    </div>
                  </div>
                </div>

                {/* Subscription */}
                <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                  <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>💳 الاشتراك</div>
                  <div style={{ padding:'16px 18px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
                      <div>
                        <div style={{ fontSize:'15px', fontWeight:'800', marginBottom:'3px' }}>خطة Starter</div>
                        <div style={{ fontSize:'12px', color:'#9CA3AF' }}>تجربة مجانية — 14 يوم</div>
                      </div>
                      <span style={{ padding:'4px 12px', background:'#D1FAE5', color:'#065F46', borderRadius:'100px', fontSize:'12px', fontWeight:'700' }}>نشط</span>
                    </div>
                    <button onClick={() => toast('ترقية الخطة قريباً! 🔧')} style={{ width:'100%', padding:'12px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}>
                      ⬆️ ترقية الخطة
                    </button>
                  </div>
                </div>

                {/* Danger zone */}
                <div style={{ background:'white', borderRadius:'16px', border:'1.5px solid #FEE2E2', overflow:'hidden' }}>
                  <div style={{ padding:'14px 18px', borderBottom:'1px solid #FEE2E2', fontSize:'14px', fontWeight:'800', color:'#EF4444' }}>⚠️ منطقة الخطر</div>
                  <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:'10px' }}>
                    <div style={{ padding:'12px 14px', background:'#FEF2F2', borderRadius:'10px', fontSize:'13px', color:'#991B1B', lineHeight:'1.6' }}>
                      تحذير: الإجراءات التالية لا يمكن التراجع عنها. تأكد قبل المتابعة.
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm('هل أنت متأكد من حذف كل بيانات المطعم؟ لا يمكن التراجع!')) {
                          toast.error('حذف المطعم غير متاح الآن')
                        }
                      }}
                      style={{ padding:'12px', borderRadius:'12px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', color:'#EF4444', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}
                    >
                      🗑️ حذف بيانات المطعم
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
    </AppShell>
  )
}
