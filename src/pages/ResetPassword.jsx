import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [newPass, setNewPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)

  // Supabase redirects here with a recovery token in the URL hash.
  // onAuthStateChange fires PASSWORD_RECOVERY once the SDK picks it up.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })

    // Fallback: if a session already exists when this page loads
    // (some browsers process the hash before this listener attaches).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const handleReset = async (e) => {
    e.preventDefault()
    if (!newPass || newPass.length < 8) {
      toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }
    if (newPass !== confirm) {
      toast.error('كلمتا المرور غير متطابقتين')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass })
      if (error) throw error
      setDone(true)
      toast.success('تم تغيير كلمة المرور ✅')
    } catch (err) {
      toast.error(err.message || 'حدث خطأ، حاول مجدداً')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logoWrap}>
          <img src="/simsim-s.svg" alt="" style={{ height:'32px', width:'auto', display:'block' }} />
          <span style={styles.logoText}>sim<span style={{ color: '#FF6A00' }}>sim</span></span>
        </div>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
            <h2 style={styles.title}>تم تغيير كلمة المرور!</h2>
            <p style={styles.sub}>يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة</p>
            <button onClick={() => navigate('/login')} style={{ ...styles.btn, marginTop: '12px' }}>
              تسجيل الدخول ←
            </button>
          </div>
        ) : !ready ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔗</div>
            <h2 style={styles.title}>رابط غير صالح أو منتهي</h2>
            <p style={styles.sub}>
              افتح هذه الصفحة من رابط استعادة كلمة المرور المرسل إلى بريدك، أو اطلب رابطاً جديداً
            </p>
            <button onClick={() => navigate('/forgot-password')} style={{ ...styles.btn, marginTop: '12px' }}>
              طلب رابط جديد ←
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: '48px', marginBottom: '16px', textAlign: 'center' }}>🔑</div>
            <h2 style={styles.title}>كلمة مرور جديدة</h2>
            <p style={styles.sub}>أدخل كلمة المرور الجديدة لحسابك</p>

            <form onSubmit={handleReset}>
              <div style={styles.formGroup}>
                <label style={styles.label}>كلمة المرور الجديدة</label>
                <input
                  style={styles.input}
                  type="password"
                  placeholder="8 أحرف على الأقل"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>تأكيد كلمة المرور</label>
                <input
                  style={styles.input}
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{ ...styles.btn, opacity: loading ? 0.8 : 1 }}
              >
                {loading ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور ←'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #0B0B0F, #1a1a2e)',
    padding: '24px', direction: 'rtl',
  },
  card: {
    background: 'white', borderRadius: '24px',
    padding: '48px 40px', width: '100%', maxWidth: '440px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
  },
  logoWrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '10px', marginBottom: '32px',
  },
  logoMark: {
    width: '36px', height: '36px',
    background: 'linear-gradient(135deg, #FF6A00, #E05D00)',
    borderRadius: '10px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Tajawal, sans-serif', fontWeight: '900', fontSize: '15px', color: 'white',
  },
  logoText: { fontFamily: 'Poppins, sans-serif', fontWeight: '700', fontSize: '20px', color: '#0B0B0F' },
  title: {
    fontFamily: 'Tajawal, sans-serif', fontWeight: '900',
    fontSize: '24px', color: '#0B0B0F',
    textAlign: 'center', marginBottom: '8px',
  },
  sub: {
    fontSize: '14px', color: '#6B7280',
    lineHeight: '1.6', textAlign: 'center', marginBottom: '28px',
  },
  formGroup: { marginBottom: '16px' },
  label: {
    display: 'block', fontSize: '13px', fontWeight: '700',
    color: '#0B0B0F', marginBottom: '7px',
  },
  input: {
    width: '100%', padding: '13px 14px',
    border: '1.5px solid #E5E7EB', borderRadius: '12px',
    fontFamily: 'Tajawal, sans-serif', fontSize: '14px',
    color: '#0B0B0F', background: '#F8F9FB',
    outline: 'none', textAlign: 'right', direction: 'rtl',
  },
  btn: {
    width: '100%', padding: '14px',
    borderRadius: '12px', border: 'none',
    background: 'linear-gradient(135deg, #FF6A00, #E05D00)',
    color: 'white',
    fontFamily: 'Tajawal, sans-serif', fontWeight: '800', fontSize: '15px',
    cursor: 'pointer', boxShadow: '0 6px 20px rgba(255,106,0,0.35)',
  },
}
