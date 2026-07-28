import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import AdminShell from '../../AdminShell'
import {
  listRoles, upsertRole, deleteRole,
  listAdmins, updateAdmin, revokeAdmin, createAdmin, can,
} from './adminsApi'
import { ACCENT, MUTED, BORDER, ACCENT_SOFT } from '../../theme'
import Button from '../../components/ui/Button'
import Modal, { ModalActions } from '../../components/ui/Modal'
import Field from '../../components/ui/Field'
import Badge from '../../components/ui/Badge'
import { ErrorState } from '../../components/ui/States'
import { SkeletonRows } from '../../components/ui/Skeleton'

const CARD = '#12141C'
const CAPS = [
  ['manage_restaurants', 'إدارة المطاعم'],
  ['manage_billing', 'الفوترة'],
  ['manage_admins', 'إدارة المشرفين'],
  ['manage_roles', 'إدارة الأدوار'],
  ['manage_flags', 'إدارة المزايا'],
  ['manage_announcements', 'إدارة الإعلانات'],
]
const capLabel = (c) => (c === '*' ? 'كل الصلاحيات' : (CAPS.find((x) => x[0] === c)?.[1] || c))
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function Admins() {
  const [tab, setTab] = useState('admins')
  const [caps, setCaps] = useState({ admins: false, roles: false })

  useEffect(() => {
    Promise.all([can('manage_admins'), can('manage_roles')])
      .then(([a, r]) => setCaps({ admins: a, roles: r })).catch(() => {})
  }, [])

  return (
    <AdminShell active="admins" title="👥 المشرفون والأدوار">
      <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', borderBottom: `1px solid ${BORDER}` }}>
          {[['admins', '🛡️ المشرفون'], ['roles', '🎭 الأدوار']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '13px',
              color: tab === k ? 'white' : MUTED, borderBottom: tab === k ? `2px solid ${ACCENT}` : '2px solid transparent',
            }}>{l}</button>
          ))}
        </div>
        {tab === 'admins' && <AdminsTab canManage={caps.admins} />}
        {tab === 'roles' && <RolesTab canManage={caps.roles} />}
      </div>
    </AdminShell>
  )
}

// ============ المشرفون ============
function AdminsTab({ canManage }) {
  const [admins, setAdmins] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true); setError(null)
    Promise.all([listAdmins(), listRoles()])
      .then(([a, r]) => { setAdmins(a); setRoles(r) })
      .catch((e) => setError(e?.message || 'تعذّر التحميل')).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const doCreate = async () => {
    if (!creating.email?.trim()) return toast.error('البريد مطلوب')
    if ((creating.password || '').length < 8) return toast.error('كلمة المرور 8 أحرف على الأقل')
    if (!creating.role_id) return toast.error('اختر الدور')
    setBusy(true)
    try { await createAdmin(creating); toast.success('أُنشئ المشرف'); setCreating(null); load() }
    catch (e) { toast.error(e?.message || 'فشل') } finally { setBusy(false) }
  }
  const changeRole = async (a, roleId) => {
    try { await updateAdmin(a.user_id, roleId, a.is_active); toast.success('تم'); load() }
    catch (e) { toast.error(e?.message || 'فشل') }
  }
  const toggleActive = async (a) => {
    try { await updateAdmin(a.user_id, a.role_id, !a.is_active); load() }
    catch (e) { toast.error(e?.message || 'فشل') }
  }
  const doRevoke = async () => {
    setBusy(true)
    try { await revokeAdmin(confirm.user_id); toast.success('أُلغي المشرف'); setConfirm(null); load() }
    catch (e) { toast.error(e?.message || 'فشل') } finally { setBusy(false) }
  }

  if (loading) return <SkeletonRows count={4} />
  if (error) return <ErrorState msg={error} onRetry={load} />
  return (
    <div>
      {canManage && <div style={{ marginBottom: '14px' }}><Button variant="primary" onClick={() => setCreating({ email: '', password: '', full_name: '', role_id: '' })}>+ مشرف جديد</Button></div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {admins.map((a) => (
          <div key={a.user_id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(124,58,237,0.15)', border: `1px solid ${ACCENT}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>🛡️</div>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                <span style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '13.5px', color: 'white', direction: 'ltr' }}>{a.email || '—'}</span>
                {!a.is_active && <span style={{ fontSize: '10px', fontWeight: '800', color: '#F87171', background: 'rgba(239,68,68,0.12)', borderRadius: '100px', padding: '2px 9px' }}>معطّل</span>}
              </div>
              <div style={{ fontSize: '11px', color: MUTED }}>أُضيف {fmtDate(a.created_at)}</div>
            </div>
            {canManage ? (
              <>
                <select value={a.role_id || ''} onChange={(e) => changeRole(a, e.target.value)} className="admin-select" style={{ width: 'auto', minWidth: '130px' }}>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <Button variant={a.is_active ? 'neutral' : 'success'} onClick={() => toggleActive(a)}>{a.is_active ? 'تعطيل' : 'تفعيل'}</Button>
                <Button variant="danger" onClick={() => setConfirm(a)}>إلغاء</Button>
              </>
            ) : <Badge text={a.role_name || '—'} color="#C4B5FD" bg={ACCENT_SOFT} />}
          </div>
        ))}
      </div>

      {creating && (
        <Modal title="مشرف جديد" onClose={() => setCreating(null)}>
          <Field label="الاسم (اختياري)"><input className="admin-input" value={creating.full_name} onChange={(e) => setCreating({ ...creating, full_name: e.target.value })} /></Field>
          <Field label="البريد الإلكتروني"><input className="admin-input" type="email" value={creating.email} onChange={(e) => setCreating({ ...creating, email: e.target.value })} placeholder="admin@simsim.app" /></Field>
          <Field label="كلمة المرور (8 أحرف على الأقل)"><input className="admin-input" type="text" value={creating.password} onChange={(e) => setCreating({ ...creating, password: e.target.value })} /></Field>
          <Field label="الدور">
            <select className="admin-select" value={creating.role_id} onChange={(e) => setCreating({ ...creating, role_id: e.target.value })}>
              <option value="">— اختر —</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <div style={{ fontSize: '11px', color: MUTED, margin: '-4px 0 12px' }}>حساب منصّة مستقل بلا أي مطعم — يدخل عبر /admin/login.</div>
          <ModalActions busy={busy} onSave={doCreate} saveLabel="إنشاء" onCancel={() => setCreating(null)} />
        </Modal>
      )}
      {confirm && (
        <Modal title="إلغاء مشرف" onClose={() => setConfirm(null)}>
          <div style={{ fontSize: '13px', color: '#D1D5DB', marginBottom: '16px' }}>سيُلغى وصول «{confirm.email}» للمنصّة (لا يُحذف حساب الدخول). متابعة؟</div>
          <ModalActions busy={busy} onSave={doRevoke} saveLabel="إلغاء المشرف" onCancel={() => setConfirm(null)} />
        </Modal>
      )}
    </div>
  )
}

// ============ الأدوار ============
function RolesTab({ canManage }) {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [edit, setEdit] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true); setError(null)
    listRoles().then(setRoles).catch((e) => setError(e?.message || 'تعذّر التحميل')).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const save = async () => {
    if (!edit.name?.trim()) return toast.error('اسم الدور مطلوب')
    setBusy(true)
    try { await upsertRole(edit); toast.success('تم الحفظ'); setEdit(null); load() }
    catch (e) { toast.error(e?.message || 'فشل') } finally { setBusy(false) }
  }
  const doDelete = async () => {
    setBusy(true)
    try { await deleteRole(confirm.id); toast.success('حُذف الدور'); setConfirm(null); load() }
    catch (e) { toast.error(e?.message || 'فشل') } finally { setBusy(false) }
  }
  const toggleCap = (c) => {
    const has = edit.capabilities.includes(c)
    setEdit({ ...edit, capabilities: has ? edit.capabilities.filter((x) => x !== c) : [...edit.capabilities, c] })
  }

  if (loading) return <SkeletonRows count={4} />
  if (error) return <ErrorState msg={error} onRetry={load} />
  return (
    <div>
      {canManage && <div style={{ marginBottom: '14px' }}><Button variant="primary" onClick={() => setEdit({ name: '', description: '', capabilities: [] })}>+ دور جديد</Button></div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {roles.map((r) => (
          <div key={r.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '5px' }}>
                <span style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '14px', color: 'white' }}>{r.name}</span>
                {r.is_system && <span style={{ fontSize: '10px', fontWeight: '800', color: '#FBBF24', background: 'rgba(251,191,36,0.12)', borderRadius: '100px', padding: '2px 9px' }}>نظام</span>}
                <span style={{ fontSize: '10px', color: MUTED }}>· {Number(r.admins_count) || 0} مشرف</span>
              </div>
              {r.description && <div style={{ fontSize: '11.5px', color: MUTED, marginBottom: '6px' }}>{r.description}</div>}
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {(r.capabilities || []).map((c) => <Badge key={c} text={capLabel(c)} color="#C4B5FD" bg={ACCENT_SOFT} />)}
              </div>
            </div>
            {canManage && !r.is_system && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="neutral" onClick={() => setEdit({ id: r.id, name: r.name, description: r.description || '', capabilities: [...(r.capabilities || [])] })}>تعديل</Button>
                <Button variant="danger" onClick={() => setConfirm(r)}>حذف</Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {edit && (
        <Modal title={edit.id ? 'تعديل دور' : 'دور جديد'} onClose={() => setEdit(null)}>
          <Field label="اسم الدور"><input className="admin-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="الوصف (اختياري)"><input className="admin-input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <Field label="الصلاحيات">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {CAPS.map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '9px', fontSize: '13px', color: '#D1D5DB', cursor: 'pointer' }}>
                  <input type="checkbox" checked={edit.capabilities.includes(key)} onChange={() => toggleCap(key)} style={{ width: '16px', height: '16px', accentColor: ACCENT }} />
                  {label}
                </label>
              ))}
            </div>
          </Field>
          <ModalActions busy={busy} onSave={save} onCancel={() => setEdit(null)} />
        </Modal>
      )}
      {confirm && (
        <Modal title="حذف دور" onClose={() => setConfirm(null)}>
          <div style={{ fontSize: '13px', color: '#D1D5DB', marginBottom: '16px' }}>حذف الدور «{confirm.name}»؟ (لا يمكن حذف دور مُسنَد لمشرفين.)</div>
          <ModalActions busy={busy} onSave={doDelete} saveLabel="حذف" onCancel={() => setConfirm(null)} />
        </Modal>
      )}
    </div>
  )
}
