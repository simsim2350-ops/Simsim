import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { trackOwnerMilestone } from '../lib/analytics'

function callbackError() {
  const query = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return query.get('error_description') || query.get('error') || hash.get('error_description') || hash.get('error') || ''
}

export default function AuthCallback() {
  const navigate = useNavigate()
  const { fetchRestaurant, resumePendingRestaurant } = useAuthStore()
  const [status, setStatus] = useState('processing')
  const [message, setMessage] = useState('نتحقق من رابط التأكيد ونجهّز حسابك…')

  useEffect(() => {
    let cancelled = false

    const finish = async (session) => {
      if (cancelled || !session?.user) return false
      try {
        const pendingRestaurant = session.user.user_metadata?.pending_restaurant
        const { restaurant: resumed, error } = await resumePendingRestaurant()
        if (cancelled) return true
        if (error) throw error

        await fetchRestaurant(session.user.id)
        if (cancelled) return true
        const restaurant = resumed || useAuthStore.getState().restaurant

        if (resumed?.id && pendingRestaurant?.name && pendingRestaurant?.slug) {
          trackOwnerMilestone('registration_completed', { restaurantId: resumed.id, props: { email_confirmation: true } })
          trackOwnerMilestone('restaurant_created', { restaurantId: resumed.id, props: { source: 'email_confirmation' } })
        }

        if (restaurant?.onboarding_completed) {
          navigate('/dashboard', { replace:true })
        } else {
          navigate('/onboarding', { replace:true })
        }
        return true
      } catch (error) {
        if (cancelled) return true
        const text = String(error?.message || '')
        if (error?.code === '23505' || text.includes('pending_restaurant_slug_taken')) {
          setMessage('رابط المنيو المحفوظ أصبح مستخدمًا. سجّل الدخول لإكمال إعداد مطعمك واختيار رابط جديد.')
        } else {
          setMessage('تعذر إكمال تأكيد البريد الآن. جرّب طلب رابط تأكيد جديد.')
        }
        setStatus('error')
        return true
      }
    }

    const start = async () => {
      const invalid = callbackError()
      if (invalid) {
        setMessage('رابط التأكيد غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا ثم حاول مرة أخرى.')
        setStatus('error')
        return
      }

      const query = new URLSearchParams(window.location.search)
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const code = query.get('code')

      // روابط PKCE تعيد code في query ولا تؤسس Session حتى نستبدله صراحةً.
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setMessage('رابط التأكيد غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا ثم حاول مرة أخرى.')
          setStatus('error')
          return
        }
        if (await finish(data.session)) return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (await finish(session)) return

      // رابط callback بلا code أو access token لا يملك دليلاً يمكن استبداله بجلسة.
      if (!hash.get('access_token')) {
        setMessage('رابط التأكيد غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا ثم حاول مرة أخرى.')
        setStatus('error')
        return
      }

      const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') finish(nextSession)
      })

      return () => listener.subscription.unsubscribe()
    }

    let cleanup
    start().then((unsubscribe) => { cleanup = unsubscribe })
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [fetchRestaurant, navigate, resumePendingRestaurant])

  return (
    <div style={styles.page} dir="rtl">
      <style>{`@keyframes auth-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={styles.panel} role="status" aria-live="polite">
        {status === 'processing' ? <div style={styles.spinner} aria-hidden="true" /> : <div style={styles.errorIcon} aria-hidden="true">!</div>}
        <h1 style={styles.title}>{status === 'processing' ? 'جارٍ تأكيد بريدك الإلكتروني' : 'تعذر تأكيد البريد'}</h1>
        <p style={styles.copy}>{message}</p>
        {status === 'error' && (
          <div style={styles.actions}>
            <button type="button" onClick={() => navigate('/verify-email')} style={styles.primary}>إرسال رابط جديد</button>
            <button type="button" onClick={() => navigate('/login')} style={styles.secondary}>العودة لتسجيل الدخول</button>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight:'100vh', display:'grid', placeItems:'center', padding:'24px', background:'linear-gradient(135deg,#0B0B0F,#1A1A2E)', fontFamily:'Tajawal,sans-serif' },
  panel: { width:'100%', maxWidth:'420px', padding:'34px 28px', background:'white', borderRadius:'22px', textAlign:'center', boxShadow:'0 24px 64px rgba(0,0,0,0.28)' },
  spinner: { width:'44px', height:'44px', margin:'0 auto 18px', border:'3px solid #FDE2CD', borderTopColor:'#FF6A00', borderRadius:'50%', animation:'auth-spin 0.8s linear infinite' },
  errorIcon: { width:'44px', height:'44px', display:'grid', placeItems:'center', margin:'0 auto 18px', borderRadius:'14px', background:'#FEF2F2', color:'#B91C1C', fontWeight:'900', fontSize:'24px' },
  title: { margin:'0 0 8px', color:'#111827', fontSize:'21px', fontWeight:'900' },
  copy: { margin:'0', color:'#6B7280', fontSize:'14px', lineHeight:'1.8' },
  actions: { display:'grid', gap:'10px', marginTop:'22px' },
  primary: { minHeight:'44px', border:0, borderRadius:'12px', background:'#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'900', cursor:'pointer' },
  secondary: { minHeight:'44px', border:'1px solid #E5E7EB', borderRadius:'12px', background:'white', color:'#374151', fontFamily:'Tajawal,sans-serif', fontWeight:'800', cursor:'pointer' },
}
