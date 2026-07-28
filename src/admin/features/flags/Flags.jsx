import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import AdminShell from '../../AdminShell'
import { listFlags, upsertFlag, deleteFlag, listOverrides, setOverride, can } from './flagsApi'
import { listRestaurants } from '../restaurants/restaurantsApi'
import { ACCENT, MUTED, BORDER } from '../../theme'
import Button from '../../components/ui/Button'
import Modal, { ModalActions } from '../../components/ui/Modal'
import Field from '../../components/ui/Field'
import { Loading, EmptyState, ErrorState } from '../../components/ui/States'

const CARD = '#12141C'
const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', direction: 'ltr' }

// مفتاح تشغيل/إيقاف بصري
function Toggle({ on, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} title={on ? 'مفعّل' : 'معطّل'} role="switch" aria-checked={on} style={{
      width: '42px', height: '24px', borderRadius: '100px', border: 'none', position: 'relative', flexShrink: 0,
      cursor: disabled ? 'default' : 'pointer', background: on ? ACCENT : '#374151', transition: 'background .15s', opacity: disabled ? 0.6 : 1,
    }}>
      <span style={{ position: 'absolute', top: '3px', [on ? 'left' : 'right']: '3px', width: '18px', height: '18px', borderRadius: '50%', background: 'white' }} />
    </button>
  )
}

export default function Flags() {
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [canManage, setCanManage] = useState(false)
  const [edit, setEdit] = useState(null)          // { key, description, enabled_global, isNew }
  const [confirm, setConfirm] = useState(null)     // flag to delete
  const [overridesOf, setOverridesOf] = useState(null) // flag whose overrides are open
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    listFlags().then(setFlags).catch((e) => setError(e?.message || 'تعذّر التحميل')).finally(() => setLoading(false))
  }
  useEffect(() => { load(); can('manage_flags').then(setCanManage).catch(() => {}) }, [])

  const toggleGlobal = async (f) => {
    if (!canManage) return
    try { await upsertFlag({ ...f, enabled_global: !f.enabled_global }); load() }
    catch (e) { toast.error(e?.message || 'فشل') }
  }
  const save = async () => {
    if (!edit.key?.trim()) return toast.error('المفتاح مطلوب')
    setBusy(true)
    try { await upsertFlag(edit); toast.success('تم الحفظ'); setEdit(null); load() }
    catch (e) { toast.error(e?.message || 'فشل') } finally { setBusy(false) }
  }
  const doDelete = async () => {
    setBusy(true)
    try { await deleteFlag(confirm.key); toast.success('حُذفت الميزة'); setConfirm(null); load() }
    catch (e) { toast.error(e?.message || 'فشل') } finally { setBusy(false) }
  }

  return (
    <AdminShell active="flags" title="🚩 المزايا">
      <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ fontSize: '12.5px', color: MUTED, marginBottom: '16px', lineHeight: 1.7 }}>
          تحكّم عام في كل ميزة، مع إمكانية تخصيص مطاعم بعينها (تفعيل/إيقاف يتجاوز الإعداد العام).
        </div>
        {canManage && (
          <div style={{ marginBottom: '14px' }}>
            <Button variant="primary" onClick={() => setEdit({ key: '', description: '', enabled_global: false, isNew: true })}>+ ميزة جديدة</Button>
          </div>
        )}

        {loading ? <Loading /> : error ? <ErrorState msg={error} onRetry={load} /> : flags.length === 0 ? (
          <EmptyState msg="لا مزايا معرّفة بعد." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {flags.map((f) => (
              <div key={f.key} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                    <span style={{ ...mono, fontWeight: '800', fontSize: '13.5px', color: 'white' }}>{f.key}</span>
                    {Number(f.overrides_count) > 0 && (
                      <span style={{ fontSize: '10px', fontWeight: '800', color: '#C4B5FD', background: 'rgba(124,58,237,0.15)', borderRadius: '100px', padding: '2px 9px' }}>
                        {f.overrides_count} تخصيص
                      </span>
                    )}
                  </div>
                  {f.description && <div style={{ fontSize: '11.5px', color: MUTED }}>{f.description}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <span style={{ fontSize: '11.5px', color: f.enabled_global ? '#6EE7B7' : MUTED, fontWeight: '700' }}>{f.enabled_global ? 'عام' : 'معطّل'}</span>
                    <Toggle on={f.enabled_global} onClick={() => toggleGlobal(f)} disabled={!canManage} />
                  </div>
                  <Button variant="neutral" onClick={() => setOverridesOf(f)}>التخصيصات</Button>
                  {canManage && (
                    <>
                      <Button variant="neutral" onClick={() => setEdit({ key: f.key, description: f.description || '', enabled_global: f.enabled_global, isNew: false })}>تعديل</Button>
                      <Button variant="danger" onClick={() => setConfirm(f)}>حذف</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {edit && (
        <Modal title={edit.isNew ? 'ميزة جديدة' : 'تعديل ميزة'} onClose={() => setEdit(null)}>
          <Field label="المفتاح (بالإنجليزية، ثابت)">
            <input className="admin-input" style={mono} value={edit.key} disabled={!edit.isNew}
              onChange={(e) => setEdit({ ...edit, key: e.target.value })} placeholder="loyalty_v2" />
          </Field>
          <Field label="الوصف (اختياري)">
            <input className="admin-input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', cursor: 'pointer' }}>
            <Toggle on={edit.enabled_global} onClick={() => setEdit({ ...edit, enabled_global: !edit.enabled_global })} />
            <span style={{ fontSize: '13px', color: '#D1D5DB' }}>مفعّلة لكل المطاعم افتراضياً</span>
          </label>
          <ModalActions busy={busy} onSave={save} onCancel={() => setEdit(null)} />
        </Modal>
      )}
      {confirm && (
        <Modal title="حذف ميزة" onClose={() => setConfirm(null)}>
          <div style={{ fontSize: '13px', color: '#D1D5DB', marginBottom: '16px' }}>
            حذف الميزة «<span style={mono}>{confirm.key}</span>»؟ ستُحذف كل تخصيصاتها للمطاعم أيضاً.
          </div>
          <ModalActions busy={busy} onSave={doDelete} saveLabel="حذف" onCancel={() => setConfirm(null)} />
        </Modal>
      )}
      {overridesOf && (
        <OverridesModal flag={overridesOf} canManage={canManage} onClose={() => { setOverridesOf(null); load() }} />
      )}
    </AdminShell>
  )
}

// ===== تخصيصات المطاعم لميزة واحدة =====
function OverridesModal({ flag, canManage, onClose }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  const load = () => {
    setLoading(true)
    listOverrides(flag.key).then(setRows).catch((e) => toast.error(e?.message || 'فشل')).finally(() => setLoading(false))
  }
  useEffect(load, [flag.key])

  const doSearch = async () => {
    if (!search.trim()) return setResults([])
    setSearching(true)
    try { const { rows: r } = await listRestaurants({ search, limit: 8 }); setResults(r) }
    catch (e) { toast.error(e?.message || 'فشل') } finally { setSearching(false) }
  }
  const apply = async (restaurantId, enabled) => {
    try { await setOverride(flag.key, restaurantId, enabled); load() }
    catch (e) { toast.error(e?.message || 'فشل') }
  }
  const remove = async (restaurantId) => {
    try { await setOverride(flag.key, restaurantId, null); load() }
    catch (e) { toast.error(e?.message || 'فشل') }
  }

  const overriddenIds = new Set(rows.map((r) => r.restaurant_id))

  return (
    <Modal title={<span>تخصيصات «<span style={mono}>{flag.key}</span>»</span>} onClose={onClose} maxWidth="520px">
      <div style={{ fontSize: '11.5px', color: MUTED, marginBottom: '14px', lineHeight: 1.7 }}>
        الإعداد العام: <b style={{ color: flag.enabled_global ? '#6EE7B7' : '#F87171' }}>{flag.enabled_global ? 'مفعّل' : 'معطّل'}</b>.
        التخصيص هنا يتجاوز الإعداد العام لمطعم بعينه.
      </div>

      {loading ? <Loading /> : rows.length === 0 ? (
        <div style={{ color: MUTED, fontSize: '12.5px', padding: '12px 0' }}>لا تخصيصات — كل المطاعم تتبع الإعداد العام.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
          {rows.map((r) => (
            <div key={r.restaurant_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#0B0D12', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '9px 12px' }}>
              <span style={{ flex: 1, fontSize: '13px', color: 'white', fontWeight: '700' }}>{r.restaurant_name}</span>
              <span style={{ fontSize: '11px', fontWeight: '800', color: r.enabled ? '#6EE7B7' : '#F87171' }}>{r.enabled ? 'مفعّل' : 'معطّل'}</span>
              {canManage && (
                <>
                  <Toggle on={r.enabled} onClick={() => apply(r.restaurant_id, !r.enabled)} />
                  <Button variant="neutral" style={{ padding: '6px 10px' }} onClick={() => remove(r.restaurant_id)} title="إزالة التخصيص (وراثة العام)">↺</Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div style={{ marginTop: '14px', borderTop: `1px solid ${BORDER}`, paddingTop: '14px' }}>
          <div style={{ fontSize: '11.5px', color: MUTED, fontWeight: '700', marginBottom: '8px' }}>إضافة تخصيص لمطعم</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <input className="admin-input" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="ابحث باسم المطعم…" />
            <Button variant="primary" onClick={doSearch} disabled={searching}>{searching ? '…' : 'بحث'}</Button>
          </div>
          {results.filter((r) => !overriddenIds.has(r.id)).map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 4px', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ flex: 1, fontSize: '13px', color: '#D1D5DB' }}>{r.name}</span>
              <Button variant="success" style={{ padding: '6px 12px' }} onClick={() => apply(r.id, true)}>تفعيل</Button>
              <Button variant="danger" style={{ padding: '6px 12px' }} onClick={() => apply(r.id, false)}>إيقاف</Button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '16px' }}>
        <Button variant="neutral" style={{ width: '100%' }} onClick={onClose}>إغلاق</Button>
      </div>
    </Modal>
  )
}
