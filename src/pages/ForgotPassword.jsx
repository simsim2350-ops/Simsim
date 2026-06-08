
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

export default function ForgotPassword() {
  const { resetPassword } = useAuthStore()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    if (!email) { toast.error('أدخل بريدك الإلكتروني'); return }
    setLoading(true)
    try {
      await resetPassword(email)
      setSent(true)
    } catch {
      toast.error('البريد غير مسجل')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#0F1117,#1a1a2e)', padding:'24px', direction:'rtl' }}>
      <div style={{ background:'white', borderRadius:'24px', padding:'48px 40px', width:'100%', maxWidth:'440px', boxShadow:'0 24px 64px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:'10px', marginBottom:'32px' }}>
          <div style={{ width:'36px', height:'36px', background:'linear-gradient(135deg,#FF6B35,#E85A24)', borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Cairo,sans-serif', fontWeight:'900', color:'white' }}>S</div>
          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px' }}>SIM<span style={{ color:'#FF6B35' }}>SIM</span></span>
        </div>

        {!sent ? <>
          <div style={{ textAlign:'center', fontSize:'48px', marginBottom:'16px' }}>🔑</div>
          <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'24px', textAlign:'center', marginBottom:'8px' }}>نسيت كلمة المرور؟</h2>
          <p style={{ fontSize:'14px', color:'#6B7280', textAlign:'center', lineHeight:'1.6', marginBottom:'28px' }}>أدخل بريدك وسنرسل رابط الاستعادة</p>
          <form onSubmit={handle}>
            <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'7px' }}>البريد الإلكتروني</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="example@restaurant.com"
              style={{ width:'100%', padding:'13px 14px', border:'1.5px solid #E5E7EB', borderRadius:'12px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', background:'#F8F9FB', outline:'none', textAlign:'right', marginBottom:'16px' }}/>
            <button type="submit" disabled={loading} style={{ width:'100%', padding:'14px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', cursor:'pointer', opacity:loading?0.8:1 }}>
              {loading?'جارٍ الإرسال...':'إرسال رابط الاستعادة ←'}
            </button>
          </form>
        </> : <>
          <div style={{ textAlign:'center', fontSize:'64px', marginBottom:'16px' }}>✉️</div>
          <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'22px', textAlign:'center', marginBottom:'8px' }}>تحقق من بريدك!</h2>
          <p style={{ fontSize:'14px', color:'#6B7280', textAlign:'center', lineHeight:'1.6' }}>أرسلنا رابط الاستعادة إلى<br/><strong style={{ color:'#FF6B35' }}>{email}</strong></p>
        </>}

        <div style={{ textAlign:'center', marginTop:'24px' }}>
          <Link to="/login" style={{ color:'#FF6B35', fontWeight:'700', fontSize:'14px' }}>→ العودة لتسجيل الدخول</Link>
        </div>
      </div>
    </div>
  )
}
