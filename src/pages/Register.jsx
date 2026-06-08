
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

export default function Register() {
  const navigate = useNavigate()
  const { signUp } = useAuthStore()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ fullName:'', email:'', password:'', confirmPassword:'', restaurantName:'', type:'restaurant' })
  const update = (k,v) => setForm(f => ({...f,[k]:v}))

  const next = () => {
    if (step===1 && (!form.fullName||!form.email)) { toast.error('أدخل الاسم والبريد'); return }
    if (step===2 && form.password.length<8) { toast.error('كلمة المرور 8 أحرف على الأقل'); return }
    if (step===2 && form.password!==form.confirmPassword) { toast.error('كلمتا المرور غير متطابقتين'); return }
    setStep(s=>s+1)
  }

  const handleRegister = async () => {
    if (!form.restaurantName) { toast.error('أدخل اسم المطعم'); return }
    setLoading(true)
    try {
      await signUp(form.email, form.password, form.fullName)
      toast.success('تم إنشاء حسابك! 🎉')
      navigate('/onboarding')
    } catch(err) {
      toast.error(err.message||'حدث خطأ')
    } finally { setLoading(false) }
  }

  const inputStyle = { width:'100%', padding:'12px 14px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', background:'#F8F9FB', outline:'none', textAlign:'right', direction:'rtl' }
  const btnStyle = { width:'100%', padding:'14px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', cursor:'pointer', boxShadow:'0 6px 20px rgba(255,107,53,0.35)', marginTop:'8px', marginBottom:'10px' }

  return (
    <div style={{ display:'flex', minHeight:'100vh', direction:'rtl' }}>
      <div style={{ width:'520px', background:'white', padding:'48px', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'28px' }}>
          <div style={{ width:'36px', height:'36px', background:'linear-gradient(135deg,#FF6B35,#E85A24)', borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Cairo,sans-serif', fontWeight:'900', color:'white' }}>S</div>
          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px' }}>SIM<span style={{ color:'#FF6B35' }}>SIM</span></span>
        </div>

        {/* Dots */}
        <div style={{ display:'flex', gap:'6px', marginBottom:'28px' }}>
          {[1,2,3].map(s => <div key={s} style={{ height:'8px', borderRadius: s===step?'4px':'50%', width: s===step?'24px':'8px', background: s<step?'#10B981':s===step?'#FF6B35':'#E5E7EB', transition:'all 0.3s' }}/>)}
        </div>

        {step===1 && <>
          <div style={{ fontSize:'12px', color:'#FF6B35', fontWeight:'700', marginBottom:'8px' }}>الخطوة 1 من 3</div>
          <h2 style={{ fontSize:'24px', fontWeight:'900', marginBottom:'20px' }}>معلوماتك الشخصية</h2>
          <div style={{ marginBottom:'14px' }}><label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>الاسم الكامل *</label><input style={inputStyle} placeholder="محمد العتيبي" value={form.fullName} onChange={e=>update('fullName',e.target.value)}/></div>
          <div style={{ marginBottom:'14px' }}><label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>البريد الإلكتروني *</label><input style={inputStyle} type="email" placeholder="example@restaurant.com" value={form.email} onChange={e=>update('email',e.target.value)}/></div>
          <button onClick={next} style={btnStyle}>التالي ←</button>
          <p style={{ textAlign:'center', fontSize:'14px', color:'#6B7280' }}>لديك حساب؟ <Link to="/login" style={{ color:'#FF6B35', fontWeight:'700' }}>سجّل دخولك</Link></p>
        </>}

        {step===2 && <>
          <div style={{ fontSize:'12px', color:'#FF6B35', fontWeight:'700', marginBottom:'8px' }}>الخطوة 2 من 3</div>
          <h2 style={{ fontSize:'24px', fontWeight:'900', marginBottom:'20px' }}>كلمة المرور</h2>
          <div style={{ marginBottom:'14px' }}><label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>كلمة المرور *</label><input style={inputStyle} type="password" placeholder="8 أحرف على الأقل" value={form.password} onChange={e=>update('password',e.target.value)}/></div>
          <div style={{ marginBottom:'14px' }}><label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>تأكيد كلمة المرور *</label><input style={inputStyle} type="password" placeholder="••••••••" value={form.confirmPassword} onChange={e=>update('confirmPassword',e.target.value)}/></div>
          <button onClick={next} style={btnStyle}>التالي ←</button>
          <button onClick={()=>setStep(1)} style={{ width:'100%', padding:'12px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'transparent', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'14px', color:'#6B7280', cursor:'pointer' }}>→ رجوع</button>
        </>}

        {step===3 && <>
          <div style={{ fontSize:'12px', color:'#FF6B35', fontWeight:'700', marginBottom:'8px' }}>الخطوة 3 من 3</div>
          <h2 style={{ fontSize:'24px', fontWeight:'900', marginBottom:'20px' }}>معلومات مطعمك</h2>
          <div style={{ marginBottom:'14px' }}><label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>اسم المطعم *</label><input style={inputStyle} placeholder="مطعم البيت" value={form.restaurantName} onChange={e=>update('restaurantName',e.target.value)}/></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'20px' }}>
            {[{k:'restaurant',l:'مطعم',e:'🍽️'},{k:'cafe',l:'مقهى',e:'☕'},{k:'truck',l:'فود ترك',e:'🚚'},{k:'cloud',l:'كلاود كيتشن',e:'☁️'}].map(t=>(
              <div key={t.k} onClick={()=>update('type',t.k)} style={{ border:`1.5px solid ${form.type===t.k?'#FF6B35':'#E5E7EB'}`, borderRadius:'12px', padding:'14px', display:'flex', flexDirection:'column', alignItems:'center', gap:'6px', cursor:'pointer', background:form.type===t.k?'#FFF0EB':'#F8F9FB', boxShadow:form.type===t.k?'0 0 0 3px rgba(255,107,53,0.15)':'none' }}>
                <span style={{ fontSize:'26px' }}>{t.e}</span>
                <span style={{ fontSize:'12px', fontWeight:'700' }}>{t.l}</span>
              </div>
            ))}
          </div>
          <button onClick={handleRegister} disabled={loading} style={{ ...btnStyle, opacity:loading?0.8:1 }}>{loading?'جارٍ الإنشاء...':'🎉 إنشاء الحساب مجاناً'}</button>
          <button onClick={()=>setStep(2)} style={{ width:'100%', padding:'12px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'transparent', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'14px', color:'#6B7280', cursor:'pointer' }}>→ رجوع</button>
        </>}
      </div>

      <div style={{ flex:1, background:'linear-gradient(135deg,#0F1117,#1a1a2e)', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'16px' }}>
        <div style={{ fontSize:'80px' }}>🍕</div>
        <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'28px', color:'white', textAlign:'center', lineHeight:'1.3' }}>انضم لـ +500 مطعم<br/><span style={{ color:'#FF6B35' }}>يثقون بـ SIMSIM</span></h2>
        <p style={{ fontSize:'15px', color:'rgba(255,255,255,0.5)', textAlign:'center' }}>ابدأ مجاناً 14 يوم — بدون بطاقة ائتمانية</p>
      </div>
    </div>
  )
}
