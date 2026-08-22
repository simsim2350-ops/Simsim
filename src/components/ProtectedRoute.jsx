import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export function PageLoader({ phase = 'AUTH_SESSION' }) {
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0B0B0F', color:'white', gap:'12px', fontFamily:'Tajawal,sans-serif' }} role="status" aria-live="polite">
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,106,0,0.3)', borderTopColor:'#FF6A00', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <strong style={{ fontSize:'16px' }}>جارٍ تجهيز حسابك…</strong>
      <span style={{ color:'#B7BBC3', fontSize:'12px' }}>مرحلة التهيئة: {phase}</span>
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
