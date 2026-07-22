import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

// باب دخول مستقل لـ Super Admin — لا يمرّ بأي شاشة مطعم أو Onboarding إطلاقاً.
// هوية «وضع المنصّة» الداكنة/البنفسجية. من ليس مشرفاً يُرفض ويُسجَّل خروجه (الخيار أ).
const ACCENT = '#7C3AED', BG = '#0B0D12', PANEL = '#12141C', BORDER = 'rgba(255,255,255,0.08)', MUTED = '#9CA3AF'

export default function AdminLogin() {
  const navigate = useNavigate()
  const { signIn, signOut, fetchPlatformStatus, user, isPlatformAdmin } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  // مشرف مسجّل دخوله بالفعل → مباشرةً للوحة المنصّة
  useEffect(() => {
    if (user && isPlatformAdmin) navigate('/admin', { replace: true })
  }, [user, isPlatformAdmin, navigate])

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) return toast.error('أدخل البريد وكلمة المرور')
    setLoading(true)
    try {
      await signIn(email, password)
      const { data: isAdmin } = await supabase.rpc('is_platform_admin')
      if (!isAdmin) {
        await signOut()
        toast.error('هذا الحساب ليس مشرف منصّة')
        return
      }
      await fetchPlatformStatus() // يضبط الحالة في المتجر قبل التوجيه (تفادي أي سباق)
      toast.success('مرحباً بك في لوحة المنصّة 🛡️')
      navigate('/admin', { replace: true })
    } catch {
      toast.error('البريد أو كلمة المرور غير صحيحة')
    } finally {
      setLoading(false)
    }
  }

  const input = {
    width: '100%', padding: '13px 14px', borderRadius: '12px',
    border: `1px solid ${BORDER}`, background: BG, color: 'white',
    fontFamily: 'Tajawal,sans-serif', fontSize: '15px', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl', background: BG, padding: '20px', fontFamily: 'Tajawal,sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '3px', color: ACCENT, fontWeight: '800' }}>SIMSIM</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: 'white', fontFamily: 'Cairo,sans-serif', marginTop: '4px' }}>🛡️ لوحة المنصّة</div>
          <div style={{ fontSize: '13px', color: MUTED, marginTop: '6px' }}>دخول مخصّص لمشرفي منصّة سِمسِم</div>
        </div>

        <form onSubmit={handleLogin} style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: '18px', padding: '22px' }}>
          <label style={{ display: 'block', marginBottom: '14px' }}>
            <span style={{ display: 'block', fontSize: '12.5px', color: MUTED, fontWeight: '700', marginBottom: '7px' }}>البريد الإلكتروني</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} placeholder="admin@simsim.app" autoComplete="email" />
          </label>
          <label style={{ display: 'block', marginBottom: '18px' }}>
            <span style={{ display: 'block', fontSize: '12.5px', color: MUTED, fontWeight: '700', marginBottom: '7px' }}>كلمة المرور</span>
            <div style={{ position: 'relative' }}>
              <input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...input, paddingLeft: '44px' }} placeholder="••••••••" autoComplete="current-password" />
              <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: MUTED, fontSize: '16px', cursor: 'pointer' }}>{showPass ? '🙈' : '👁️'}</button>
            </div>
          </label>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: '13px', border: 'none', background: ACCENT, color: 'white', fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '15px', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'جارٍ الدخول…' : 'دخول لوحة المنصّة ←'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: MUTED }}>
          لست مشرفاً؟ <a href="/login" style={{ color: ACCENT, fontWeight: '700', textDecoration: 'none' }}>دخول أصحاب المطاعم</a>
        </div>
      </div>
    </div>
  )
}
