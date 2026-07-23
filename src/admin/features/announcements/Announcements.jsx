import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import AdminShell from '../../AdminShell'
import { listAnnouncements, upsertAnnouncement, deleteAnnouncement, can } from './announcementsApi'

const CARD = '#12141C', BORDER = 'rgba(255,255,255,0.08)', MUTED = '#9CA3AF', ACCENT = '#7C3AED'
const PLANS = ['starter', 'pro', 'business']
const TYPES = [['info', 'ℹ️ معلومة', '#60A5FA'], ['warning', '⚠️ تحذير', '#FBBF24'], ['maintenance', '🛠️ صيانة', '#F87171']]
const typeMeta = (t) => TYPES.find((x) => x[0] === t) || TYPES[0]
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' }) : null

const inputStyle = {
  background: '#0B0D12', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '9px 12px',
  color: 'white', fontFamily: 'Tajawal,sans-serif', fontSize: '13px', outline: 'none', width: '100%',
}
const btn = (bg) => ({
  padding: '9px 15px', borderRadius: '10px', border: 'none', cursor: 'pointer',
  fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '12.5px', color: 'white', background: bg,
})
const Loading = () => <div style={{ color: MUTED, textAlign: 'center', padding: '48px', fontSize: '13px' }}>جارٍ التحميل…</div>
const ErrBox = ({ msg }) => <div style={{ background: '#3B1113', border: '1px solid #7F1D1D', borderRadius: '12px', padding: '16px', color: '#FCA5A5', fontSize: '13px' }}>⚠️ {msg}</div>

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} />
      <div style={{ position: 'relative', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '20px', width: '100%', maxWidth: '480px', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ fontSize: '15px', fontWeight: '900', color: 'white', fontFamily: 'Cairo,sans-serif', marginBottom: '16px' }}>{title}</div>
        {children}
      </div>
    </div>
  )
}
function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: '12px' }}>
      <span style={{ display: 'block', fontSize: '11.5px', color: MUTED, fontWeight: '700', marginBottom: '6px' }}>{label}</span>
      {children}
    </label>
  )
}

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
    setLoading(true)
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
            <button style={btn(ACCENT)} onClick={() => openEdit(null)}>+ إعلان جديد</button>
          </div>
        )}

        {loading ? <Loading /> : error ? <ErrBox msg={error} /> : rows.length === 0 ? (
          <div style={{ color: MUTED, textAlign: 'center', padding: '48px', fontSize: '13px' }}>لا إعلانات بعد.</div>
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
                      <button style={btn(a.is_active ? '#374151' : '#065F46')} onClick={() => quickToggle(a)}>{a.is_active ? 'تعطيل' : 'تفعيل'}</button>
                      <button style={btn('#374151')} onClick={() => openEdit(a)}>تعديل</button>
                      <button style={btn('#7F1D1D')} onClick={() => setConfirm(a)}>حذف</button>
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
          <Field label="العنوان"><input style={inputStyle} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
          <Field label="النص (اختياري)">
            <textarea style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
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
            <Field label="يبدأ (اختياري)"><input type="date" style={inputStyle} value={edit.starts_at} onChange={(e) => setEdit({ ...edit, starts_at: e.target.value })} /></Field>
            <Field label="ينتهي (اختياري)"><input type="date" style={inputStyle} value={edit.ends_at} onChange={(e) => setEdit({ ...edit, ends_at: e.target.value })} /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '16px', cursor: 'pointer', fontSize: '13px', color: '#D1D5DB' }}>
            <input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} style={{ width: '16px', height: '16px', accentColor: ACCENT }} />
            نشِط
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={{ ...btn(ACCENT), flex: 1, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>{busy ? '…' : 'حفظ'}</button>
            <button style={btn('#374151')} disabled={busy} onClick={() => setEdit(null)}>إلغاء</button>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal title="حذف إعلان" onClose={() => setConfirm(null)}>
          <div style={{ fontSize: '13px', color: '#D1D5DB', marginBottom: '16px' }}>حذف الإعلان «{confirm.title}»؟</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={{ ...btn('#7F1D1D'), flex: 1, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={doDelete}>{busy ? '…' : 'حذف'}</button>
            <button style={btn('#374151')} disabled={busy} onClick={() => setConfirm(null)}>إلغاء</button>
          </div>
        </Modal>
      )}
    </AdminShell>
  )
}
