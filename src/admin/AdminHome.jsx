import { useAuthStore } from '../store/authStore'

// شريحة رأسية دنيا (Walking Skeleton) لإثبات سلسلة مصادقة المشرف end-to-end.
// تُستبدل بالقشرة الكاملة (AdminShell) في M1.3.
export default function AdminHome() {
  const { user, platformRole } = useAuthStore()
  const name = user?.user_metadata?.full_name || user?.email || 'مشرف'
  return (
    <div style={{ minHeight:'100vh', background:'#0B0D12', color:'white', fontFamily:'Cairo,sans-serif', direction:'rtl', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'18px', padding:'24px', textAlign:'center' }}>
      <div style={{ fontSize:'12px', letterSpacing:'2px', color:'#7C3AED', fontWeight:'800' }}>SIMSIM · PLATFORM</div>
      <div style={{ fontSize:'40px' }}>🛡️</div>
      <div style={{ fontSize:'20px', fontWeight:'900' }}>لوحة تحكّم المنصّة (Super Admin)</div>
      <div style={{ fontSize:'14px', color:'#9CA3AF', lineHeight:1.8, maxWidth:'360px' }}>
        أهلاً {name}. أنت مشرف منصّة بدور <span style={{ color:'#A78BFA', fontWeight:'800' }}>{platformRole || '—'}</span>.
        <br/>الأساس المعماري جاهز — القشرة والوحدات قيد البناء.
      </div>
    </div>
  )
}
