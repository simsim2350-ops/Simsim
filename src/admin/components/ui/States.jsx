import { MUTED } from '../../theme'
import Button from './Button'

export function Loading() {
  return <div style={{ color: MUTED, textAlign: 'center', padding: '48px', fontSize: '13px' }}>جارٍ التحميل…</div>
}

export function EmptyState({ msg }) {
  return <div style={{ color: MUTED, textAlign: 'center', padding: '48px', fontSize: '13px' }}>{msg}</div>
}

// onRetry اختياري: يضيف زر "إعادة المحاولة" بدل ترك الخطأ طريقاً مسدوداً كما كان في كل الشاشات.
export function ErrorState({ msg, onRetry }) {
  return (
    <div style={{ background: '#3B1113', border: '1px solid #7F1D1D', borderRadius: '12px', padding: '16px', color: '#FCA5A5', fontSize: '13px' }}>
      <div>⚠️ {msg}</div>
      {onRetry && <Button variant="neutral" style={{ marginTop: '12px' }} onClick={onRetry}>إعادة المحاولة</Button>}
    </div>
  )
}
