import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

function initialEmail(location) {
  const query = new URLSearchParams(location.search)
  return location.state?.email || query.get('email') || ''
}

export default function VerifyEmail() {
  const location = useLocation()
  const navigate = useNavigate()
  const { resendVerificationEmail } = useAuthStore()
  const [email, setEmail] = useState(() => initialEmail(location))
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(Boolean(initialEmail(location)))

  const resend = async (event) => {
    event?.preventDefault()
    const normalized = email.trim().toLowerCase()
    if (!normalized) {
      toast.error('أدخل بريدك الإلكتروني لإرسال رابط التأكيد.')
      return
    }
    setSending(true)
    try {
      await resendVerificationEmail(normalized)
      setEmail(normalized)
      setSent(true)
      toast.success('أرسلنا رابط تأكيد جديدًا إلى بريدك الإلكتروني.')
    } catch (error) {
      toast.error(error?.message || 'تعذر إرسال رابط التأكيد. جرّب مرة أخرى.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={styles.page} dir="rtl">
      <main style={styles.card}>
        <div style={styles.icon} aria-hidden="true">✉️</div>
        <h1 style={styles.title}>تحقق من بريدك الإلكتروني</h1>
        <p style={styles.copy}>أرسلنا رابط تأكيد إلى بريدك. افتح الرسالة واضغط الرابط للعودة إلى SIMSIM وإكمال إعداد مطعمك.</p>

        <form onSubmit={resend} style={styles.form}>
          <label htmlFor="verification-email" style={styles.label}>البريد الإلكتروني</label>
          <input
            id="verification-email"
            type="email"
            value={email}
            onChange={(event) => { setEmail(event.target.value); setSent(false) }}
            placeholder="example@restaurant.com"
            autoComplete="email"
            style={styles.input}
          />
          {sent && email && <p style={styles.sent}>أُرسل الرابط إلى <b dir="ltr">{email}</b></p>}
          <button type="submit" disabled={sending} style={{ ...styles.primary, opacity: sending ? 0.75 : 1 }}>
            {sending ? 'جارٍ الإرسال…' : 'إعادة إرسال البريد'}
          </button>
        </form>

        <p style={styles.note}>لم تجد الرسالة؟ تحقق من مجلد الرسائل غير المرغوب فيها، ثم أعد الإرسال عند الحاجة.</p>
        <div style={styles.links}>
          <button type="button" onClick={() => navigate('/register')} style={styles.linkButton}>العودة للتسجيل ببريد آخر</button>
          <span style={styles.separator}>•</span>
          <Link to="/login" style={styles.link}>لديك حساب مؤكد؟ سجّل الدخول</Link>
        </div>
      </main>
    </div>
  )
}

const styles = {
  page: { minHeight:'100vh', display:'grid', placeItems:'center', padding:'24px', background:'linear-gradient(135deg,#0B0B0F,#1A1A2E)', fontFamily:'Tajawal,sans-serif' },
  card: { width:'100%', maxWidth:'450px', padding:'34px 28px', background:'#FFF', borderRadius:'22px', textAlign:'center', boxShadow:'0 24px 64px rgba(0,0,0,0.28)' },
  icon: { fontSize:'46px', lineHeight:1, marginBottom:'16px' },
  title: { margin:'0 0 10px', color:'#111827', fontSize:'24px', fontWeight:'900' },
  copy: { margin:'0', color:'#6B7280', fontSize:'14px', lineHeight:'1.85' },
  form: { textAlign:'right', marginTop:'24px' },
  label: { display:'block', marginBottom:'7px', color:'#374151', fontSize:'13px', fontWeight:'800' },
  input: { boxSizing:'border-box', width:'100%', minHeight:'46px', padding:'10px 12px', border:'1.5px solid #E5E7EB', borderRadius:'12px', background:'#F8F9FB', color:'#111827', direction:'ltr', textAlign:'left', fontFamily:'Tajawal,sans-serif', outline:'none' },
  sent: { margin:'8px 0 0', color:'#047857', fontSize:'12px', lineHeight:'1.6', textAlign:'right' },
  primary: { width:'100%', minHeight:'46px', marginTop:'14px', border:0, borderRadius:'12px', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'#FFF', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'14px', cursor:'pointer' },
  note: { margin:'18px 0 0', color:'#9CA3AF', fontSize:'12px', lineHeight:'1.7' },
  links: { display:'flex', justifyContent:'center', alignItems:'center', flexWrap:'wrap', gap:'8px', marginTop:'18px', fontSize:'13px' },
  linkButton: { border:0, padding:0, background:'none', color:'#FF6A00', fontFamily:'Tajawal,sans-serif', fontWeight:'800', cursor:'pointer' },
  link: { color:'#FF6A00', fontWeight:'800', textDecoration:'none' },
  separator: { color:'#D1D5DB' },
}
