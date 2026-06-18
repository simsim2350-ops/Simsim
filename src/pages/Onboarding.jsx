import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

const slugify = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')

export default function Onboarding() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, fetchRestaurant } = useAuthStore()
  const prefill = location.state || {}
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: prefill.restaurantName || '',
    slug: prefill.restaurantName ? slugify(prefill.restaurantName) : '',
    description: '',
    phone: '',
    type: prefill.type || 'restaurant',
    color: '#FF6B35',
  })

  const update = (key, val) => setForm((f) => ({ ...f, [key]: val }))

  const updateSlug = (name) => {
    update('slug', slugify(name))
    update('name', name)
  }

  const handleFinish = async () => {
    if (!form.name || !form.slug) {
      toast.error('يرجى إدخال اسم ورابط المطعم')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.from('restaurants').insert({
        owner_id: user.id,
        name: form.name,
        slug: form.slug,
        description: form.description,
        phone: form.phone,
        type: form.type,
        brand_color: form.color,
        is_active: true,
      })
      if (error) throw error
      await fetchRestaurant(user.id)
      toast.success('🎉 مطعمك جاهز! أهلاً بك في SIMSIM')
      navigate('/dashboard')
    } catch (err) {
      if (err.code === '23505') {
        toast.error('هذا الرابط مستخدم، جرب رابطاً آخر')
      } else {
        toast.error(err.message || 'حدث خطأ')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logoMark}>S</div>
          <h2 style={styles.headerTitle}>إعداد مطعمك</h2>
          <p style={styles.headerSub}>دقيقتان وأنت جاهز 🚀</p>
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div style={styles.stepBody}>
            <div style={{ fontSize: '48px', textAlign: 'center', marginBottom: '16px' }}>🏪</div>
            <h3 style={styles.stepTitle}>معلومات مطعمك</h3>

            <div style={styles.formGroup}>
              <label style={styles.label}>اسم المطعم *</label>
              <input
                style={styles.input}
                placeholder="مطعم البيت"
                value={form.name}
                onChange={(e) => updateSlug(e.target.value)}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>رابط المنيو *</label>
              <div style={styles.slugWrap}>
                <span style={styles.slugPrefix}>{window.location.host}/menu/</span>
                <input
                  style={{ ...styles.input, borderRadius: '0 11px 11px 0', direction: 'ltr', textAlign: 'left' }}
                  value={form.slug}
                  onChange={(e) => update('slug', e.target.value.toLowerCase().replace(/[^\w-]/g, ''))}
                  placeholder="al-bait"
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>وصف مختصر</label>
              <textarea
                style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
                placeholder="اكتب وصفاً جذاباً لمطعمك..."
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
              />
            </div>

            <button onClick={() => setStep(2)} style={styles.btn}>
              التالي ←
            </button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div style={styles.stepBody}>
            <div style={{ fontSize: '48px', textAlign: 'center', marginBottom: '16px' }}>🎨</div>
            <h3 style={styles.stepTitle}>اختر لون مطعمك</h3>

            <div style={styles.colorGrid}>
              {['#FF6B35','#E85A24','#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B','#0F1117'].map((c) => (
                <div
                  key={c}
                  onClick={() => update('color', c)}
                  style={{
                    width: '44px', height: '44px',
                    borderRadius: '50%', background: c,
                    cursor: 'pointer', transition: 'all 0.2s',
                    border: form.color === c ? '3px solid #0F1117' : '3px solid transparent',
                    boxShadow: form.color === c ? '0 0 0 2px white inset' : 'none',
                    transform: form.color === c ? 'scale(1.1)' : 'scale(1)',
                  }}
                />
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button onClick={() => setStep(1)} style={styles.backBtn}>→ رجوع</button>
              <button onClick={() => setStep(3)} style={{ ...styles.btn, flex: 1 }}>التالي ←</button>
            </div>
          </div>
        )}

        {/* Step 3 - Finish */}
        {step === 3 && (
          <div style={styles.stepBody}>
            <div style={{ fontSize: '48px', textAlign: 'center', marginBottom: '16px' }}>🎉</div>
            <h3 style={styles.stepTitle}>كل شيء جاهز!</h3>
            <p style={{ textAlign: 'center', color: '#6B7280', marginBottom: '24px', lineHeight: '1.7' }}>
              سيتم إنشاء مطعمك الآن على الرابط:
              <br />
              <strong style={{ color: '#FF6B35', direction: 'ltr', display: 'block', marginTop: '6px' }}>
                {window.location.host}/menu/{form.slug}
              </strong>
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setStep(2)} style={styles.backBtn}>→ رجوع</button>
              <button
                onClick={handleFinish}
                disabled={loading}
                style={{ ...styles.btn, flex: 1, opacity: loading ? 0.8 : 1 }}
              >
                {loading ? 'جارٍ الإنشاء...' : '🚀 إنشاء مطعمي'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #0F1117, #1a1a2e)',
    padding: '24px', direction: 'rtl',
  },
  card: {
    background: 'white', borderRadius: '24px',
    width: '100%', maxWidth: '480px',
    overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
  },
  header: {
    background: 'linear-gradient(135deg, #FF6B35, #E85A24)',
    padding: '28px 32px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
  },
  logoMark: {
    width: '44px', height: '44px', borderRadius: '12px',
    background: 'rgba(255,255,255,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Cairo, sans-serif', fontWeight: '900', fontSize: '18px', color: 'white',
  },
  headerTitle: {
    fontFamily: 'Cairo, sans-serif', fontWeight: '900',
    fontSize: '22px', color: 'white',
  },
  headerSub: { fontSize: '14px', color: 'rgba(255,255,255,0.8)' },
  stepBody: { padding: '28px 32px 32px' },
  stepTitle: {
    fontFamily: 'Cairo, sans-serif', fontWeight: '900',
    fontSize: '20px', color: '#0F1117',
    textAlign: 'center', marginBottom: '20px',
  },
  formGroup: { marginBottom: '14px' },
  label: {
    display: 'block', fontSize: '13px', fontWeight: '700',
    color: '#0F1117', marginBottom: '7px',
  },
  input: {
    width: '100%', padding: '11px 13px',
    border: '1.5px solid #E5E7EB', borderRadius: '11px',
    fontFamily: 'Tajawal, sans-serif', fontSize: '14px',
    color: '#0F1117', background: '#F8F9FB',
    outline: 'none', textAlign: 'right', direction: 'rtl',
  },
  slugWrap: {
    display: 'flex', border: '1.5px solid #E5E7EB',
    borderRadius: '11px', overflow: 'hidden',
  },
  slugPrefix: {
    padding: '11px 12px', background: '#E5E7EB',
    fontSize: '13px', fontWeight: '600', color: '#6B7280',
    whiteSpace: 'nowrap', borderLeft: '1.5px solid #E5E7EB',
    direction: 'ltr',
  },
  colorGrid: {
    display: 'flex', gap: '10px', flexWrap: 'wrap',
    justifyContent: 'center', padding: '8px 0',
  },
  btn: {
    width: '100%', padding: '13px',
    borderRadius: '12px', border: 'none',
    background: 'linear-gradient(135deg, #FF6B35, #E85A24)',
    color: 'white',
    fontFamily: 'Cairo, sans-serif', fontWeight: '800', fontSize: '15px',
    cursor: 'pointer', boxShadow: '0 6px 20px rgba(255,107,53,0.35)',
  },
  backBtn: {
    padding: '13px 20px', borderRadius: '12px',
    border: '1.5px solid #E5E7EB', background: 'transparent',
    fontFamily: 'Cairo, sans-serif', fontWeight: '600', fontSize: '14px',
    color: '#6B7280', cursor: 'pointer',
  },
}
