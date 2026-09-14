import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import SimsimLoader from './SimsimLoader'

// phase يبقى في التوقيع (يُمرَّر من كل نقاط الاستدعاء الحالية عبر bootstrapStage) رغم
// أنه لم يعد يُعرَض بصرياً — تفادياً لتعديل أي موضع استدعاء لهذا المكوّن؛ التشخيص
// النصي القديم استُبدل بتجربة SIMSIM البسيطة (SimsimLoader) دون أي نص تقني ظاهر.
export function PageLoader({ phase = 'AUTH_SESSION' }) { // eslint-disable-line no-unused-vars
  return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0B0B0F' }} role="status" aria-live="polite" aria-label="جارٍ تجهيز حسابك">
      <SimsimLoader />
    </div>
  )
}

export function AuthBootstrapError({ error, onRetry }) {
  return (
    <div dir="rtl" style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0B0B0F', padding:'24px', fontFamily:'Tajawal,sans-serif' }}>
      <div role="alert" style={{ width:'100%', maxWidth:'420px', background:'white', borderRadius:'18px', padding:'26px', textAlign:'center' }}>
        <div aria-hidden="true" style={{ width:'46px', height:'46px', display:'grid', placeItems:'center', margin:'0 auto 12px', borderRadius:'14px', background:'#FEF2F2', color:'#B91C1C', fontSize:'24px', fontWeight:'900' }}>!</div>
        <h1 style={{ margin:'0 0 8px', color:'#111827', fontSize:'20px', fontWeight:'900' }}>تعذر تجهيز حسابك</h1>
        <p style={{ margin:'0 0 18px', color:'#6B7280', fontSize:'14px', lineHeight:'1.75' }}>لم تكتمل تهيئة بيانات الحساب. تحقق من اتصالك ثم أعد المحاولة.</p>
        <button type="button" onClick={onRetry} style={{ width:'100%', minHeight:'46px', border:0, borderRadius:'12px', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'inherit', fontWeight:'900', cursor:'pointer' }}>إعادة المحاولة</button>
        {error?.code && <div style={{ marginTop:'10px', color:'#9CA3AF', fontSize:'11px' }}>رمز التشخيص: {error.code}</div>}
      </div>
    </div>
  )
}

export default function ProtectedRoute({ children }) {
  const { user, loading, authState, authError, bootstrapStage, initialize } = useAuthStore()
  if (authState === 'ERROR') return <AuthBootstrapError error={authError} onRetry={() => void initialize()} />
  if (loading) return <PageLoader phase={bootstrapStage} />
  if (!user) return <Navigate to="/login" replace />
  return children
}
