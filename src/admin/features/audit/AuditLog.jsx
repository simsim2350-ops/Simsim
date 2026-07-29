import { useCallback, useEffect, useRef, useState } from 'react'
import AdminShell from '../../AdminShell'
import { listAuditLogs, auditActions } from './auditApi'
import { PANEL as CARD, BORDER, MUTED, ACCENT } from '../../theme'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { SkeletonRows } from '../../components/ui/Skeleton'

const PAGE_SIZE = 50

const ACTION_LABELS = {
  'restaurant.set_active': '🏪 تعليق/تفعيل مطعم',
  'restaurant.set_plan': '💳 تغيير خطة مطعم',
  'restaurant.set_platform_suspended': '🚫 تعليق منصّة',
  'plan.create': '🏷️ إنشاء باقة', 'plan.update': '🏷️ تعديل باقة', 'plan.set_active': '🏷️ تفعيل/تعطيل باقة',
  'subscription.create': '🔁 إنشاء اشتراك', 'subscription.update': '🔁 تعديل اشتراك',
  'invoice.create': '🧾 إنشاء فاتورة', 'invoice.mark_paid': '🧾 تعليم فاتورة مدفوعة', 'invoice.void': '🧾 إلغاء فاتورة',
  'admin.create': '🛡️ إنشاء مشرف', 'admin.update': '🛡️ تعديل مشرف', 'admin.revoke': '🛡️ إلغاء مشرف',
  'role.create': '🎭 إنشاء دور', 'role.update': '🎭 تعديل دور', 'role.delete': '🎭 حذف دور',
}
const label = (a) => ACTION_LABELS[a] || a
const fmtTime = (iso) => iso ? new Date(iso).toLocaleString('ar', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

// Diff: مفاتيح تغيّرت بين القديم والجديد (لعرض جدول تغييرات مقروء)
function diffRows(oldV, newV) {
  const keys = new Set([...(oldV ? Object.keys(oldV) : []), ...(newV ? Object.keys(newV) : [])])
  const out = []
  for (const k of keys) {
    const a = oldV?.[k]; const b = newV?.[k]
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ k, a, b })
  }
  return out
}
const cell = (v) => v == null ? '—' : (typeof v === 'object' ? JSON.stringify(v) : String(v))

export default function AuditLog() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')
  const [openId, setOpenId] = useState(null)
  const reqRef = useRef(0)

  useEffect(() => { auditActions().then(setActions).catch(() => {}) }, [])

  const fetchPage = useCallback(async (opts, offset) => {
    const first = offset === 0
    const token = ++reqRef.current
    if (first) setLoading(true); else setLoadingMore(true)
    setError(null)
    try {
      const { rows: page, total: t } = await listAuditLogs({ ...opts, limit: PAGE_SIZE, offset })
      if (token !== reqRef.current) return
      setTotal(t); setRows((prev) => first ? page : [...prev, ...page])
    } catch (e) {
      if (token === reqRef.current) setError(e?.message || 'تعذّر التحميل')
    } finally {
      if (token === reqRef.current) { if (first) setLoading(false); else setLoadingMore(false) }
    }
  }, [])

  const reload = () => fetchPage({ search: q, action }, 0)
  useEffect(() => {
    const id = setTimeout(reload, 300)
    return () => clearTimeout(id)
  }, [q, action, fetchPage]) // eslint-disable-line react-hooks/exhaustive-deps

  const canLoadMore = rows.length < total
  const inputStyle = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '8px 12px', color: 'white', fontFamily: 'Tajawal,sans-serif', fontSize: '13px', outline: 'none' }

  return (
    <AdminShell active="audit" title="سجلّ التدقيق">
      <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div style={{ fontSize: '12.5px', color: MUTED, fontWeight: '700' }}>{loading ? '…' : `${rows.length} من ${total}`}</div>
          <div style={{ flex: 1 }} />
          <select value={action} onChange={(e) => setAction(e.target.value)} style={{ ...inputStyle, minWidth: '150px' }}>
            <option value="">كل الإجراءات</option>
            {actions.map((a) => <option key={a} value={a}>{label(a)}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث (إجراء/بريد/هدف)…" style={{ ...inputStyle, minWidth: '180px' }} />
        </div>

        {error ? (
          <ErrorState msg={error} onRetry={reload} />
        ) : loading ? (
          <SkeletonRows count={6} />
        ) : rows.length === 0 ? (
          <EmptyState msg="📜 لا سجلّات مطابقة." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '480px' }} role="list" aria-label="سجلّ تدقيق إجراءات المشرفين">
              {rows.map((r) => {
                const rows_ = diffRows(r.old_value, r.new_value)
                const open = openId === r.id
                const panelId = `audit-diff-${r.id}`
                return (
                  <div key={r.id} role="listitem" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '12px 14px' }}>
                    {rows_.length > 0 ? (
                      <button onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open} aria-controls={panelId}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', width: '100%', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'right' }}>
                        <div style={{ flex: 1, minWidth: '180px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '800', color: 'white', fontFamily: 'Cairo,sans-serif' }}>{label(r.action)}</div>
                          <div style={{ fontSize: '11.5px', color: MUTED, direction: 'ltr', textAlign: 'right' }}>{r.admin_email || '—'} · {r.role || '—'}</div>
                        </div>
                        <span style={{ fontSize: '11px', color: '#C4B5FD' }}>{open ? '▲ إخفاء التغيير' : '▼ عرض التغيير'}</span>
                        <div style={{ fontSize: '11px', color: MUTED, minWidth: '110px', textAlign: 'left', direction: 'ltr' }}>{fmtTime(r.created_at)}</div>
                      </button>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '180px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '800', color: 'white', fontFamily: 'Cairo,sans-serif' }}>{label(r.action)}</div>
                          <div style={{ fontSize: '11.5px', color: MUTED, direction: 'ltr', textAlign: 'right' }}>{r.admin_email || '—'} · {r.role || '—'}</div>
                        </div>
                        <div style={{ fontSize: '11px', color: MUTED, minWidth: '110px', textAlign: 'left', direction: 'ltr' }}>{fmtTime(r.created_at)}</div>
                      </div>
                    )}
                    {open && rows_.length > 0 && (
                      <div id={panelId} style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {rows_.map(({ k, a, b }) => (
                          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', flexWrap: 'wrap' }}>
                            <span style={{ color: MUTED, minWidth: '90px', direction: 'ltr', textAlign: 'right' }}>{k}</span>
                            <span style={{ color: '#FCA5A5' }}>{cell(a)}</span>
                            <span style={{ color: MUTED }}>←</span>
                            <span style={{ color: '#6EE7B7', fontWeight: '700' }}>{cell(b)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {!error && !loading && rows.length > 0 && canLoadMore && (
          <button onClick={() => fetchPage({ search: q, action }, rows.length)} disabled={loadingMore}
            style={{ marginTop: '8px', width: '100%', background: CARD, border: `1px solid ${ACCENT}55`, borderRadius: '12px', padding: '12px', color: '#C4B5FD', fontFamily: 'Cairo,sans-serif', fontSize: '12.5px', fontWeight: '800', cursor: loadingMore ? 'default' : 'pointer', opacity: loadingMore ? 0.6 : 1 }}>
            {loadingMore ? 'جارٍ…' : `تحميل المزيد (${total - rows.length})`}
          </button>
        )}
      </div>
    </AdminShell>
  )
}
