import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import AdminShell from '../../AdminShell'
import FeaturesLibrary from './screens/FeaturesLibrary'
import Plans from './screens/Plans'
import {
  listCategories, listCapabilities, capabilityDetail, listPlans, listRestaurants,
  upsertCapability, deleteCapability, upsertCategory,
  setDependency, deleteDependency, setPlanFeature, deletePlanFeature,
  listOverrides, setOverride, syncCapabilities, manifestSyncPayload, can,
} from './catalogApi'

// ثيم وحدة المنصّة (داكن/بنفسجي) — نظير Flags.jsx
const CARD = '#12141C', BORDER = 'rgba(255,255,255,0.08)', MUTED = '#9CA3AF', ACCENT = '#7C3AED'
const TYPES = ['feature', 'limit', 'option', 'mode']
const SCOPES = ['platform', 'restaurant', 'user']
const LIFECYCLES = ['draft', 'active', 'deprecated', 'archived']
const RUNTIMES = ['enabled', 'disabled', 'beta', 'preview']
const DEP_TYPES = ['required', 'optional', 'conflicts']
const PERM_ROLES = ['owner', 'manager', 'cashier', 'staff'] // الأدوار المسموح لها (required_permissions)

// تسميات عربية للعرض فقط — القيَم المخزَّنة تبقى إنجليزية (يتطلّبها الكود وقيود قاعدة البيانات).
const TYPE_AR = { feature: 'ميزة', limit: 'حد', option: 'خيار', mode: 'وضع' }
const SCOPE_AR = { platform: 'المنصّة', restaurant: 'المطعم', user: 'المستخدم' }
const LIFECYCLE_AR = { draft: 'مسودّة', active: 'نشطة', deprecated: 'مهجورة', archived: 'مؤرشفة' }
const RUNTIME_AR = { enabled: 'مفعّلة', disabled: 'معطّلة', beta: 'تجريبية', preview: 'معاينة' }
const DEP_TYPE_AR = { required: 'إلزامية', optional: 'اختيارية', conflicts: 'متعارضة' }
const ROLE_AR = { owner: 'المالك', manager: 'مدير', cashier: 'كاشير', staff: 'موظف' }
const KIND_AR = {
  page: 'صفحة', tab: 'تبويب', card: 'بطاقة', component: 'مكوّن', button: 'زر', modal: 'نافذة',
  form: 'نموذج', table: 'جدول', report: 'تقرير', chart: 'رسم بياني', action: 'إجراء',
  api: 'واجهة API', webhook: 'Webhook', integration: 'تكامل', ai: 'ذكاء اصطناعي',
  mobile: 'جوال', pos: 'نقطة بيع', delivery: 'توصيل', payment: 'دفع',
}
const KINDS = Object.keys(KIND_AR)
const arOf = (map, v) => map[v] || v
const RUNTIME_COLOR = { enabled: '#22C55E', beta: '#3B82F6', preview: '#F59E0B', disabled: '#6B7280' }

const inputStyle = {
  background: '#0B0D12', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '9px 12px',
  color: 'white', fontFamily: 'Tajawal,sans-serif', fontSize: '13px', outline: 'none', width: '100%',
}
const btn = (bg) => ({
  padding: '9px 15px', borderRadius: '10px', border: 'none', cursor: 'pointer',
  fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '12.5px', color: 'white', background: bg,
})
const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', direction: 'ltr', fontSize: '12px' }
const Loading = () => <div style={{ color: MUTED, textAlign: 'center', padding: '48px', fontSize: '13px' }}>جارٍ التحميل…</div>
const ErrBox = ({ msg }) => <div style={{ background: '#3B1113', border: '1px solid #7F1D1D', borderRadius: '12px', padding: '16px', color: '#FCA5A5', fontSize: '13px' }}>⚠️ {msg}</div>

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: '12px' }}>
      <span style={{ display: 'block', fontSize: '11.5px', color: MUTED, fontWeight: '700', marginBottom: '6px' }}>{label}</span>
      {children}
    </label>
  )
}
function Modal({ title, children, onClose, maxWidth = '460px' }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} />
      <div style={{ position: 'relative', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '20px', width: '100%', maxWidth, maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ fontSize: '15px', fontWeight: '900', color: 'white', fontFamily: 'Cairo,sans-serif', marginBottom: '16px' }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

// تحليل قيمة jsonb من نص (رقم/منطقي/سلسلة/مصفوفة) — للحدود/الأوضاع/التخصيصات
function parseJsonish(str) {
  if (str === '' || str == null) return null
  try { return JSON.parse(str) } catch { return str }
}

const EMPTY_FORM = {
  key: '', name: '', description: '', category_key: '', module: '', parent_key: '', kind: '',
  type: 'feature', scope: 'restaurant', lifecycle_status: 'active', runtime_status: 'enabled',
  sort_order: 0, icon: '', upgrade_message: '', enabled_global: false,
  default_value_text: '', allowed_values_text: '', metric: '', unit: '', required_permissions: [],
}

function AdvancedEditor() {
  const [cats, setCats] = useState([])
  const [caps, setCaps] = useState([])
  const [plans, setPlans] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [canWrite, setCanWrite] = useState(false)

  const [q, setQ] = useState('')
  const [fType, setFType] = useState('')
  const [fScope, setFScope] = useState('')
  const [fRuntime, setFRuntime] = useState('')
  const [fCat, setFCat] = useState('')

  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [overrides, setOverrides] = useState(null)

  const [newCap, setNewCap] = useState(false)
  const [newCat, setNewCat] = useState(false)

  async function reload() {
    setLoading(true); setErr(null)
    try {
      const [c, f, p, rest, w] = await Promise.all([
        listCategories(), listCapabilities(), listPlans().catch(() => []),
        listRestaurants({ limit: 100 }).then((r) => r.rows).catch(() => []), can('manage_flags'),
      ])
      setCats(c); setCaps(f); setPlans(p); setRestaurants(rest); setCanWrite(w)
    } catch (e) { setErr(e.message || String(e)) } finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  async function openDetail(key) {
    setSelected(key); setDetail(null); setOverrides(null)
    try {
      const d = await capabilityDetail(key)
      setDetail(d)
      const c = d.capability || {}
      setForm({
        key: c.key || '', name: c.name || '', description: c.description || '', category_key: c.category_key || '',
        module: c.module || '', parent_key: c.parent_key || '', kind: c.kind || '',
        type: c.type || 'feature', scope: c.scope || 'restaurant',
        lifecycle_status: c.lifecycle_status || 'active', runtime_status: c.runtime_status || 'enabled',
        sort_order: c.sort_order || 0, icon: c.icon || '', upgrade_message: c.upgrade_message || '',
        enabled_global: !!c.enabled_global,
        default_value_text: c.default_value == null ? '' : JSON.stringify(c.default_value),
        allowed_values_text: c.allowed_values == null ? '' : JSON.stringify(c.allowed_values),
        metric: c.metric || '', unit: c.unit || '',
        required_permissions: Array.isArray(c.required_permissions) ? c.required_permissions : [],
      })
    } catch (e) { toast.error(e.message) }
  }

  // الحمولة المُرسَلة للحفظ (تُعرض كـPreview)
  const payload = useMemo(() => {
    const isFeature = form.type === 'feature'
    return {
      key: form.key, name: form.name, description: form.description || null,
      category_key: form.category_key || null, module: form.module || null,
      parent_key: form.parent_key || null, kind: form.kind || null,
      type: form.type, scope: form.scope,
      lifecycle_status: form.lifecycle_status, runtime_status: form.runtime_status,
      sort_order: Number(form.sort_order) || 0, icon: form.icon || null,
      upgrade_message: form.upgrade_message || null,
      enabled_global: isFeature ? !!form.enabled_global : false,
      default_value: isFeature ? null : parseJsonish(form.default_value_text),
      allowed_values: form.type === 'mode' ? parseJsonish(form.allowed_values_text) : null,
      metric: form.type === 'limit' ? (form.metric || null) : null,
      unit: form.type === 'limit' ? (form.unit || null) : null,
      required_permissions: form.required_permissions || [],
    }
  }, [form])

  async function save() {
    try { await upsertCapability(payload); toast.success('حُفظت القدرة'); await reload(); await openDetail(payload.key) }
    catch (e) { toast.error(e.message) }
  }
  async function removeCap(key) {
    if (!window.confirm(`حذف القدرة «${key}» وكل تبعياتها/ربطها؟`)) return
    try { await deleteCapability(key); toast.success('حُذفت'); setSelected(null); setDetail(null); await reload() }
    catch (e) { toast.error(e.message) }
  }
  async function doSync() {
    if (!window.confirm('مزامنة الكتالوج من الـManifest (UPSERT)؟')) return
    try { const r = await syncCapabilities(manifestSyncPayload()); toast.success(`تمّت المزامنة: ${r.capabilities} قدرة / ${r.categories} فئة`); await reload() }
    catch (e) { toast.error(e.message) }
  }
  async function loadOverrides() {
    try { setOverrides(await listOverrides(selected)) } catch (e) { toast.error(e.message) }
  }

  // فلترة + تجميع بالفئة مع الهرمية (الأب قبل أبنائه)
  const grouped = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const filtered = caps.filter((c) =>
      (!ql || c.key.toLowerCase().includes(ql) || (c.name || '').toLowerCase().includes(ql)) &&
      (!fType || c.type === fType) && (!fScope || c.scope === fScope) &&
      (!fRuntime || c.runtime_status === fRuntime) && (!fCat || c.category_key === fCat))
    const byCat = {}
    for (const c of filtered) { (byCat[c.category_key || '—'] ||= []).push(c) }
    for (const k of Object.keys(byCat)) {
      byCat[k].sort((a, b) => {
        const ga = a.parent_key || a.key, gb = b.parent_key || b.key
        if (ga !== gb) return ga.localeCompare(gb)
        const pa = a.parent_key ? 1 : 0, pb = b.parent_key ? 1 : 0
        return pa - pb || (a.sort_order - b.sort_order)
      })
    }
    return byCat
  }, [caps, q, fType, fScope, fRuntime, fCat])

  const capName = (k) => caps.find((c) => c.key === k)?.name || k

  if (loading) return <Loading />

  return (
    <>
      {canWrite && (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginBottom: '12px' }}>
          <button onClick={doSync} style={btn('#0E7490')}>⟳ مزامنة من Manifest</button>
          <button onClick={() => setNewCat(true)} style={btn('#374151')}>+ فئة</button>
          <button onClick={() => { setForm(EMPTY_FORM); setNewCap(true) }} style={btn(ACCENT)}>+ قدرة</button>
        </div>
      )}
      {err && <ErrBox msg={err} />}

      {/* فلاتر */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <input placeholder="🔍 بحث بالاسم/المفتاح…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, maxWidth: '220px' }} />
        <select value={fCat} onChange={(e) => setFCat(e.target.value)} style={{ ...inputStyle, maxWidth: '150px' }}>
          <option value="">كل الفئات</option>{cats.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.name}</option>)}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)} style={{ ...inputStyle, maxWidth: '120px' }}>
          <option value="">كل الأنواع</option>{TYPES.map((t) => <option key={t} value={t}>{TYPE_AR[t]}</option>)}
        </select>
        <select value={fScope} onChange={(e) => setFScope(e.target.value)} style={{ ...inputStyle, maxWidth: '120px' }}>
          <option value="">كل النطاقات</option>{SCOPES.map((s) => <option key={s} value={s}>{SCOPE_AR[s]}</option>)}
        </select>
        <select value={fRuntime} onChange={(e) => setFRuntime(e.target.value)} style={{ ...inputStyle, maxWidth: '120px' }}>
          <option value="">كل الحالات</option>{RUNTIMES.map((r) => <option key={r} value={r}>{RUNTIME_AR[r]}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,1fr) minmax(340px,1.4fr)', gap: '14px', alignItems: 'start' }}>
        {/* شجرة الكتالوج */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '10px', maxHeight: '72vh', overflowY: 'auto' }}>
          {Object.keys(grouped).sort().map((catKey) => {
            const cat = cats.find((c) => c.key === catKey)
            return (
              <div key={catKey} style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', color: MUTED, fontWeight: '800', padding: '4px 6px' }}>{cat ? `${cat.icon} ${cat.name}` : catKey}</div>
                {grouped[catKey].map((c) => (
                  <div key={c.key} onClick={() => openDetail(c.key)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 8px',
                      paddingRight: c.parent_key ? '24px' : '8px', borderRadius: '9px', cursor: 'pointer',
                      background: selected === c.key ? 'rgba(124,58,237,0.18)' : 'transparent' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: RUNTIME_COLOR[c.runtime_status] || MUTED, flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', color: 'white', fontWeight: c.parent_key ? '500' : '700' }}>{c.icon ? `${c.icon} ` : ''}{c.name}</span>
                    <span style={{ color: MUTED, fontSize: '10.5px' }}>{c.type !== 'feature' ? TYPE_AR[c.type] : ''}</span>
                    <span style={{ marginRight: 'auto', display: 'flex', gap: '4px', fontSize: '10px', color: MUTED }}>
                      {c.deps_count > 0 && <span title="تبعيات">🔗{c.deps_count}</span>}
                      {c.plans_count > 0 && <span title="باقات">📦{c.plans_count}</span>}
                      {c.overrides_count > 0 && <span title="تخصيصات">⚙{c.overrides_count}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
          {caps.length === 0 && <div style={{ color: MUTED, padding: '16px', fontSize: '13px' }}>لا قدرات — استخدم «مزامنة من Manifest».</div>}
        </div>

        {/* لوحة التفاصيل */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '16px', minHeight: '200px' }}>
          {!selected ? (
            <div style={{ color: MUTED, textAlign: 'center', padding: '48px', fontSize: '13px' }}>اختر قدرة لعرض تفاصيلها وتحريرها.</div>
          ) : !detail ? <Loading /> : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ ...mono, color: ACCENT, fontWeight: '700', fontSize: '13px' }}>{form.key}</div>
                {canWrite && <button onClick={() => removeCap(form.key)} style={btn('#7F1D1D')}>حذف</button>}
              </div>

              <CapForm form={form} setForm={setForm} cats={cats} caps={caps} />

              {/* Preview قبل الحفظ */}
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '11.5px', color: MUTED, fontWeight: '700', marginBottom: '6px' }}>👁️ معاينة الحمولة قبل الحفظ</div>
                <pre style={{ ...mono, background: '#0B0D12', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '10px', maxHeight: '160px', overflow: 'auto', color: '#A5B4FC', margin: 0 }}>
                  {JSON.stringify(payload, null, 2)}
                </pre>
              </div>
              {canWrite && <button onClick={save} style={{ ...btn(ACCENT), width: '100%', marginTop: '10px' }}>💾 حفظ التغييرات</button>}

              {/* التبعيات */}
              <Section title="🔗 التبعيات">
                {(detail.dependencies || []).map((d, i) => (
                  <Row key={i}>
                    <span style={{ fontSize: '12.5px', color: 'white' }}>{DEP_TYPE_AR[d.dependency_type] || d.dependency_type} ← {capName(d.depends_on_key)}</span>
                    {canWrite && <button onClick={async () => { await deleteDependency(form.key, d.depends_on_key, d.dependency_type); openDetail(form.key) }} style={btn('#374151')}>×</button>}
                  </Row>
                ))}
                {canWrite && <DepAdder caps={caps} selfKey={form.key} onAdd={async (dep, t) => { await setDependency(form.key, dep, t); openDetail(form.key) }} />}
              </Section>

              {/* الباقات المرتبطة */}
              <Section title="📦 الباقات المرتبطة">
                {(detail.plans || []).map((p, i) => (
                  <Row key={i}>
                    <span style={{ fontSize: '12.5px', color: 'white' }}>{p.plan_name} — {p.is_included ? 'مُضمَّنة' : 'مستبعَدة'}{p.value != null ? ` (${JSON.stringify(p.value)})` : ''}</span>
                    {canWrite && <button onClick={async () => { await deletePlanFeature(p.plan_id, form.key); openDetail(form.key) }} style={btn('#374151')}>×</button>}
                  </Row>
                ))}
                {canWrite && plans.length > 0 && <PlanAdder plans={plans} onAdd={async (pid, inc, val) => { await setPlanFeature(pid, form.key, inc, parseJsonish(val)); openDetail(form.key) }} />}
              </Section>

              {/* تخصيصات المطاعم */}
              <Section title={`⚙ تخصيصات المطاعم (${detail.overrides_count})`}>
                <div style={{ fontSize: '11px', color: MUTED, marginBottom: '4px' }}>
                  تخصيص قيمة القدرة لمطعم بعينه (يتجاوز الباقة والافتراضي). {form.type === 'feature' ? 'تفعيل/تعطيل.' : 'قيمة (مثل عدد الفروع).'}
                </div>
                {canWrite && (
                  <OverrideAdder restaurants={restaurants} capType={form.type}
                    onSet={async (rid, value) => { await setOverride(rid, form.key, value); loadOverrides() }} />
                )}
                {overrides == null ? (
                  <button onClick={loadOverrides} style={{ ...btn('#374151'), marginTop: '8px' }}>عرض التخصيصات الحالية</button>
                ) : overrides.length === 0 ? <div style={{ color: MUTED, fontSize: '12px', marginTop: '8px' }}>لا تخصيصات بعد.</div> : (
                  <div style={{ marginTop: '8px' }}>
                    {overrides.map((o) => (
                      <Row key={o.restaurant_id}>
                        <span style={{ fontSize: '12.5px', color: 'white' }}>
                          {o.restaurant_name}: <b style={{ color: '#C4B5FD' }}>{o.value != null ? JSON.stringify(o.value) : (o.enabled == null ? '—' : (o.enabled ? 'مفعّلة' : 'معطّلة'))}</b>
                        </span>
                        {canWrite && <button onClick={async () => { await setOverride(o.restaurant_id, form.key, null); loadOverrides() }} style={btn('#374151')}>إزالة</button>}
                      </Row>
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>

      {newCap && <NewCapModal cats={cats} onClose={() => setNewCap(false)} onSaved={async (k) => { setNewCap(false); await reload(); openDetail(k) }} />}
      {newCat && <NewCatModal onClose={() => setNewCat(false)} onSaved={async () => { setNewCat(false); await reload() }} />}
    </>
  )
}

// ============================================================================
// غلاف «سجل القدرات» — قائمة داخلية بخمس شاشات، كل شاشة مسؤولية واحدة (Product Design).
// نفس الخلفية وقاعدة البيانات — إعادة تنظيم عرض فقط.
// ============================================================================
const SCREENS = [
  { key: 'features',  label: '📚 مكتبة الميزات' },
  { key: 'plans',     label: '📦 الباقات' },
  { key: 'limits',    label: '📏 الحدود' },
  { key: 'overrides', label: '🏪 تخصيص المطاعم' },
  { key: 'advanced',  label: '⚙️ إعدادات متقدمة' },
]

export default function Catalog() {
  const [screen, setScreen] = useState('features')
  return (
    <AdminShell active="catalog" title="🧬 سجل القدرات">
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px', borderBottom: `1px solid ${BORDER}`, paddingBottom: '14px' }}>
        {SCREENS.map((s) => (
          <button key={s.key} onClick={() => setScreen(s.key)}
            style={{ padding: '9px 15px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '13px', border: 'none',
              background: screen === s.key ? ACCENT : '#12141C', color: screen === s.key ? 'white' : MUTED }}>
            {s.label}
          </button>
        ))}
      </div>
      {screen === 'features' ? <FeaturesLibrary />
        : screen === 'plans' ? <Plans />
        : screen === 'advanced' ? <AdvancedEditor />
        : <ComingSoon />}
    </AdminShell>
  )
}

function ComingSoon() {
  return (
    <div style={{ color: MUTED, textAlign: 'center', padding: '48px', fontSize: '13px', lineHeight: 1.8 }}>
      🚧 هذه الشاشة قيد الإنشاء.<br />الوظيفة متاحة مؤقتاً في «⚙️ إعدادات متقدمة».
    </div>
  )
}

// ===== مكوّنات مساعدة =====
function Section({ title, children }) {
  return (
    <div style={{ marginTop: '16px', borderTop: `1px solid ${BORDER}`, paddingTop: '12px' }}>
      <div style={{ fontSize: '12.5px', color: 'white', fontWeight: '800', marginBottom: '8px', fontFamily: 'Cairo,sans-serif' }}>{title}</div>
      {children}
    </div>
  )
}
function Row({ children }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 0' }}>{children}</div>
}

function CapForm({ form, setForm, cats, caps }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const toggleRole = (r) => setForm((f) => {
    const cur = Array.isArray(f.required_permissions) ? f.required_permissions : []
    return { ...f, required_permissions: cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r] }
  })
  const parents = caps.filter((c) => c.key !== form.key && !c.parent_key)
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <Field label="الاسم"><input value={form.name} onChange={set('name')} style={inputStyle} /></Field>
        <Field label="الأيقونة"><input value={form.icon} onChange={set('icon')} style={inputStyle} /></Field>
      </div>
      <Field label="الوصف"><input value={form.description} onChange={set('description')} style={inputStyle} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <Field label="الفئة"><select value={form.category_key} onChange={set('category_key')} style={inputStyle}><option value="">—</option>{cats.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select></Field>
        <Field label="الأب (Hierarchy)"><select value={form.parent_key} onChange={set('parent_key')} style={inputStyle}><option value="">—</option>{parents.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select></Field>
        <Field label="النوع"><select value={form.type} onChange={set('type')} style={inputStyle}>{TYPES.map((t) => <option key={t} value={t}>{TYPE_AR[t]}</option>)}</select></Field>
        <Field label="النطاق"><select value={form.scope} onChange={set('scope')} style={inputStyle}>{SCOPES.map((s) => <option key={s} value={s}>{SCOPE_AR[s]}</option>)}</select></Field>
        <Field label="الشكل"><select value={form.kind} onChange={set('kind')} style={inputStyle}><option value="">—</option>{KINDS.map((k) => <option key={k} value={k}>{KIND_AR[k]}</option>)}</select></Field>
        <Field label="الوحدة (module)"><input value={form.module} onChange={set('module')} style={inputStyle} /></Field>
        <Field label="حالة التعريف"><select value={form.lifecycle_status} onChange={set('lifecycle_status')} style={inputStyle}>{LIFECYCLES.map((s) => <option key={s} value={s}>{LIFECYCLE_AR[s]}</option>)}</select></Field>
        <Field label="حالة التشغيل"><select value={form.runtime_status} onChange={set('runtime_status')} style={inputStyle}>{RUNTIMES.map((s) => <option key={s} value={s}>{RUNTIME_AR[s]}</option>)}</select></Field>
        <Field label="الترتيب"><input type="number" value={form.sort_order} onChange={set('sort_order')} style={inputStyle} /></Field>
      </div>
      {form.type === 'feature' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: MUTED, fontSize: '12.5px', margin: '4px 0 10px' }}>
          <input type="checkbox" checked={form.enabled_global} onChange={set('enabled_global')} /> مفعّلة افتراضياً (enabled_global)
        </label>
      )}
      {form.type !== 'feature' && (
        <Field label="القيمة الافتراضية (JSON: رقم/سلسلة/مصفوفة)"><input value={form.default_value_text} onChange={set('default_value_text')} style={{ ...inputStyle, ...mono }} placeholder='مثال: 50 أو "self"' /></Field>
      )}
      {form.type === 'mode' && (
        <Field label='القيم المسموحة (JSON array)'><input value={form.allowed_values_text} onChange={set('allowed_values_text')} style={{ ...inputStyle, ...mono }} placeholder='["none","self","integrated"]' /></Field>
      )}
      {form.type === 'limit' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <Field label="المقياس (metric)"><input value={form.metric} onChange={set('metric')} style={inputStyle} placeholder="products/storage_mb…" /></Field>
          <Field label="الوحدة (unit)"><input value={form.unit} onChange={set('unit')} style={inputStyle} placeholder="count/mb…" /></Field>
        </div>
      )}
      <Field label="الأدوار المسموح لها (required_permissions) — فارغ = الجميع">
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {PERM_ROLES.map((r) => {
            const on = (form.required_permissions || []).includes(r)
            return (
              <button key={r} type="button" onClick={() => toggleRole(r)}
                style={{ padding: '7px 12px', borderRadius: '9px', cursor: 'pointer', fontSize: '12px', fontWeight: '700',
                  border: `1.5px solid ${on ? ACCENT : BORDER}`, background: on ? 'rgba(124,58,237,0.18)' : '#0B0D12', color: on ? '#C4B5FD' : MUTED }}>
                {ROLE_AR[r]}
              </button>
            )
          })}
        </div>
      </Field>
      <Field label="رسالة الترقية"><input value={form.upgrade_message} onChange={set('upgrade_message')} style={inputStyle} /></Field>
    </div>
  )
}

function OverrideAdder({ restaurants, capType, onSet }) {
  const [rid, setRid] = useState('')
  const [val, setVal] = useState('')
  const [grant, setGrant] = useState(true)
  const isFeature = capType === 'feature'
  return (
    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
      <select value={rid} onChange={(e) => setRid(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: '130px' }}>
        <option value="">اختر مطعماً…</option>
        {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      {isFeature ? (
        <select value={grant ? '1' : '0'} onChange={(e) => setGrant(e.target.value === '1')} style={{ ...inputStyle, maxWidth: '110px' }}>
          <option value="1">تفعيل</option>
          <option value="0">تعطيل</option>
        </select>
      ) : (
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="القيمة (مثل 3)" style={{ ...inputStyle, ...mono, maxWidth: '120px' }} />
      )}
      <button disabled={!rid} onClick={() => { onSet(rid, isFeature ? grant : parseJsonish(val)); setRid(''); setVal('') }} style={btn(ACCENT)}>حفظ التخصيص</button>
    </div>
  )
}

function DepAdder({ caps, selfKey, onAdd }) {
  const [dep, setDep] = useState(''); const [t, setT] = useState('required')
  return (
    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
      <select value={dep} onChange={(e) => setDep(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
        <option value="">يعتمد على…</option>{caps.filter((c) => c.key !== selfKey).map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
      </select>
      <select value={t} onChange={(e) => setT(e.target.value)} style={{ ...inputStyle, maxWidth: '110px' }}>{DEP_TYPES.map((x) => <option key={x} value={x}>{DEP_TYPE_AR[x]}</option>)}</select>
      <button disabled={!dep} onClick={() => { onAdd(dep, t); setDep('') }} style={btn(ACCENT)}>+</button>
    </div>
  )
}
function PlanAdder({ plans, onAdd }) {
  const [pid, setPid] = useState(''); const [inc, setInc] = useState(true); const [val, setVal] = useState('')
  return (
    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
      <select value={pid} onChange={(e) => setPid(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: '120px' }}>
        <option value="">باقة…</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: MUTED, fontSize: '12px' }}>
        <input type="checkbox" checked={inc} onChange={(e) => setInc(e.target.checked)} /> مُضمَّنة
      </label>
      <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="قيمة (اختياري)" style={{ ...inputStyle, ...mono, maxWidth: '110px' }} />
      <button disabled={!pid} onClick={() => { onAdd(pid, inc, val); setPid(''); setVal('') }} style={btn(ACCENT)}>+</button>
    </div>
  )
}

function NewCapModal({ cats, onClose, onSaved }) {
  const [f, setF] = useState({ key: '', name: '', type: 'feature', scope: 'restaurant', category_key: '', enabled_global: true })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  async function save() {
    try { const k = await upsertCapability({ ...f, category_key: f.category_key || null }); toast.success('أُنشئت'); onSaved(k) }
    catch (e) { toast.error(e.message) }
  }
  return (
    <Modal title="+ قدرة جديدة" onClose={onClose}>
      <Field label="المفتاح (snake_case)"><input value={f.key} onChange={set('key')} style={{ ...inputStyle, ...mono }} placeholder="online_orders" /></Field>
      <Field label="الاسم"><input value={f.name} onChange={set('name')} style={inputStyle} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <Field label="النوع"><select value={f.type} onChange={set('type')} style={inputStyle}>{TYPES.map((t) => <option key={t} value={t}>{TYPE_AR[t]}</option>)}</select></Field>
        <Field label="النطاق"><select value={f.scope} onChange={set('scope')} style={inputStyle}>{SCOPES.map((s) => <option key={s} value={s}>{SCOPE_AR[s]}</option>)}</select></Field>
      </div>
      <Field label="الفئة"><select value={f.category_key} onChange={set('category_key')} style={inputStyle}><option value="">—</option>{cats.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select></Field>
      {f.type === 'feature' && <label style={{ display: 'flex', gap: '8px', color: MUTED, fontSize: '12.5px', marginBottom: '12px' }}><input type="checkbox" checked={f.enabled_global} onChange={set('enabled_global')} /> مفعّلة افتراضياً</label>}
      <button onClick={save} style={{ ...btn(ACCENT), width: '100%' }}>إنشاء</button>
    </Modal>
  )
}
function NewCatModal({ onClose, onSaved }) {
  const [f, setF] = useState({ key: '', name: '', name_en: '', icon: '', sort_order: 0 })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  async function save() {
    try { await upsertCategory({ ...f, sort_order: Number(f.sort_order) || 0 }); toast.success('أُنشئت الفئة'); onSaved() }
    catch (e) { toast.error(e.message) }
  }
  return (
    <Modal title="+ فئة جديدة" onClose={onClose}>
      <Field label="المفتاح (snake_case)"><input value={f.key} onChange={set('key')} style={{ ...inputStyle, ...mono }} /></Field>
      <Field label="الاسم"><input value={f.name} onChange={set('name')} style={inputStyle} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <Field label="بالإنجليزية"><input value={f.name_en} onChange={set('name_en')} style={inputStyle} /></Field>
        <Field label="الأيقونة"><input value={f.icon} onChange={set('icon')} style={inputStyle} /></Field>
      </div>
      <Field label="الترتيب"><input type="number" value={f.sort_order} onChange={set('sort_order')} style={inputStyle} /></Field>
      <button onClick={save} style={{ ...btn(ACCENT), width: '100%' }}>إنشاء</button>
    </Modal>
  )
}
