import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import AdminShell from '../../AdminShell'
import { useAuthStore } from '../../../store/authStore'
import { listRestaurants } from '../restaurants/restaurantsApi'
import {
  listPlans, upsertPlan, setPlanActive, deletePlan,
  listSubscriptions, upsertSubscription,
  listInvoices, createInvoice, markInvoicePaid, voidInvoice,
} from './billingApi'
import { MUTED, BORDER, ACCENT } from '../../theme'
import Button from '../../components/ui/Button'
import Modal, { ModalActions } from '../../components/ui/Modal'
import Field from '../../components/ui/Field'
import Badge from '../../components/ui/Badge'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { SkeletonRows } from '../../components/ui/Skeleton'

const CARD = '#12141C'
const num = (v) => Number(v) || 0
const fmt = (v) => num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const CYCLE = { monthly: 'شهري', yearly: 'سنوي' }
const SUB_STATUS = { trialing: 'تجريبي', active: 'نشط', past_due: 'متأخّر', canceled: 'ملغى' }
const INV_STATUS = { draft: 'مسودّة', open: 'مفتوحة', paid: 'مدفوعة', void: 'ملغاة' }
const INV_COLOR = { draft: '#9CA3AF', open: '#FBBF24', paid: '#6EE7B7', void: '#F87171' }

// طباعة/PDF عبر نافذة المتصفح (بلا مكتبة) + مشاركة واتساب
function printInvoice(inv) {
  const w = window.open('', '_blank', 'width=720,height=900')
  if (!w) return
  const row = (k, v) => `<tr><td style="padding:6px 0;color:#666">${k}</td><td style="padding:6px 0;text-align:left;font-weight:700">${v}</td></tr>`
  const dt = (v) => v ? new Date(v).toLocaleDateString('ar') : '—'
  w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>فاتورة #${inv.invoice_number}</title>
    <style>body{font-family:Tahoma,Arial,sans-serif;padding:40px;color:#111}h1{color:#7C3AED;margin:0}
    table{width:100%;border-collapse:collapse;margin-top:18px}.total{font-size:22px;font-weight:900;margin-top:16px}</style></head><body>
    <h1>سِمسِم</h1><div style="color:#666">فاتورة اشتراك المنصّة</div>
    <table>${row('رقم الفاتورة', '#' + inv.invoice_number)}${row('المطعم', inv.restaurant_name)}${row('الحالة', INV_STATUS[inv.status] || inv.status)}${row('تاريخ الإصدار', dt(inv.issued_at))}${inv.due_at ? row('تاريخ الاستحقاق', dt(inv.due_at)) : ''}${inv.paid_at ? row('تاريخ الدفع', dt(inv.paid_at)) : ''}</table>
    <table style="margin-top:24px;border-top:2px solid #eee">${row('الصافي', fmt(inv.amount_net) + ' ﷼')}${row('ض.ق.م 15%', fmt(inv.vat_amount) + ' ﷼')}</table>
    <div class="total">الإجمالي: ${fmt(inv.total)} ﷼</div>
    <script>window.onload=function(){window.print()}</script></body></html>`)
  w.document.close()
}
function whatsappInvoice(inv) {
  const txt = `فاتورة سِمسِم #${inv.invoice_number}\nالمطعم: ${inv.restaurant_name}\nالإجمالي: ${fmt(inv.total)} ﷼ (شامل ض.ق.م)\nالحالة: ${INV_STATUS[inv.status] || inv.status}`
  window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank')
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
    setLoading(true); setError(null)
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
  // حذف نهائي — محميّ خادمياً (يُمنع لو للباقة اشتراكات). الزر يظهر فقط عند 0 مشترك.
  const remove = async (p) => {
    if (!window.confirm(`حذف باقة «${p.name}» نهائياً؟ لا يمكن التراجع.`)) return
    try { await deletePlan(p.id); toast.success('حُذفت الباقة'); load() }
    catch (e) { toast.error(e?.message || 'تعذّر الحذف') }
  }

  if (loading) return <SkeletonRows count={4} />
  if (error) return <ErrorState msg={error} onRetry={load} />
  return (
    <div>
      {canManage && <div style={{ marginBottom: '14px' }}><Button variant="primary" onClick={() => setEdit({ billing_cycle: 'monthly', price: '', sort_order: 0 })}>+ باقة جديدة</Button></div>}
      {rows.length === 0 ? <EmptyState msg="لا توجد باقات بعد" /> : (
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
                  <Button variant="neutral" onClick={() => setEdit(p)}>تعديل</Button>
                  <Button variant={p.is_active ? 'danger' : 'success'} onClick={() => toggle(p)}>{p.is_active ? 'تعطيل' : 'تفعيل'}</Button>
                  {Number(p.subscribers_count || 0) === 0 && <Button variant="danger" onClick={() => remove(p)}>🗑 حذف</Button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {edit && (
        <Modal title={edit.id ? 'تعديل باقة' : 'باقة جديدة'} onClose={() => setEdit(null)}>
          <Field label="اسم الباقة"><input className="admin-input" value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="الدورة">
            <select className="admin-select" value={edit.billing_cycle} onChange={(e) => setEdit({ ...edit, billing_cycle: e.target.value })}>
              <option value="monthly">شهري</option><option value="yearly">سنوي</option>
            </select>
          </Field>
          <Field label="السعر (﷼، شامل الضريبة)"><input className="admin-input" type="number" inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
          <Field label="المزايا (اختياري)"><input className="admin-input" value={edit.features || ''} onChange={(e) => setEdit({ ...edit, features: e.target.value })} /></Field>
          <Field label="الترتيب"><input className="admin-input" type="number" value={edit.sort_order ?? 0} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} /></Field>
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
    setLoading(true); setError(null)
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

  if (loading) return <SkeletonRows count={4} />
  if (error) return <ErrorState msg={error} onRetry={load} />
  return (
    <div>
      {canManage && <div style={{ marginBottom: '14px' }}><Button variant="primary" onClick={() => setEdit({ status: 'active' })}>+ ربط مطعم بباقة</Button></div>}
      {subs.length === 0 ? <EmptyState msg="لا توجد اشتراكات بعد" /> : (
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
              {canManage && <Button variant="neutral" onClick={() => setEdit({ restaurant_id: s.restaurant_id, plan_id: s.plan_id, amount: s.amount, status: s.status, period_start: '', period_end: '', notes: '' })}>تعديل</Button>}
            </div>
          ))}
        </div>
      )}
      {edit && (
        <Modal title="اشتراك مطعم" onClose={() => setEdit(null)}>
          <Field label="المطعم">
            <select className="admin-select" value={edit.restaurant_id || ''} onChange={(e) => setEdit({ ...edit, restaurant_id: e.target.value })}>
              <option value="">— اختر —</option>
              {rests.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="الباقة">
            <select className="admin-select" value={edit.plan_id || ''} onChange={(e) => { const p = plans.find((x) => x.id === e.target.value); setEdit({ ...edit, plan_id: e.target.value, amount: edit.amount ?? (p ? p.price : '') }) }}>
              <option value="">— اختر —</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmt(p.price)} ﷼ ({CYCLE[p.billing_cycle]})</option>)}
            </select>
          </Field>
          <Field label="السعر الفعلي (قابل للتعديل)"><input className="admin-input" type="number" inputMode="decimal" value={edit.amount ?? ''} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} placeholder="يرث سعر الباقة إن تُرك فارغاً" /></Field>
          <Field label="الحالة">
            <select className="admin-select" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
              {Object.entries(SUB_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Field label="بداية الفترة"><input className="admin-input" type="date" value={edit.period_start || ''} onChange={(e) => setEdit({ ...edit, period_start: e.target.value })} /></Field>
            <Field label="نهاية الفترة"><input className="admin-input" type="date" value={edit.period_end || ''} onChange={(e) => setEdit({ ...edit, period_end: e.target.value })} /></Field>
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
    setLoading(true); setError(null)
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

  if (loading) return <SkeletonRows count={4} />
  if (error) return <ErrorState msg={error} onRetry={load} />
  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
        {canManage && <Button variant="primary" onClick={() => setCreating({ total: '', period_start: '', period_end: '', due_at: '', notes: '' })}>+ فاتورة جديدة</Button>}
        <div style={{ flex: 1 }} />
        <select className="admin-select" style={{ width: 'auto', minWidth: '180px' }} value={filterRest} onChange={(e) => setFilterRest(e.target.value)}>
          <option value="">كل المطاعم</option>
          {rests.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      {rows.length === 0 ? <EmptyState msg="لا توجد فواتير" /> : (
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
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <Button variant="neutral" onClick={() => printInvoice(i)} title="طباعة / PDF" aria-label="طباعة الفاتورة">🖨️</Button>
                <Button variant="success" onClick={() => whatsappInvoice(i)} title="مشاركة واتساب">واتساب</Button>
                {canManage && i.status === 'open' && (
                  <>
                    <Button variant="success" onClick={() => pay(i)}>تعليم مدفوعة</Button>
                    <Button variant="danger" onClick={() => cancel(i)}>إلغاء</Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {creating && (
        <Modal title="فاتورة جديدة" onClose={() => setCreating(null)}>
          <Field label="المطعم">
            <select className="admin-select" value={creating.restaurant_id || ''} onChange={(e) => setCreating({ ...creating, restaurant_id: e.target.value })}>
              <option value="">— اختر —</option>
              {rests.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="الإجمالي (﷼، شامل الضريبة)"><input className="admin-input" type="number" inputMode="decimal" value={creating.total} onChange={(e) => setCreating({ ...creating, total: e.target.value })} /></Field>
          {num(creating.total) > 0 && <div style={{ fontSize: '11px', color: MUTED, margin: '-6px 0 12px' }}>صافي ≈ {fmt(num(creating.total) / 1.15)} + ضريبة ≈ {fmt(num(creating.total) - num(creating.total) / 1.15)}</div>}
          <div style={{ display: 'flex', gap: '10px' }}>
            <Field label="بداية الفترة"><input className="admin-input" type="date" value={creating.period_start} onChange={(e) => setCreating({ ...creating, period_start: e.target.value })} /></Field>
            <Field label="نهاية الفترة"><input className="admin-input" type="date" value={creating.period_end} onChange={(e) => setCreating({ ...creating, period_end: e.target.value })} /></Field>
          </div>
          <Field label="تاريخ الاستحقاق"><input className="admin-input" type="date" value={creating.due_at} onChange={(e) => setCreating({ ...creating, due_at: e.target.value })} /></Field>
          <Field label="ملاحظات (اختياري)"><input className="admin-input" value={creating.notes} onChange={(e) => setCreating({ ...creating, notes: e.target.value })} /></Field>
          <ModalActions busy={busy} onSave={doCreate} saveLabel="إنشاء" onCancel={() => setCreating(null)} />
        </Modal>
      )}
    </div>
  )
}
