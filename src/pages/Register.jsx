import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { trackOwnerMilestone, trackRegistrationEvent } from '../lib/analytics'
import './Register.css'

// خريطة تحويل الحروف العربية إلى لاتينية لتوليد رابط منيو صالح من اسم عربي.
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

const emailIsValid = (email) => /^\S+@\S+\.\S+$/.test(email.trim())

function humanizeRegistrationError(error) {
  const message = String(error?.message || '').toLowerCase()
  if (message.includes('already registered') || message.includes('already exists') || message.includes('email address is already')) {
    return 'هذا البريد الإلكتروني مسجل بالفعل. جرّب تسجيل الدخول.'
  }
  if (message.includes('invalid email')) return 'أدخل بريدًا إلكترونيًا صحيحًا.'
  if (message.includes('password')) return 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.'
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return 'تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى.'
  }
  return 'تعذر إنشاء حسابك الآن. حاول مرة أخرى.'
}

export default function Register() {
  const navigate = useNavigate()
  const { signUp, fetchRestaurant, resumePendingRestaurant } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showSlugEdit, setShowSlugEdit] = useState(false)
  const [slugEdited, setSlugEdited] = useState(false)
  const [slugState, setSlugState] = useState('idle')
  const [form, setForm] = useState({ restaurantName:'', fullName:'', email:'', password:'', slug:'' })
  const [errors, setErrors] = useState({})

  const previewSlug = form.slug || slugify(form.restaurantName) || 'your-menu'

  const update = (key, value) => {
    setForm(current => ({ ...current, [key]: value }))
    setErrors(current => ({ ...current, [key]: undefined }))
    if (key === 'restaurantName' || key === 'slug') setSlugState('idle')
  }

  // عند تغيير اسم المطعم: نولّد الرابط تلقائيًا ما لم يعدّله المستخدم يدويًا.
  const onNameChange = (value) => {
    setForm(current => ({ ...current, restaurantName: value, slug: slugEdited ? current.slug : slugify(value) }))
    setErrors(current => ({ ...current, restaurantName: undefined }))
    setSlugState('idle')
  }

  const onSlugChange = (value) => {
    setSlugEdited(true)
    update('slug', value.toLowerCase().replace(/[^\w-]/g, ''))
  }

  const validate = () => {
    const nextErrors = {}
    if (!form.restaurantName.trim()) nextErrors.restaurantName = 'اكتب اسم مطعمك للمتابعة.'
    if (!form.email.trim()) nextErrors.email = 'أدخل بريدك الإلكتروني.'
    else if (!emailIsValid(form.email)) nextErrors.email = 'أدخل بريدًا إلكترونيًا صحيحًا.'
    if (!form.password) nextErrors.password = 'أدخل كلمة المرور.'
    else if (form.password.length < 8) nextErrors.password = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleCreate = async (event) => {
    event?.preventDefault()
    if (loading || !validate()) return

    let slug = form.slug || slugify(form.restaurantName)
    if (!slug) slug = `store-${Math.random().toString(36).slice(2, 7)}`

    setLoading(true)
    setSlugState('checking')
    try {
      // فحص مبكر لتحسين الرسالة فقط؛ RPC الاستئناف يعيد فحص slug تحت الجلسة لمنع السباق.
      const { data: taken, error: slugError } = await supabase
        .from('restaurants')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()

      if (slugError) throw slugError
      if (taken) {
        setSlugState('unavailable')
        setErrors(current => ({ ...current, slug: 'هذا الرابط مستخدم بالفعل. اختر رابطًا آخر.' }))
        setShowSlugEdit(true)
        return
      }

      setSlugState('available')
      trackRegistrationEvent('registration_started', { source: 'register' })
      await signUp(
        form.email.trim(),
        form.password,
        form.fullName.trim() || form.restaurantName.trim(),
        { name: form.restaurantName.trim(), slug },
      )

      // نية المطعم تعيش في user metadata حتى التأكيد؛ الاستئناف أدناه آمن وidempotent.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        trackRegistrationEvent('email_confirmation_required', { source: 'register' })
        navigate(`/verify-email?email=${encodeURIComponent(form.email.trim())}`, { state: { email: form.email.trim() }, replace:true })
        return
      }

      const { restaurant, error } = await resumePendingRestaurant()
      if (error || !restaurant?.id) {
        if (error?.code === '23505') {
          setSlugState('unavailable')
          setErrors(current => ({ ...current, slug: 'هذا الرابط أصبح مستخدمًا. اختر رابطًا آخر.' }))
          setShowSlugEdit(true)
          return
        }
        throw error || new Error('تعذر إنشاء المطعم')
      }

      await fetchRestaurant(user.id)
      trackOwnerMilestone('registration_completed', { restaurantId: restaurant.id, props: { email_confirmation: false } })
      trackOwnerMilestone('restaurant_created', { restaurantId: restaurant.id, props: { source: 'immediate_session' } })
      toast.success('تم إنشاء مطعمك. لنبدأ تجهيز المنيو.')
      navigate('/onboarding')
    } catch (error) {
      toast.error(humanizeRegistrationError(error))
    } finally {
      setLoading(false)
      setSlugState(current => current === 'checking' ? 'idle' : current)
    }
  }

  const fieldStyle = (hasError) => ({
    width:'100%', minHeight:'50px', padding:'12px 14px', border:`1.5px solid ${hasError ? '#EF4444' : '#DDE1E7'}`,
    borderRadius:'13px', fontFamily:'Tajawal,sans-serif', fontSize:'15px', lineHeight:'1.45',
    background: hasError ? '#FFF8F8' : '#FFFFFF', outline:'none', textAlign:'right', direction:'rtl', boxSizing:'border-box',
    color:'#15171B', transition:'border-color .16s ease, box-shadow .16s ease, background .16s ease',
  })

  return (
    <div className="register-page" dir="rtl">
      <main className="register-layout">
        <section className="register-panel" aria-labelledby="register-title">
          <div className="register-form-wrap">
            <Link to="/" className="register-brand" aria-label="العودة إلى الصفحة الرئيسية لسمسم">
              <img src="/simsim-s.svg" alt="" />
              <span className="register-brand-word">sim<span style={{ color:'#FF6A00' }}>sim</span></span>
            </Link>

            <span className="register-eyebrow">ابدأ من أساسيات منيوك</span>
            <h1 id="register-title" className="register-title">أنشئ مطعمك بسهولة</h1>
            <p className="register-subtitle">أدخل بياناتك الأساسية الآن، وأكمل تفاصيل المنيو على راحتك لاحقًا.</p>

            <form className="register-form" onSubmit={handleCreate} noValidate aria-busy={loading}>
              <div className="register-field">
                <label className="register-label" htmlFor="restaurant-name">اسم المطعم *</label>
                <input
                  id="restaurant-name"
                  className="register-input"
                  style={fieldStyle(errors.restaurantName)}
                  placeholder="مطعم البيت"
                  value={form.restaurantName}
                  onChange={event => onNameChange(event.target.value)}
                  aria-invalid={Boolean(errors.restaurantName)}
                  aria-describedby={errors.restaurantName ? 'restaurant-name-error' : 'restaurant-url-help'}
                  autoComplete="organization"
                  disabled={loading}
                />
                {errors.restaurantName && <p id="restaurant-name-error" className="register-error" role="alert">{errors.restaurantName}</p>}

                <div className="register-url-card" id="restaurant-url-help">
                  <span className="register-url">simsimmenu.com/menu/<strong>{previewSlug}</strong></span>
                  <button className="register-link-button" type="button" onClick={() => setShowSlugEdit(current => !current)} disabled={loading}>
                    {showSlugEdit ? 'إخفاء التعديل' : 'تعديل الرابط'}
                  </button>
                </div>

                {showSlugEdit && (
                  <input
                    id="restaurant-slug"
                    className="register-input"
                    style={{ ...fieldStyle(errors.slug), marginTop:'2px', direction:'ltr', textAlign:'left' }}
                    value={form.slug}
                    onChange={event => onSlugChange(event.target.value)}
                    placeholder="al-bait"
                    aria-label="رابط المنيو"
                    aria-invalid={Boolean(errors.slug)}
                    aria-describedby={errors.slug ? 'slug-error' : 'slug-status'}
                    disabled={loading}
                  />
                )}
                <div id="slug-status" className="register-slug-status" aria-live="polite" style={{ color: slugState === 'unavailable' ? '#D92D20' : slugState === 'available' ? '#15803D' : '#7E8793' }}>
                  {slugState === 'checking' && 'جارٍ التحقق من الرابط...'}
                  {slugState === 'available' && 'الرابط متاح.'}
                  {slugState === 'unavailable' && 'هذا الرابط غير متاح.'}
                  {slugState === 'idle' && 'سنتحقق من الرابط بأمان عند إنشاء المطعم.'}
                </div>
                {errors.slug && <p id="slug-error" className="register-error" role="alert">{errors.slug}</p>}
              </div>

              <div className="register-field">
                <label className="register-label" htmlFor="full-name">اسمك <span className="register-optional">(اختياري)</span></label>
                <input id="full-name" className="register-input" style={fieldStyle(false)} placeholder="محمد" value={form.fullName} onChange={event => update('fullName', event.target.value)} autoComplete="name" disabled={loading} />
              </div>

              <div className="register-field">
                <label className="register-label" htmlFor="register-email">البريد الإلكتروني *</label>
                <input
                  id="register-email"
                  className="register-input"
                  style={{ ...fieldStyle(errors.email), direction:'ltr', textAlign:'left' }}
                  type="email"
                  placeholder="example@restaurant.com"
                  value={form.email}
                  onChange={event => update('email', event.target.value)}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  autoComplete="email"
                  inputMode="email"
                  disabled={loading}
                />
                {errors.email && <p id="email-error" className="register-error" role="alert">{errors.email}</p>}
              </div>

              <div className="register-field">
                <label className="register-label" htmlFor="register-password">كلمة المرور *</label>
                <div className="register-password-wrap">
                  <input
                    id="register-password"
                    className="register-input"
                    style={fieldStyle(errors.password)}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="8 أحرف على الأقل"
                    value={form.password}
                    onChange={event => update('password', event.target.value)}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'password-error' : 'password-help'}
                    autoComplete="new-password"
                    disabled={loading}
                  />
                  <button className="register-password-toggle" type="button" onClick={() => setShowPassword(current => !current)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-pressed={showPassword} disabled={loading}>
                    {showPassword ? '◉' : '◌'}
                  </button>
                </div>
                {errors.password ? <p id="password-error" className="register-error" role="alert">{errors.password}</p> : <p id="password-help" className="register-helper">استخدم 8 أحرف على الأقل لحماية حسابك.</p>}
              </div>

              <button className="register-cta" type="submit" disabled={loading}>
                {loading ? 'جارٍ إنشاء مطعمك...' : 'أنشئ مطعمي مجانًا'}
              </button>
            </form>

            <p className="register-trust">ابدأ مجانًا — بدون بطاقة بنكية.</p>
            <p className="register-login">لديك حساب؟ <Link to="/login" className="register-login-link">سجّل دخولك</Link></p>
          </div>
        </section>

        <aside className="register-marketing" aria-label="مزايا سمسم">
          <div className="register-marketing-inner">
            <div className="register-marketing-icon" aria-hidden="true">⌁</div>
            <h2>منيو مطعمك الاحترافي<br /><span>يبدأ من هنا</span></h2>
            <p>أنشئ منيوًا رقميًا احترافيًا، شاركه عبر QR Code واجعل الوصول إلى أصنافك بسيطًا لعملائك.</p>
            <ul className="register-benefits">
              <li><span className="register-benefit-check" aria-hidden="true">✓</span>منيو رقمي احترافي</li>
              <li><span className="register-benefit-check" aria-hidden="true">✓</span>QR Code جاهز للمشاركة</li>
              <li><span className="register-benefit-check" aria-hidden="true">✓</span>ابدأ مجانًا بدون بطاقة بنكية</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  )
}
