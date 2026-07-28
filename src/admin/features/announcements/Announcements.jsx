import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import AdminShell from '../../AdminShell'
import { listAnnouncements, upsertAnnouncement, deleteAnnouncement, can } from './announcementsApi'
import { ACCENT, MUTED, BORDER } from '../../theme'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Field from '../../components/ui/Field'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { SkeletonRows } from '../../components/ui/Skeleton'

const CARD = '#12141C'
const PLANS = ['starter', 'pro', 'business']
const TYPES = [['info', 'ℹ️ معلومة', '#60A5FA'], ['warning', '⚠️ تحذير', '#FBBF24'], ['maintenance', '🛠️ صيانة', '#F87171']]
const typeMeta = (t) => TYPES.find((x) => x[0] === t) || TYPES[0]
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' }) : null

const EMPTY = { title: '', body: '', type: 'info', target_scope: 'all', target_plans: [], is_active: true, starts_at: '', ends_at: '' }
// تحويل timestamptz إلى قيمة input[type=date] (yyyy-mm-dd) والعكس
const toDateInput = (v) => v ? new Date(v).toISOString().slice(0, 10) : ''

export default function Announcements() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [canManage, setCanManage] = useState(false)
  const [edit, setEdit] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true); setError(null)
    listAnnouncements().then(setRows).catch((e) => setError(e?.message || 'تعذّر التحميل')).finally(() => setLoading(false))
  }
  useEffect(() => { load(); can('manage_announcements').then(setCanManage).catch(() => {}) }, [])

  const save = async () => {
    if (!edit.title?.trim()) return toast.error('العنوان مطلوب')
    if (edit.target_scope === 'plan' && (edit.target_plans || []).length === 0) return toast.error('اختر خطة واحدة على الأقل')
    setBusy(true)
    try { await upsertAnnouncement(edit); toast.success('تم الحفظ'); setEdit(null); load() }
    catch (e) { toast.error(e?.message || 'فشل') } finally { setBusy(false) }
  }
  const doDelete = async () => {
    setBusy(true)
    try { await deleteAnnouncement(confirm.id); toast.success('حُذف الإعلان'); setConfirm(null); load() }
    catch (e) { toast.error(e?.message || 'فشل') } finally { setBusy(false) }
  }
  const quickToggle = async (a) => {
    try { await upsertAnnouncement({ ...a, is_active: !a.is_active, starts_at: toDateInput(a.starts_at), ends_at: toDateInput(a.ends_at) }); load() }
    catch (e) { toast.error(e?.message || 'فشل') }
  }
  const togglePlan = (p) => {
    const has = edit.target_plans.includes(p)
    setEdit({ ...edit, target_plans: has ? edit.target_plans.filter((x) => x !== p) : [...edit.target_plans, p] })
  }
  const openEdit = (a) => setEdit(a
    ? { ...a, target_plans: [...(a.target_plans || [])], starts_at: toDateInput(a.starts_at), ends_at: toDateInput(a.ends_at) }
    : { ...EMPTY })

  return (
    <AdminShell active="announcements" title="📢 الإعلانات">
      <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ fontSize: '12.5px', color: MUTED, marginBottom: '16px', lineHeight: 1.7 }}>
          إعلانات المنصّة لأصحاب المطاعم — للكل أو حسب الخطة، مع نوع ونافذة زمنية اختيارية.
        </div>
        {canManage && (
          <div style={{ marginBottom: '14px' }}>
            <Button variant="primary" onClick={() => openEdit(null)}>+ إعلان جديد</Button>
          </div>
        )}

        {loading ? <SkeletonRows count={4} /> : error ? <ErrorState msg={error} onRetry={load} /> : rows.length === 0 ? (
          <EmptyState msg="لا إعلانات بعد." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {rows.map((a) => {
              const [, tLabel, tColor] = typeMeta(a.type)
              const from = fmtDate(a.starts_at), to = fmtDate(a.ends_at)
              return (
                <div key={a.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '14px', color: 'white' }}>{a.title}</span>
                      <span style={{ fontSize: '10px', fontWeight: '800', color: tColor }}>{tLabel}</span>
                      {!a.is_active && <span style={{ fontSize: '10px', fontWeight: '800', color: '#F87171', background: 'rgba(239,68,68,0.12)', borderRadius: '100px', padding: '2px 9px' }}>معطّل</span>}
                      <span style={{ fontSize: '10px', fontWeight: '800', color: '#C4B5FD', background: 'rgba(124,58,237,0.15)', borderRadius: '100px', padding: '2px 9px' }}>
                        {a.target_scope === 'all' ? 'كل المطاعم' : (a.target_plans || []).join('، ') || 'بلا خطة'}
                      </span>
                    </div>
                    {a.body && <div style={{ fontSize: '12px', color: '#D1D5DB', marginBottom: '4px', lineHeight: 1.6 }}>{a.body}</div>}
                    {(from || to) && <div style={{ fontSize: '11px', color: MUTED }}>{from ? `من ${from}` : ''}{to ? ` حتى ${to}` : ''}</div>}
                  </div>
                  {canManage && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <Button variant={a.is_active ? 'neutral' : 'success'} onClick={() => quickToggle(a)}>{a.is_active ? 'تعطيل' : 'تفعيل'}</Button>
                      <Button variant="neutral" onClick={() => openEdit(a)}>تعديل</Button>
                      <Button variant="danger" onClick={() => setConfirm(a)}>حذف</Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {edit && (
        <Modal title={edit.id ? 'تعديل إعلان' : 'إعلان جديد'} onClose={() => setEdit(null)}>
          <Field label="العنوان"><input className="admin-input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
          <Field label="النص (اختياري)">
            <textarea className="admin-textarea" style={{ minHeight: '70px', resize: 'vertical' }} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
          </Field>
          <Field label="النوع">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {TYPES.map(([k, label, color]) => (
                <button key={k} onClick={() => setEdit({ ...edit, type: k })} style={{
                  padding: '7px 12px', borderRadius: '9px', cursor: 'pointer', fontSize: '12px', fontWeight: '800', fontFamily: 'Cairo,sans-serif',
                  border: `1px solid ${edit.type === k ? color : BORDER}`, background: edit.type === k ? `${color}22` : 'transparent', color: edit.type === k ? color : MUTED,
                }}>{label}</button>
              ))}
            </div>
          </Field>
          <Field label="الاستهداف">
            <div style={{ display: 'flex', gap: '8px', marginBottom: edit.target_scope === 'plan' ? '10px' : 0 }}>
              {[['all', 'كل المطاعم'], ['plan', 'حسب الخطة']].map(([k, label]) => (
                <button key={k} onClick={() => setEdit({ ...edit, target_scope: k })} style={{
                  padding: '7px 12px', borderRadius: '9px', cursor: 'pointer', fontSize: '12px', fontWeight: '800', fontFamily: 'Cairo,sans-serif',
                  border: `1px solid ${edit.target_scope === k ? ACCENT : BORDER}`, background: edit.target_scope === k ? 'rgba(124,58,237,0.18)' : 'transparent', color: edit.target_scope === k ? '#C4B5FD' : MUTED,
                }}>{label}</button>
              ))}
            </div>
            {edit.target_scope === 'plan' && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {PLANS.map((p) => (
                  <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#D1D5DB', cursor: 'pointer', border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '6px 10px' }}>
                    <input type="checkbox" checked={edit.target_plans.includes(p)} onChange={() => togglePlan(p)} style={{ accentColor: ACCENT }} />
                    {p}
                  </label>
                ))}
              </div>
            )}
          </Field>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Field label="يبدأ (اختياري)"><input type="date" className="admin-input" value={edit.starts_at} onChange={(e) => setEdit({ ...edit, starts_at: e.target.value })} /></Field>
            <Field label="ينتهي (اختياري)"><input type="date" className="admin-input" value={edit.ends_at} onChange={(e) => setEdit({ ...edit, ends_at: e.target.value })} /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '16px', cursor: 'pointer', fontSize: '13px', color: '#D1D5DB' }}>
            <input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} style={{ width: '16px', height: '16px', accentColor: ACCENT }} />
            نشِط
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="primary" style={{ flex: 1, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>{busy ? '…' : 'حفظ'}</Button>
            <Button variant="neutral" disabled={busy} onClick={() => setEdit(null)}>إلغاء</Button>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal title="حذف إعلان" onClose={() => setConfirm(null)}>
          <div style={{ fontSize: '13px', color: '#D1D5DB', marginBottom: '16px' }}>حذف الإعلان «{confirm.title}»؟</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="danger" style={{ flex: 1, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={doDelete}>{busy ? '…' : 'حذف'}</Button>
            <Button variant="neutral" disabled={busy} onClick={() => setConfirm(null)}>إلغاء</Button>
          </div>
        </Modal>
      )}
    </AdminShell>
  )
}
