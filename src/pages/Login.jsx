import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

export default function Login() {
  const navigate = useNavigate()
  const { signIn } = useAuthStore()
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
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0F1117, #1a1a2e)',
      padding: '24px',
      direction: 'rtl',
    }}>
      <div style={{
        background: 'white',
        borderRadius: '24px',
        padding: '40px 32px',
        width: '100%',
        maxWidth: '440px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
      }}>

        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'10px', marginBottom:'32px' }}>
          <div style={{ width:'40px', height:'40px', background:'linear-gradient(135deg,#FF6B35,#E85A24)', borderRadius:'12px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', color:'white' }}>S</div>
          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'22px', color:'#0F1117' }}>
            SIM<span style={{ color:'#FF6B35' }}>SIM</span>
          </span>
        </div>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:'28px' }}>
          <div style={{ fontSize:'12px', fontWeight:'700', color:'#FF6B35', textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:'8px' }}>مرحباً بعودتك 👋</div>
          <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'26px', color:'#0F1117', marginBottom:'6px' }}>تسجيل الدخول</h2>
          <p style={{ fontSize:'14px', color:'#6B7280' }}>أدخل بياناتك للوصول للوحة التحكم</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom:'16px' }}>
            <label style={{ display:'block', fontSize:'13px', fontWeight:'700', color:'#0F1117', marginBottom:'7px' }}>
              البريد الإلكتروني
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@restaurant.com"
              style={{
                width:'100%', padding:'13px 14px',
                border:'1.5px solid #E5E7EB', borderRadius:'12px',
                fontFamily:'Tajawal,sans-serif', fontSize:'15px',
                color:'#0F1117', background:'#F8F9FB',
                outline:'none', textAlign:'right', direction:'rtl',
              }}
            />
          </div>

          <div style={{ marginBottom:'20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'7px' }}>
              <label style={{ fontSize:'13px', fontWeight:'700', color:'#0F1117' }}>كلمة المرور</label>
              <Link to="/forgot-password" style={{ fontSize:'13px', color:'#FF6B35', fontWeight:'700' }}>
                نسيت كلمة المرور؟
              </Link>
            </div>
            <div style={{ position:'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width:'100%', padding:'13px 14px 13px 44px',
                  border:'1.5px solid #E5E7EB', borderRadius:'12px',
                  fontFamily:'Tajawal,sans-serif', fontSize:'15px',
                  color:'#0F1117', background:'#F8F9FB',
                  outline:'none', textAlign:'right', direction:'rtl',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', fontSize:'18px', cursor:'pointer' }}
              >
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width:'100%', padding:'15px',
              borderRadius:'13px', border:'none',
              background:'linear-gradient(135deg,#FF6B35,#E85A24)',
              color:'white', fontFamily:'Cairo,sans-serif',
              fontWeight:'800', fontSize:'16px', cursor:'pointer',
              boxShadow:'0 8px 24px rgba(255,107,53,0.35)',
              marginBottom:'20px',
              opacity: loading ? 0.8 : 1,
            }}
          >
            {loading ? 'جارٍ الدخول...' : 'دخول إلى لوحة التحكم ←'}
          </button>
        </form>

        <p style={{ textAlign:'center', fontSize:'14px', color:'#6B7280' }}>
          ليس لديك حساب؟{' '}
          <Link to="/register" style={{ color:'#FF6B35', fontWeight:'700' }}>
            أنشئ حساباً مجانياً
          </Link>
        </p>

      </div>
    </div>
  )
}
