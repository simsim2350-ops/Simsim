import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

// خريطة تحويل الحروف العربية إلى لاتينية لتوليد رابط منيو صالح من اسم عربي
const AR_MAP = {
  'ا':'a','أ':'a','إ':'a','آ':'a','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh',
  'د':'d','ذ':'th','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'z',
  'ع':'a','غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w',
  'ي':'y','ى':'a','ة':'a','ء':'','ئ':'y','ؤ':'w','ٱ':'a',
}

const slugify = (name) =>
  (name || '')
    .trim().toLowerCase()
    .split('').map(ch => (ch in AR_MAP ? AR_MAP[ch] : ch)).join('')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

export default function Register() {
  const navigate = useNavigate()
  const { signUp, fetchRestaurant } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showSlugEdit, setShowSlugEdit] = useState(false)
  const [slugEdited, setSlugEdited] = useState(false)
  const [form, setForm] = useState({ restaurantName:'', fullName:'', email:'', password:'', slug:'' })
  const isMobile = window.innerWidth <= 768

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // عند تغيير اسم المطعم: نولّد الرابط تلقائياً ما لم يعدّله المستخدم يدوياً
  const onNameChange = (v) => {
    setForm(f => ({ ...f, restaurantName: v, slug: slugEdited ? f.slug : slugify(v) }))
  }

  const onSlugChange = (v) => {
    setSlugEdited(true)
    update('slug', v.toLowerCase().replace(/[^\w-]/g, ''))
  }

  const handleCreate = async () => {
    if (!form.restaurantName.trim()) { toast.error('أدخل اسم المطعم'); return }
    if (!form.email.trim()) { toast.error('أدخل البريد الإلكتروني'); return }
    if (form.password.length < 8) { toast.error('كلمة المرور 8 أحرف على الأقل'); return }

    let slug = form.slug || slugify(form.restaurantName)
    if (!slug) slug = `store-${Math.random().toString(36).slice(2, 7)}`

    setLoading(true)
    try {
      // فحص توفّر الرابط قبل إنشاء الحساب (يتجنب إنشاء حساب ثم فشل المطعم)
      const { data: taken } = await supabase.from('restaurants').select('id').eq('slug', slug).maybeSingle()
      if (taken) {
        toast.error('رابط المنيو مستخدم، عدّله من «تعديل الرابط»')
        setShowSlugEdit(true)
        setLoading(false)
        return
      }

      await signUp(form.email.trim(), form.password, form.fullName.trim() || form.restaurantName.trim())

      // نتأكد من وجود جلسة (auth.uid) قبل إنشاء المطعم
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // البريد يحتاج تأكيد — نكمل الإعداد بعد تسجيل الدخول
        toast('📧 تحقق من بريدك لتأكيد الحساب ثم سجّل الدخول', { icon:'📧', duration:7000 })
        navigate('/login')
        return
      }

      const { error } = await supabase.from('restaurants').insert({
        owner_id: user.id,
        name: form.restaurantName.trim(),
        slug,
        type: 'restaurant',
        brand_color: '#FF6A00',
        is_active: true,
        onboarding_step: 'welcome',
      })
      if (error) {
        if (error.code === '23505') {
          toast.error('رابط المنيو مستخدم، عدّله وحاول ثانية')
          setShowSlugEdit(true)
          setLoading(false)
          return
        }
        throw error
      }

      await fetchRestaurant(user.id)
      toast.success('🎉 تم إنشاء مطعمك! خلينا نجهّز المنيو')
      navigate('/onboarding')
    } catch (err) {
      toast.error(err.message || 'حصل خطأ، جرّب مرة ثانية')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = { width:'100%', padding:'12px 14px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', background:'#F8F9FB', outline:'none', textAlign:'right', direction:'rtl', boxSizing:'border-box' }
  const labelStyle = { display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }
  const btnStyle = { width:'100%', padding:'14px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'15px', cursor:'pointer', boxShadow:'0 6px 20px rgba(255,106,0,0.35)', marginTop:'8px', marginBottom:'10px' }

  const previewSlug = form.slug || slugify(form.restaurantName) || 'your-menu'

  return (
    <div style={{ display:'flex', minHeight:'100vh', direction:'rtl' }}>
      <div style={{ width: isMobile ? '100%' : '520px', background:'white', padding: isMobile ? '28px 20px' : '48px', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'24px' }}>
          <img src="/simsim-s.svg" alt="" style={{ height:'32px', width:'auto', display:'block' }} />
          <span style={{ fontFamily:'Poppins,sans-serif', fontWeight:'700', fontSize:'20px' }}>sim<span style={{ color:'#FF6A00' }}>sim</span></span>
        </div>

        <h2 style={{ fontSize:'24px', fontWeight:'900', marginBottom:'4px', fontFamily:'Tajawal,sans-serif' }}>أنشئ مطعمك في دقيقة 🚀</h2>
        <p style={{ fontSize:'14px', color:'#6B7280', marginBottom:'24px' }}>معلومة واحدة تكفي للبدء — الباقي تكمّله لاحقاً</p>

        <div style={{ marginBottom:'14px' }}>
          <label style={labelStyle}>اسم المطعم *</label>
          <input style={inputStyle} placeholder="مطعم البيت" value={form.restaurantName} onChange={e => onNameChange(e.target.value)} />
          {/* معاينة الرابط + تعديله */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'7px', gap:'8px', flexWrap:'wrap' }}>
            <span style={{ fontSize:'12px', color:'#9CA3AF', direction:'ltr' }}>🔗 {window.location.host}/menu/<b style={{ color:'#FF6A00' }}>{previewSlug}</b></span>
            <button type="button" onClick={() => setShowSlugEdit(s => !s)} style={{ background:'none', border:'none', color:'#FF6A00', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer', padding:0 }}>
              {showSlugEdit ? 'إخفاء' : 'تعديل الرابط'}
            </button>
          </div>
          {showSlugEdit && (
            <input style={{ ...inputStyle, marginTop:'8px', direction:'ltr', textAlign:'left' }} value={form.slug} onChange={e => onSlugChange(e.target.value)} placeholder="al-bait" />
          )}
        </div>

        <div style={{ marginBottom:'14px' }}>
          <label style={labelStyle}>اسمك <span style={{ color:'#9CA3AF', fontWeight:'400' }}>(اختياري)</span></label>
          <input style={inputStyle} placeholder="محمد" value={form.fullName} onChange={e => update('fullName', e.target.value)} />
        </div>

        <div style={{ marginBottom:'14px' }}>
          <label style={labelStyle}>البريد الإلكتروني *</label>
          <input style={inputStyle} type="email" placeholder="example@restaurant.com" value={form.email} onChange={e => update('email', e.target.value)} />
        </div>

        <div style={{ marginBottom:'14px' }}>
          <label style={labelStyle}>كلمة المرور *</label>
          <div style={{ position:'relative' }}>
            <input style={{ ...inputStyle, paddingLeft:'44px' }} type={showPassword ? 'text' : 'password'} placeholder="8 أحرف على الأقل" value={form.password} onChange={e => update('password', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCreate() }} />
            <button type="button" onClick={() => setShowPassword(s => !s)} style={{ position:'absolute', left:'8px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', fontSize:'18px', cursor:'pointer', padding:'4px' }}>
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        <button onClick={handleCreate} disabled={loading} style={{ ...btnStyle, opacity: loading ? 0.8 : 1 }}>
          {loading ? 'جارٍ الإنشاء...' : '🎉 أنشئ مطعمي مجاناً'}
        </button>

        <p style={{ textAlign:'center', fontSize:'12px', color:'#9CA3AF', marginBottom:'14px' }}>سجّل وابدأ مجاناً — بدون بطاقة بنكية</p>
        <p style={{ textAlign:'center', fontSize:'14px', color:'#6B7280' }}>لديك حساب؟ <Link to="/login" style={{ color:'#FF6A00', fontWeight:'700' }}>سجّل دخولك</Link></p>
      </div>

      {!isMobile && (
        <div style={{ flex:1, background:'linear-gradient(135deg,#0B0B0F,#1a1a2e)', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'16px', padding:'40px' }}>
          <div style={{ fontSize:'80px' }}>🍕</div>
          <h2 style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'28px', color:'white', textAlign:'center', lineHeight:'1.3' }}>منيو مطعمك الاحترافي<br/><span style={{ color:'#FF6A00' }}>يبدأ من هنا</span></h2>
          <p style={{ fontSize:'15px', color:'rgba(255,255,255,0.5)', textAlign:'center' }}>منيو رقمي وQR وطلبات — جاهزة في دقيقة</p>
        </div>
      )}
    </div>
  )
}
