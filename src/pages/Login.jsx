
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

export default function Login() {
  const navigate = useNavigate()
  const { signIn, signInWithGoogle } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) { toast.error('أدخل البريد وكلمة المرور'); return }
    setLoading(true)
    try {
      await signIn(email, password)
      toast.success('مرحباً بك! 👋')
      navigate('/dashboard')
    } catch {
      toast.error('البريد أو كلمة المرور غير صحيحة')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', direction:'rtl' }}>

      {/* Left Visual */}
      <div style={{ flex:1, background:'#0F1117', display:'flex', alignItems:'center', padding:'48px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', width:'500px', height:'500px', borderRadius:'50%', background:'radial-gradient(circle,rgba(255,107,53,0.2) 0%,transparent 70%)', top:'-150px', right:'-100px' }}/>
        <div style={{ position:'relative', zIndex:2, maxWidth:'440px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'40px' }}>
            <div style={{ width:'44px', height:'44px', background:'linear-gradient(135deg,#FF6B35,#E85A24)', borderRadius:'12px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', color:'white' }}>S</div>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'24px', color:'white' }}>SIM<span style={{ color:'#FF6B35' }}>SIM</span></span>
          </div>
          <h1 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'40px', color:'white', lineHeight:'1.15', marginBottom:'16px' }}>
            مطعمك الرقمي<br/><span style={{ color:'#FF6B35' }}>يبدأ من هنا</span>
          </h1>
          <p style={{ fontSize:'16px', color:'rgba(255,255,255,0.5)', lineHeight:'1.7', marginBottom:'32px' }}>
            منيو رقمي + طلبات لحظية + تحليلات في مكان واحد
          </p>
          {['🍽️ منيو رقمي احترافي','🔔 طلبات فورية بدون تأخير','📊 تحليلات المبيعات'].map(p => (
            <div key={p} style={{ padding:'12px 16px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'12px', color:'rgba(255,255,255,0.7)', fontSize:'14px', fontWeight:'600', marginBottom:'10px' }}>{p}</div>
          ))}
        </div>
      </div>

      {/* Right Form */}
      <div style={{ width:'520px', background:'white', borderRight:'3px solid #FF6B35', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ flex:1, padding:'60px 48px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
          <div style={{ fontSize:'12px', fontWeight:'700', color:'#FF6B35', textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:'10px' }}>مرحباً بعودتك 👋</div>
          <h2 style={{ fontSize:'28px', fontWeight:'900', marginBottom:'8px' }}>تسجيل الدخول</h2>
          <p style={{ fontSize:'15px', color:'#6B7280', marginBottom:'32px' }}>أدخل بياناتك للوصول للوحة التحكم</p>

          <button onClick={() => signInWithGoogle()} style={{ width:'100%', padding:'13px', borderRadius:'13px', border:'1.5px solid #E5E7EB', background:'white', display:'flex', alignItems:'center', justifyContent:'center', gap:'10px', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'14px', cursor:'pointer', marginBottom:'20px' }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.79h5.38a4.6 4.6 0 01-2 3.02v2.5h3.22c1.89-1.73 2.98-4.28 2.98-7.31z" fill="#4285F4"/>
              <path d="M10 20c2.7 0 4.96-.9 6.62-2.43l-3.22-2.5c-.9.6-2.04.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H1.08v2.6A10 10 0 0010 20z" fill="#34A853"/>
              <path d="M4.39 11.9A6.01 6.01 0 014.07 10c0-.66.11-1.3.32-1.9V5.5H1.08A10 10 0 000 10c0 1.61.39 3.14 1.08 4.5l3.31-2.6z" fill="#FBBC05"/>
              <path d="M10 3.97c1.47 0 2.8.5 3.84 1.5l2.87-2.87A10 10 0 001.08 5.5l3.31 2.6C5.18 5.73 7.39 3.97 10 3.97z" fill="#EA4335"/>
            </svg>
            متابعة بحساب Google
          </button>

          <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'24px' }}>
            <div style={{ flex:1, height:'1px', background:'#E5E7EB' }}/>
            <span style={{ fontSize:'13px', color:'#9CA3AF' }}>أو بالبريد الإلكتروني</span>
            <div style={{ flex:1, height:'1px', background:'#E5E7EB' }}/>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom:'16px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'7px' }}>البريد الإلكتروني</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@restaurant.com"
                style={{ width:'100%', padding:'13px 14px', border:'1.5px solid #E5E7EB', borderRadius:'12px', fontFamily:'Tajawal,sans-serif', fontSize:'15px', background:'#F8F9FB', outline:'none', textAlign:'right' }}/>
            </div>

            <div style={{ marginBottom:'8px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'7px' }}>
                <label style={{ fontSize:'13px', fontWeight:'700' }}>كلمة المرور</label>
                <Link to="/forgot-password" style={{ fontSize:'13px', color:'#FF6B35', fontWeight:'700' }}>نسيت كلمة المرور؟</Link>
              </div>
              <div style={{ position:'relative' }}>
                <input type={showPass?'text':'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                  style={{ width:'100%', padding:'13px 14px 13px 44px', border:'1.5px solid #E5E7EB', borderRadius:'12px', fontFamily:'Tajawal,sans-serif', fontSize:'15px', background:'#F8F9FB', outline:'none', textAlign:'right' }}/>
                <button type="button" onClick={() => setShowPass(!showPass)} style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', fontSize:'17px', cursor:'pointer' }}>
                  {showPass?'🙈':'👁️'}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} style={{ width:'100%', padding:'15px', borderRadius:'13px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', cursor:'pointer', boxShadow:'0 8px 24px rgba(255,107,53,0.35)', marginTop:'16px', marginBottom:'20px', opacity:loading?0.8:1 }}>
              {loading ? 'جارٍ الدخول...' : 'دخول إلى لوحة التحكم ←'}
            </button>
          </form>

          <p style={{ textAlign:'center', fontSize:'14px', color:'#6B7280' }}>
            ليس لديك حساب؟{' '}
            <Link to="/register" style={{ color:'#FF6B35', fontWeight:'700' }}>أنشئ حساباً مجانياً</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
