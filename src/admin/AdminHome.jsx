import { useAuthStore } from '../store/authStore'
import AdminShell from './AdminShell'

// نظرة عامة (Overview) داخل قشرة المنصّة. لوحة المؤشّرات الحقيقية (KPIs) تأتي في M2.
export default function AdminHome() {
  const { user, platformRole } = useAuthStore()
  const name = user?.user_metadata?.full_name || user?.email || 'مشرف'
  return (
    <AdminShell active="overview" title="نظرة عامة">
      <div style={{ padding:'22px', maxWidth:'900px', margin:'0 auto' }}>
        <div style={{ background:'#12141C', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'24px' }}>
          <div style={{ fontSize:'28px', marginBottom:'10px' }}>🛡️</div>
          <div style={{ fontSize:'19px', fontWeight:'900', fontFamily:'Cairo,sans-serif', color:'white', marginBottom:'6px' }}>
            أهلاً {name}
          </div>
          <div style={{ fontSize:'13.5px', color:'#9CA3AF', lineHeight:1.9 }}>
            أنت مشرف منصّة بدور <span style={{ color:'#A78BFA', fontWeight:'800' }}>{platformRole || '—'}</span>.
            <br/>الأساس المعماري جاهز (مصادقة · أدوار · تدقيق · Feature Flags · قشرة مستقلة).
            <br/>الوحدات التالية (لوحة المؤشّرات · إدارة المطاعم · الفوترة) قيد البناء.
          </div>
        </div>
      </div>
    </AdminShell>
  )
}
