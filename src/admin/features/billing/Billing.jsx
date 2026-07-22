import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import AdminShell from '../../AdminShell'
import { useAuthStore } from '../../../store/authStore'
import { listRestaurants } from '../restaurants/restaurantsApi'
import {
  listPlans, upsertPlan, setPlanActive,
  listSubscriptions, upsertSubscription,
  listInvoices, createInvoice, markInvoicePaid, voidInvoice,
} from './billingApi'

const CARD = '#12141C', BORDER = 'rgba(255,255,255,0.08)', MUTED = '#9CA3AF', ACCENT = '#7C3AED'
const num = (v) => Number(v) || 0
const fmt = (v) => num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const CYCLE = { monthly: 'شهري', yearly: 'سنوي' }
const SUB_STATUS = { trialing: 'تجريبي', active: 'نشط', past_due: 'متأخّر', canceled: 'ملغى' }
const INV_STATUS = { draft: 'مسودّة', open: 'مفتوحة', paid: 'مدفوعة', void: 'ملغاة' }
const INV_COLOR = { draft: '#9CA3AF', open: '#FBBF24', paid: '#6EE7B7', void: '#F87171' }

const inputStyle = {
  background: '#0B0D12', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '9px 12px',
  color: 'white', fontFamily: 'Tajawal,sans-serif', fontSize: '13px', outline: 'none', width: '100%',
}
const btn = (bg) => ({
  padding: '9px 15px', borderRadius: '10px', border: 'none', cursor: 'pointer',
  fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '12.5px', color: 'white', background: bg,
})

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} />
      <div style={{ position: 'relative', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '20px', width: '100%', maxWidth: '440px', maxHeight: '88vh', overflowY: 'auto' }}>
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
function Badge({ text, color }) {
  return <span style={{ fontSize: '10px', fontWeight: '800', color, background: `${color}22`, borderRadius: '100px', padding: '2px 9px' }}>{text}</span>
}

export default function Billing() {
  const { platformRole } = useAuthStore()
  const canManage = platformRole === 'super_admin'
  const [tab, setTab] = useState('plans')

  return (
    <AdminShell active="billing" title="💳 الفوترة">
      <div style={{ padding: '20px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', borderBottom: `1px solid ${BORDER}` }}>
          {[['plans', '🏷️ الباقات'], ['subs', '🔁 الاشتراكات'], ['invoices', '🧾 الفواتير']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '13px',
              color: tab === k ? 'white' : MUTED, borderBottom: tab === k ? `2px solid ${ACCENT}` : '2px solid transparent',
            }}>{l}</button>
          ))}
        </div>
        {tab === 'plans' && <PlansTab canManage={canManage} />}
        {tab === 'subs' && <SubsTab canManage={canManage} />}
        {tab === 'invoices' && <InvoicesTab canManage={canManage} />}
      </div>
    </AdminShell>
  )
}

// ============ الباقات ============
function PlansTab({ canManage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [edit, setEdit] = useState(null) // الباقة قيد التعديل أو {} للجديدة
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    listPlans().then(setRows).catch((e) => setError(e?.message || 'تعذّر التحميل')).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const save = async () => {
    if (!edit.name?.trim()) return toast.error('الاسم مطلوب')
    setBusy(true)
    try { await upsertPlan(edit); toast.success('تم الحفظ'); setEdit(null); load() }
    catch (e) { toast.error(e?.message || 'فشل الحفظ') }
    finally { setBusy(false) }
  }
  const toggle = async (p) => {
    try { await setPlanActive(p.id, !p.is_active); load() }
    catch (e) { toast.error(e?.message || 'فشل') }
  }

  if (loading) return <Loading />
  if (error) return <ErrBox msg={error} />
  return (
    <div>
      {canManage && <div style={{ marginBottom: '14px' }}><button style={btn(ACCENT)} onClick={() => setEdit({ billing_cycle: 'monthly', price: '', sort_order: 0 })}>+ باقة جديدة</button></div>}
      {rows.length === 0 ? <Empty msg="لا توجد باقات بعد" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rows.map((p) => (
            <div key={p.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '160px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                  <span style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '14px', color: 'white' }}>{p.name}</span>
                  <Badge text={CYCLE[p.billing_cycle]} color="#C4B5FD" />
                  {!p.is_active && <Badge text="معطّلة" color="#F87171" />}
                </div>
                {p.features && <div style={{ fontSize: '11.5px', color: MUTED }}>{p.features}</div>}
                <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{num(p.subscribers_count)} مشترك</div>
              </div>
              <div style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '900', fontSize: '16px', color: 'white' }}>{fmt(p.price)} <span style={{ fontSize: '11px', color: MUTED }}>﷼</span></div>
              {canManage && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={btn('#374151')} onClick={() => setEdit(p)}>تعديل</button>
                  <button style={btn(p.is_active ? '#7F1D1D' : '#065F46')} onClick={() => toggle(p)}>{p.is_active ? 'تعطيل' : 'تفعيل'}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {edit && (
        <Modal title={edit.id ? 'تعديل باقة' : 'باقة جديدة'} onClose={() => setEdit(null)}>
          <Field label="اسم الباقة"><input style={inputStyle} value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="الدورة">
            <select style={inputStyle} value={edit.billing_cycle} onChange={(e) => setEdit({ ...edit, billing_cycle: e.target.value })}>
              <option value="monthly">شهري</option><option value="yearly">سنوي</option>
            </select>
          </Field>
          <Field label="السعر (﷼، شامل الضريبة)"><input style={inputStyle} type="number" inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
          <Field label="المزايا (اختياري)"><input style={inputStyle} value={edit.features || ''} onChange={(e) => setEdit({ ...edit, features: e.target.value })} /></Field>
          <Field label="الترتيب"><input style={inputStyle} type="number" value={edit.sort_order ?? 0} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} /></Field>
          <ModalActions busy={busy} onSave={save} onCancel={() => setEdit(null)} />
        </Modal>
      )}
    </div>
  )
}

// ============ الاشتراكات ============
function SubsTab({ canManage }) {
  const [subs, setSubs] = useState([])
  const [plans, setPlans] = useState([])
  const [rests, setRests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([listSubscriptions(), listPlans(), listRestaurants({ limit: 100 })])
      .then(([s, p, r]) => { setSubs(s); setPlans(p.filter((x) => x.is_active)); setRests(r.rows) })
      .catch((e) => setError(e?.message || 'تعذّر التحميل')).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const save = async () => {
    if (!edit.restaurant_id) return toast.error('اختر المطعم')
    if (!edit.plan_id) return toast.error('اختر الباقة')
    setBusy(true)
    try { await upsertSubscription(edit); toast.success('تم الحفظ'); setEdit(null); load() }
    catch (e) { toast.error(e?.message || 'فشل الحفظ') }
    finally { setBusy(false) }
  }

  if (loading) return <Loading />
  if (error) return <ErrBox msg={error} />
  return (
    <div>
      {canManage && <div style={{ marginBottom: '14px' }}><button style={btn(ACCENT)} onClick={() => setEdit({ status: 'active' })}>+ ربط مطعم بباقة</button></div>}
      {subs.length === 0 ? <Empty msg="لا توجد اشتراكات بعد" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {subs.map((s) => (
            <div key={s.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '160px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                  <span style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '14px', color: 'white' }}>{s.restaurant_name}</span>
                  <Badge text={SUB_STATUS[s.status] || s.status} color={s.status === 'active' ? '#6EE7B7' : s.status === 'past_due' ? '#FBBF24' : '#9CA3AF'} />
                </div>
                <div style={{ fontSize: '11.5px', color: MUTED }}>{s.plan_label || '—'} · {CYCLE[s.billing_cycle] || s.billing_cycle}</div>
                {num(s.outstanding_total) > 0 && <div style={{ fontSize: '11px', color: '#FBBF24', marginTop: '2px' }}>مستحقّ مفتوح: {fmt(s.outstanding_total)} ﷼</div>}
              </div>
              <div style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '900', fontSize: '16px', color: 'white' }}>{fmt(s.amount)} <span style={{ fontSize: '11px', color: MUTED }}>﷼</span></div>
              {canManage && <button style={btn('#374151')} onClick={() => setEdit({ restaurant_id: s.restaurant_id, plan_id: s.plan_id, amount: s.amount, status: s.status, period_start: '', period_end: '', notes: '' })}>تعديل</button>}
            </div>
          ))}
        </div>
      )}
      {edit && (
        <Modal title="اشتراك مطعم" onClose={() => setEdit(null)}>
          <Field label="المطعم">
            <select style={inputStyle} value={edit.restaurant_id || ''} onChange={(e) => setEdit({ ...edit, restaurant_id: e.target.value })}>
              <option value="">— اختر —</option>
              {rests.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="الباقة">
            <select style={inputStyle} value={edit.plan_id || ''} onChange={(e) => { const p = plans.find((x) => x.id === e.target.value); setEdit({ ...edit, plan_id: e.target.value, amount: edit.amount ?? (p ? p.price : '') }) }}>
              <option value="">— اختر —</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmt(p.price)} ﷼ ({CYCLE[p.billing_cycle]})</option>)}
            </select>
          </Field>
          <Field label="السعر الفعلي (قابل للتعديل)"><input style={inputStyle} type="number" inputMode="decimal" value={edit.amount ?? ''} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} placeholder="يرث سعر الباقة إن تُرك فارغاً" /></Field>
          <Field label="الحالة">
            <select style={inputStyle} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
              {Object.entries(SUB_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Field label="بداية الفترة"><input style={inputStyle} type="date" value={edit.period_start || ''} onChange={(e) => setEdit({ ...edit, period_start: e.target.value })} /></Field>
            <Field label="نهاية الفترة"><input style={inputStyle} type="date" value={edit.period_end || ''} onChange={(e) => setEdit({ ...edit, period_end: e.target.value })} /></Field>
          </div>
          <ModalActions busy={busy} onSave={save} onCancel={() => setEdit(null)} />
        </Modal>
      )}
    </div>
  )
}

// ============ الفواتير ============
function InvoicesTab({ canManage }) {
  const [rows, setRows] = useState([])
  const [rests, setRests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterRest, setFilterRest] = useState('')
  const [creating, setCreating] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([listInvoices({ restaurantId: filterRest || null, limit: 100 }), listRestaurants({ limit: 100 })])
      .then(([inv, r]) => { setRows(inv.rows); setRests(r.rows) })
      .catch((e) => setError(e?.message || 'تعذّر التحميل')).finally(() => setLoading(false))
  }
  useEffect(load, [filterRest]) // eslint-disable-line react-hooks/exhaustive-deps

  const restName = useMemo(() => Object.fromEntries(rests.map((r) => [r.id, r.name])), [rests])

  const doCreate = async () => {
    if (!creating.restaurant_id) return toast.error('اختر المطعم')
    if (!(num(creating.total) > 0)) return toast.error('الإجمالي يجب أن يكون أكبر من صفر')
    setBusy(true)
    try { await createInvoice(creating); toast.success('أُنشئت الفاتورة'); setCreating(null); load() }
    catch (e) { toast.error(e?.message || 'فشل') }
    finally { setBusy(false) }
  }
  const pay = async (inv) => {
    try { await markInvoicePaid(inv.id); toast.success('عُلّمت مدفوعة'); load() }
    catch (e) { toast.error(e?.message || 'فشل') }
  }
  const cancel = async (inv) => {
    try { await voidInvoice(inv.id); toast.success('أُلغيت'); load() }
    catch (e) { toast.error(e?.message || 'فشل') }
  }

  if (loading) return <Loading />
  if (error) return <ErrBox msg={error} />
  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
        {canManage && <button style={btn(ACCENT)} onClick={() => setCreating({ total: '', period_start: '', period_end: '', due_at: '', notes: '' })}>+ فاتورة جديدة</button>}
        <div style={{ flex: 1 }} />
        <select style={{ ...inputStyle, width: 'auto', minWidth: '180px' }} value={filterRest} onChange={(e) => setFilterRest(e.target.value)}>
          <option value="">كل المطاعم</option>
          {rests.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      {rows.length === 0 ? <Empty msg="لا توجد فواتير" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rows.map((i) => (
            <div key={i.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '160px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                  <span style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '13.5px', color: 'white' }}>#{i.invoice_number} · {i.restaurant_name}</span>
                  <Badge text={INV_STATUS[i.status]} color={INV_COLOR[i.status]} />
                </div>
                <div style={{ fontSize: '11px', color: MUTED }}>
                  صافي {fmt(i.amount_net)} + ضريبة {fmt(i.vat_amount)} · أُصدرت {fmtDate(i.issued_at)}{i.due_at ? ` · تستحقّ ${fmtDate(i.due_at)}` : ''}{i.paid_at ? ` · دُفعت ${fmtDate(i.paid_at)}` : ''}
                </div>
              </div>
              <div style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '900', fontSize: '16px', color: 'white' }}>{fmt(i.total)} <span style={{ fontSize: '11px', color: MUTED }}>﷼</span></div>
              {canManage && i.status === 'open' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={btn('#065F46')} onClick={() => pay(i)}>تعليم مدفوعة</button>
                  <button style={btn('#7F1D1D')} onClick={() => cancel(i)}>إلغاء</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {creating && (
        <Modal title="فاتورة جديدة" onClose={() => setCreating(null)}>
          <Field label="المطعم">
            <select style={inputStyle} value={creating.restaurant_id || ''} onChange={(e) => setCreating({ ...creating, restaurant_id: e.target.value })}>
              <option value="">— اختر —</option>
              {rests.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="الإجمالي (﷼، شامل الضريبة)"><input style={inputStyle} type="number" inputMode="decimal" value={creating.total} onChange={(e) => setCreating({ ...creating, total: e.target.value })} /></Field>
          {num(creating.total) > 0 && <div style={{ fontSize: '11px', color: MUTED, margin: '-6px 0 12px' }}>صافي ≈ {fmt(num(creating.total) / 1.15)} + ضريبة ≈ {fmt(num(creating.total) - num(creating.total) / 1.15)}</div>}
          <div style={{ display: 'flex', gap: '10px' }}>
            <Field label="بداية الفترة"><input style={inputStyle} type="date" value={creating.period_start} onChange={(e) => setCreating({ ...creating, period_start: e.target.value })} /></Field>
            <Field label="نهاية الفترة"><input style={inputStyle} type="date" value={creating.period_end} onChange={(e) => setCreating({ ...creating, period_end: e.target.value })} /></Field>
          </div>
          <Field label="تاريخ الاستحقاق"><input style={inputStyle} type="date" value={creating.due_at} onChange={(e) => setCreating({ ...creating, due_at: e.target.value })} /></Field>
          <Field label="ملاحظات (اختياري)"><input style={inputStyle} value={creating.notes} onChange={(e) => setCreating({ ...creating, notes: e.target.value })} /></Field>
          <ModalActions busy={busy} onSave={doCreate} saveLabel="إنشاء" onCancel={() => setCreating(null)} />
        </Modal>
      )}
    </div>
  )
}

// ============ مشتركات ============
function ModalActions({ busy, onSave, onCancel, saveLabel = 'حفظ' }) {
  return (
    <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
      <button style={{ ...btn(ACCENT), flex: 1, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={onSave}>{busy ? '…' : saveLabel}</button>
      <button style={btn('#374151')} disabled={busy} onClick={onCancel}>إلغاء</button>
    </div>
  )
}
const Loading = () => <div style={{ color: MUTED, textAlign: 'center', padding: '48px', fontSize: '13px' }}>جارٍ التحميل…</div>
const Empty = ({ msg }) => <div style={{ color: MUTED, textAlign: 'center', padding: '48px', fontSize: '13px' }}>{msg}</div>
const ErrBox = ({ msg }) => <div style={{ background: '#3B1113', border: '1px solid #7F1D1D', borderRadius: '12px', padding: '16px', color: '#FCA5A5', fontSize: '13px' }}>⚠️ {msg}</div>
