import { useEffect, useState } from 'react'
import AdminShell from '../../AdminShell'
import { listAuditLogs } from './auditApi'

const CARD = '#12141C', BORDER = 'rgba(255,255,255,0.08)', MUTED = '#9CA3AF', ACCENT = '#7C3AED'

const ACTION_LABELS = {
  'restaurant.set_active': '🏪 تعليق/تفعيل مطعم',
  'restaurant.set_plan': '💳 تغيير خطة مطعم',
}
// تلخيص قيمة إجراء (قديم/جديد) بشكل مقروء حسب النوع المعروف، وإلا JSON مختصر.
function summarize(v) {
  if (v == null) return '—'
  if (Object.prototype.hasOwnProperty.call(v, 'is_active')) return v.is_active ? 'نشط' : 'معلّق'
  if (Object.prototype.hasOwnProperty.call(v, 'plan')) return v.plan ?? '—'
  try { return JSON.stringify(v) } catch { return String(v) }
}
const fmtTime = (iso) => iso ? new Date(iso).toLocaleString('ar', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '—'

// عارض سجلّ التدقيق — M3.3. كل إجراء كتابة للمشرف يظهر هنا (من/ماذا/متى/قديم→جديد).
export default function AuditLog() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try { const data = await listAuditLogs(200); if (!cancelled) setRows(data) }
      catch (e) { if (!cancelled) setError(e?.message || 'تعذّر التحميل') }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <AdminShell active="audit" title="سجلّ التدقيق">
      <div style={{ padding:'20px', maxWidth:'1000px', margin:'0 auto' }}>
        {error ? (
          <div style={{ background:'#3B1113', border:'1px solid #7F1D1D', borderRadius:'12px', padding:'16px', color:'#FCA5A5', fontSize:'13px' }}>⚠️ {error}</div>
        ) : loading ? (
          <div style={{ color:MUTED, textAlign:'center', padding:'48px', fontSize:'13px' }}>جارٍ التحميل…</div>
        ) : rows.length === 0 ? (
          <div style={{ color:MUTED, textAlign:'center', padding:'48px', fontSize:'13px' }}>
            📜 لا سجلّات بعد — ستظهر هنا كل إجراءات المشرفين تلقائياً.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {rows.map(r => (
              <div key={r.id} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:'12px', padding:'12px 14px', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:'180px' }}>
                  <div style={{ fontSize:'13px', fontWeight:'800', color:'white', fontFamily:'Cairo,sans-serif' }}>
                    {ACTION_LABELS[r.action] || r.action}
                  </div>
                  <div style={{ fontSize:'11.5px', color:MUTED, direction:'ltr', textAlign:'right' }}>{r.admin_email || '—'} · {r.role || '—'}</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'12px' }}>
                  <span style={{ color:'#FCA5A5' }}>{summarize(r.old_value)}</span>
                  <span style={{ color:MUTED }}>←</span>
                  <span style={{ color:'#6EE7B7', fontWeight:'700' }}>{summarize(r.new_value)}</span>
                </div>
                <div style={{ fontSize:'11px', color:MUTED, minWidth:'110px', textAlign:'left', direction:'ltr' }}>{fmtTime(r.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
