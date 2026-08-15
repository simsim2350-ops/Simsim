import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { fetchUpgradeOptions } from '../lib/featuresApi'

// ============================================================================
// UpgradeModal — رسالة الترقية الموحّدة لسجل القدرات (PCR) — ADR-40 · M4
// ============================================================================
// تُعرض عند محاولة استخدام قدرة غير متاحة في باقة المطعم. تجلب الباقات المانحة
// كسولاً (feature_upgrade_options) وتتيح الانتقال لصفحة الاشتراك.
// تلتزم ADR-19: useBodyScrollLock (نافذة fixed inset:0).
export default function UpgradeModal({ feature, name, message, onClose }) {
  useBodyScrollLock()
  const navigate = useNavigate()
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetchUpgradeOptions(feature)
      .then((o) => { if (alive) { setOptions(o); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [feature])

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,17,23,0.55)', display: 'flex',
               alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        style={{ background: '#fff', borderRadius: 18, padding: 24, maxWidth: 400, width: '100%',
                 boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center' }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
        <h3 style={{ margin: '0 0 8px', fontSize: 20, color: '#0B0B0F' }}>{name || 'ميزة غير متاحة'}</h3>
        <p style={{ margin: '0 0 16px', color: '#555', fontSize: 15, lineHeight: 1.6 }}>
          {message || 'هذه الميزة غير متاحة في باقتك الحالية. رقِّ باقتك للاستفادة منها.'}
        </p>

        {loading ? (
          <p style={{ color: '#999', fontSize: 14 }}>جارٍ التحميل…</p>
        ) : options.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {options.map((o) => (
              <div key={o.plan_id}
                   style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            border: '1px solid #eee', borderRadius: 12, padding: '10px 14px' }}>
                <span style={{ fontWeight: 600, color: '#0B0B0F' }}>{o.plan_name}</span>
                <span style={{ color: '#E05D00', fontWeight: 700 }}>
                  {o.price} ﷼ / {o.billing_cycle === 'yearly' ? 'سنة' : 'شهر'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#999', fontSize: 14, marginBottom: 16 }}>تواصل معنا لترقية باقتك.</p>
        )}

        <button
          onClick={() => { onClose?.(); navigate('/billing') }}
          style={{ width: '100%', background: 'linear-gradient(135deg,#FF6A00,#E05D00)', color: '#fff',
                   border: 'none', borderRadius: 12, padding: '12px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
        >
          الانتقال إلى الاشتراك
        </button>
        <button
          onClick={onClose}
          style={{ width: '100%', background: 'transparent', color: '#888', border: 'none',
                   padding: '10px', fontSize: 14, cursor: 'pointer', marginTop: 4 }}
        >
          لاحقاً
        </button>
      </div>
    </div>
  )
}
