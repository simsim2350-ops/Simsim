import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { trackOwnerMilestone } from '../lib/analytics'

export default function Login() {
  const navigate = useNavigate()
  const { signIn, fetchRestaurant, resumePendingRestaurant } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('أدخل بريدك وكلمة المرور')
      return
    }
    setLoading(true)
    try {
      await signIn(email, password)
      // نكمل نية التسجيل المؤكدة قبل تقرير الوجهة. الدالة idempotent ولا تقبل owner من العميل.
      const { data: { user } } = await supabase.auth.getUser()
      const pending = user?.user_metadata?.pending_restaurant
      let hasRestaurant = false
      if (user) {
        const { restaurant: resumed, error: resumeError } = await resumePendingRestaurant()
        if (resumeError?.code === '23505') {
          toast.error('رابط المنيو المحفوظ أصبح مستخدمًا. عدّله لإكمال إنشاء مطعمك.')
          navigate('/onboarding')
          return
        }
        if (resumed?.id && pending?.name && pending?.slug) {
          trackOwnerMilestone('registration_completed', { restaurantId: resumed.id, props: { email_confirmation: true } })
          trackOwnerMilestone('restaurant_created', { restaurantId: resumed.id, props: { source: 'email_confirmation' } })
        }
        const { data: rest } = await supabase.from('restaurants').select('id').eq('owner_id', user.id).maybeSingle()
        hasRestaurant = !!rest
        if (hasRestaurant) await fetchRestaurant(user.id)
      }
      toast.success('مرحباً بك! 👋')
      navigate(hasRestaurant ? '/dashboard' : '/onboarding')
    } catch (err) {
      const message = String(err?.message || '').toLowerCase()
      if (message.includes('email not confirmed') || message.includes('email not verified')) {
        toast('تحقق من بريدك الإلكتروني أولًا. يمكنك طلب رابط تأكيد جديد.', { icon:'📧' })
        navigate(`/verify-email?email=${encodeURIComponent(email.trim())}`, { state: { email: email.trim() } })
      } else {
        toast.error('البريد أو كلمة المرور غير صحيحة')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      {/* Left Visual — مخفي على الجوال */}
      {!isMobile && (
      <div style={styles.visual}>
        <div style={styles.visualOrb1} />
        <div style={styles.visualOrb2} />
        <div style={styles.visualGrid} />

        <div style={styles.visualContent}>
          <div style={styles.logoWrap}>
            <img src="/simsim-s.svg" alt="" style={{ height:'40px', width:'auto', display:'block' }} />
            <span style={styles.logoText}>sim<span style={{ color: '#FF6A00' }}>sim</span></span>
          </div>

          <h1 style={styles.visualTitle}>
            مطعمك الرقمي<br />
            <span style={{ color: '#FF6A00' }}>يبدأ من هنا</span>
          </h1>

          <p style={styles.visualDesc}>
            منيو رقمي + طلبات لحظية + تحليلات — كل شيء في مكان واحد
          </p>

          <div style={styles.pills}>
            {['🍽️ منيو رقمي احترافي', '🔔 طلبات فورية', '📊 تحليلات المبيعات'].map((pill) => (
              <div key={pill} style={styles.pill}>{pill}</div>
            ))}
          </div>

          <div style={styles.statsRow}>
            {[['مجاناً', 'للبدء'], ['0%', 'عمولة'], ['بسهولة', 'إعداد المنيو']].map(([val, label]) => (
              <div key={label} style={styles.stat}>
                <span style={styles.statVal}>{val}</span>
                <span style={styles.statLabel}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Right Form */}
      <div style={{ ...styles.formPanel, width: isMobile ? '100%' : '520px' }}>
        <div style={styles.formInner}>
          <div style={styles.formHeader}>
            <div style={styles.eyebrow}>مرحباً بعودتك 👋</div>
            <h2 style={styles.formTitle}>تسجيل الدخول</h2>
            <p style={styles.formSub}>أدخل بياناتك للوصول إلى لوحة تحكم مطعمك</p>
          </div>

          <div style={{ marginBottom: '8px' }} />

          <form onSubmit={handleLogin}>
            <div style={styles.formGroup}>
              <label style={styles.label}>البريد الإلكتروني</label>
              <div style={styles.inputWrap}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@restaurant.com"
                  style={styles.input}
                  autoComplete="email"
                />
                <span style={styles.inputIcon}>📧</span>
              </div>
            </div>

            <div style={styles.formGroup}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ ...styles.label, marginBottom: 0 }}>كلمة المرور</label>
                <Link to="/forgot-password" style={{ fontSize: '13px', color: '#FF6A00', fontWeight: '700' }}>
                  نسيت كلمة المرور؟
                </Link>
              </div>
              <div style={styles.inputWrap}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ ...styles.input, paddingLeft: '44px' }}
                  autoComplete="current-password"
                />
                <span style={styles.inputIcon}>🔒</span>
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={styles.eyeBtn}
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ ...styles.submitBtn, opacity: loading ? 0.8 : 1 }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                  <div style={styles.spinner} />
                  جارٍ الدخول...
                </span>
              ) : 'دخول إلى لوحة التحكم ←'}
            </button>
          </form>

          <p style={styles.footer}>
            ليس لديك حساب؟{' '}
            <Link to="/register" style={{ color: '#FF6A00', fontWeight: '700' }}>
              أنشئ حساباً مجانياً
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    minHeight: '100vh',
    direction: 'rtl',
  },
  visual: {
    flex: 1,
    background: '#0B0B0F',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    padding: '48px',
  },
  visualOrb1: {
    position: 'absolute',
    width: '500px', height: '500px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,106,0,0.2) 0%, transparent 70%)',
    top: '-150px', right: '-100px',
    pointerEvents: 'none',
  },
  visualOrb2: {
    position: 'absolute',
    width: '400px', height: '400px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0,180,216,0.1) 0%, transparent 70%)',
    bottom: '-100px', left: '-100px',
    pointerEvents: 'none',
  },
  visualGrid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
    `,
    backgroundSize: '50px 50px',
    pointerEvents: 'none',
  },
  visualContent: { position: 'relative', zIndex: 2, maxWidth: '440px' },
  logoWrap: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' },
  logoMark: {
    width: '44px', height: '44px',
    background: 'linear-gradient(135deg, #FF6A00, #E05D00)',
    borderRadius: '12px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Tajawal, sans-serif', fontWeight: '900', fontSize: '18px',
    color: 'white', boxShadow: '0 4px 16px rgba(255,106,0,0.4)',
  },
  logoText: {
    fontFamily: 'Poppins, sans-serif', fontWeight: '700',
    fontSize: '24px', color: 'white',
  },
  visualTitle: {
    fontFamily: 'Tajawal, sans-serif', fontWeight: '900',
    fontSize: '40px', color: 'white',
    lineHeight: '1.15', letterSpacing: '-1px',
    marginBottom: '16px',
  },
  visualDesc: {
    fontSize: '16px', color: 'rgba(255,255,255,0.5)',
    lineHeight: '1.7', marginBottom: '32px',
  },
  pills: { display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '40px' },
  pill: {
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    color: 'rgba(255,255,255,0.7)',
    fontSize: '14px', fontWeight: '600',
  },
  statsRow: { display: 'flex', gap: '32px' },
  stat: { display: 'flex', flexDirection: 'column', gap: '4px' },
  statVal: {
    fontFamily: 'Tajawal, sans-serif', fontWeight: '900',
    fontSize: '26px', color: '#FF6A00',
  },
  statLabel: { fontSize: '12px', color: 'rgba(255,255,255,0.4)' },
  formPanel: {
    flexShrink: 0,
    background: 'white',
    display: 'flex', flexDirection: 'column',
    borderRight: '3px solid #FF6A00',
    overflowY: 'auto',
  },
  formInner: {
    flex: 1, padding: '60px 48px',
    display: 'flex', flexDirection: 'column',
    justifyContent: 'center',
  },
  formHeader: { marginBottom: '32px' },
  eyebrow: {
    fontSize: '12px', fontWeight: '700',
    color: '#FF6A00', textTransform: 'uppercase',
    letterSpacing: '1.5px', marginBottom: '10px',
  },
  formTitle: {
    fontSize: '28px', fontWeight: '900',
    color: '#0B0B0F', marginBottom: '8px',
  },
  formSub: { fontSize: '15px', color: '#6B7280', lineHeight: '1.6' },
  formGroup: { marginBottom: '18px' },
  label: {
    display: 'block', fontSize: '13px', fontWeight: '700',
    color: '#0B0B0F', marginBottom: '8px',
  },
  inputWrap: { position: 'relative' },
  input: {
    width: '100%', padding: '13px 44px 13px 16px',
    border: '1.5px solid #E5E7EB', borderRadius: '12px',
    fontFamily: 'Tajawal, sans-serif', fontSize: '15px',
    color: '#0B0B0F', background: '#F8F9FB',
    outline: 'none', textAlign: 'right',
    transition: 'all 0.2s',
  },
  inputIcon: {
    position: 'absolute', right: '14px', top: '50%',
    transform: 'translateY(-50%)', fontSize: '17px',
    pointerEvents: 'none',
  },
  eyeBtn: {
    position: 'absolute', left: '12px', top: '50%',
    transform: 'translateY(-50%)',
    background: 'none', border: 'none',
    fontSize: '17px', cursor: 'pointer',
    padding: '4px',
  },
  submitBtn: {
    width: '100%', padding: '15px',
    borderRadius: '13px', border: 'none',
    background: 'linear-gradient(135deg, #FF6A00, #E05D00)',
    color: 'white',
    fontFamily: 'Tajawal, sans-serif', fontWeight: '800', fontSize: '15px',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(255,106,0,0.35)',
    marginTop: '8px', marginBottom: '24px',
    transition: 'all 0.2s',
  },
  spinner: {
    width: '18px', height: '18px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: 'white', borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  footer: { textAlign: 'center', fontSize: '14px', color: '#6B7280' },
}
