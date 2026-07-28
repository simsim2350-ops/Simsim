import { PANEL, BORDER } from '../../theme'

// هياكل تحميل (Skeleton) تحلّ محلّ نص "جارٍ التحميل…" الثابت — تُهيّئ المستخدم لشكل
// المحتوى القادم بدل قفزة تخطيط كاملة (CLS) لحظة وصول البيانات. تحترم prefers-reduced-motion
// عبر admin-theme.css (.admin-skel).
export function SkeletonBlock({ width = '100%', height = '14px', radius = '6px', style }) {
  return <div className="admin-skel" style={{ width, height, borderRadius: radius, ...style }} />
}

// شبكة بطاقات KPI هيكلية — تطابق شكل بطاقات نظرة عامة/النمو/ملف المطعم.
export function SkeletonTiles({ count = 4 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '14px' }}>
          <SkeletonBlock width="65%" height="20px" style={{ marginBottom: '10px' }} />
          <SkeletonBlock width="45%" height="11px" />
        </div>
      ))}
    </div>
  )
}

// صفوف بطاقة هيكلية — تطابق شكل قوائم الباقات/المزايا/الإعلانات/المشرفين/الفواتير.
export function SkeletonRows({ count = 5 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <SkeletonBlock width="42%" height="14px" style={{ marginBottom: '8px' }} />
            <SkeletonBlock width="28%" height="10px" />
          </div>
          <SkeletonBlock width="60px" height="20px" />
        </div>
      ))}
    </div>
  )
}

// رسم بياني هيكلي — يطابق شكل مخططات الأعمدة (الطلبات/MRR).
export function SkeletonChart({ height = 130 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height }}>
      {Array.from({ length: 24 }).map((_, i) => (
        <SkeletonBlock key={i} height={`${20 + ((i * 37) % 70)}%`} radius="3px 3px 0 0" style={{ flex: '1 0 6px' }} />
      ))}
    </div>
  )
}
