import { useEffect, useRef, useState } from 'react'
import { getRestaurantAnnouncements, markAnnouncementsRead } from '../lib/announcements'

// جرس إشعارات المطعم في التوب-بار — يعرض إعلانات المنصّة المستهدِفة لهذا المطعم.
// نموذج «مقروء»: شارة عدد غير المقروء، والإعلانات تبقى في القائمة بعد القراءة.
const TYPE_META = {
  info:        { icon: 'ℹ️', color: '#2563EB' },
  warning:     { icon: '⚠️', color: '#D97706' },
  maintenance: { icon: '🛠️', color: '#DC2626' },
}
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('ar', { day: 'numeric', month: 'short' }) : ''

export default function NotificationsBell() {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const load = () => { getRestaurantAnnouncements().then(setItems).catch(() => {}) }
  useEffect(() => { load() }, [])

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const unread = items.filter((a) => !a.read).length

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && unread > 0) {
      // تفاؤلياً: علّمها مقروءة محلياً ثم على الخادم
      setItems((xs) => xs.map((a) => ({ ...a, read: true })))
      try { await markAnnouncementsRead() } catch { /* تُعاد المحاولة عند التحميل التالي */ }
    }
  }

  if (items.length === 0) return null

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button onClick={toggle} title="الإشعارات" style={{
        position: 'relative', background: 'none', border: 'none', cursor: 'pointer', fontSize: '19px',
        lineHeight: 1, padding: '4px', color: '#374151',
      }}>
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: '-2px', left: '-2px', minWidth: '16px', height: '16px', padding: '0 4px',
            background: '#EF4444', color: 'white', borderRadius: '100px', fontSize: '10px', fontWeight: '800',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Tajawal,sans-serif',
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: '320px', maxWidth: '86vw',
          background: 'white', border: '1px solid #E5E7EB', borderRadius: '14px', boxShadow: '0 12px 34px rgba(0,0,0,0.14)',
          zIndex: 60, overflow: 'hidden', direction: 'rtl',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F3F4F6', fontFamily: 'Tajawal,sans-serif', fontWeight: '800', fontSize: '13.5px', color: '#0B0B0F' }}>
            الإشعارات
          </div>
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {items.map((a) => {
              const meta = TYPE_META[a.type] || TYPE_META.info
              return (
                <div key={a.id} style={{ display: 'flex', gap: '10px', padding: '12px 14px', borderBottom: '1px solid #F3F4F6' }}>
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>{meta.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'Tajawal,sans-serif', fontWeight: '700', fontSize: '13px', color: '#0B0B0F', marginBottom: '2px' }}>{a.title}</div>
                    {a.body && <div style={{ fontSize: '12px', color: '#6B7280', lineHeight: 1.6, marginBottom: '3px' }}>{a.body}</div>}
                    <div style={{ fontSize: '10.5px', color: '#9CA3AF' }}>{fmtDate(a.created_at)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
