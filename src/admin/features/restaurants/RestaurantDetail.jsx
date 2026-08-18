import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import AdminShell from '../../AdminShell'
import { PANEL as CARD, BORDER, MUTED, ACCENT, DANGER, SUCCESS } from '../../theme'
import { getRestaurant, getRestaurantOperational, getRestaurantFeatures, setPlatformSuspended, setRestaurantPlan, can } from './restaurantsApi'
import Button from '../../components/ui/Button'
import Modal, { ModalActions } from '../../components/ui/Modal'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { SkeletonTiles } from '../../components/ui/Skeleton'

const PLAN_OPTIONS = ['starter', 'pro', 'business']
const HEALTH_C = { green: '#6EE7B7', yellow: '#FBBF24', red: '#F87171' }
const INV_C = { draft: '#9CA3AF', open: '#FBBF24', paid: '#6EE7B7', void: '#9CA3AF' }
const num = (v) => Number(v) || 0
const fmt = (v) => num(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmtDateTime = (v) => v ? new Date(v).toLocaleString('ar', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

const Section = ({ title, children }) => (
  <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '16px', marginBottom: '12px' }}>
    {title && <div style={{ fontSize: '13px', fontWeight: '800', color: 'white', fontFamily: 'Tajawal,sans-serif', marginBottom: '12px' }}>{title}</div>}
    {children}
  </div>
)
const Empty = ({ msg }) => <div style={{ color: MUTED, fontSize: '12px' }}>{msg}</div>

export default function RestaurantDetail() {
  const { id } = useParams()
  const [canManage, setCanManage] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('overview')
  const [planSel, setPlanSel] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  // الحالة التشغيلية — Lazy: تُجلب مرة واحدة عند أول فتح للتبويب
  const [op, setOp] = useState(null)
  const [opState, setOpState] = useState('idle') // idle | loading | done | error
  const [feat, setFeat] = useState(null)
  const [featState, setFeatState] = useState('idle')

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    ;(async () => {
      try { const data = await getRestaurant(id); if (!cancelled) { setD(data); setPlanSel(data?.subscription_plan || '') } }
      catch (e) { if (!cancelled) setError(e?.message || 'تعذّر التحميل') }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [id, reloadKey])

  // صلاحية الإدارة الفعلية عبر RBAC (نفس نمط can() في باقي شاشات المشرف) — لا مطابقة اسم دور حرفية.
  useEffect(() => { can('manage_restaurants').then(setCanManage).catch(() => {}) }, [])

  // جلب الحالة التشغيلية عند أول فتح للتبويب فقط
  useEffect(() => {
    if (tab !== 'operational' || opState !== 'idle') return
    let cancelled = false
    setOpState('loading')
    getRestaurantOperational(id)
      .then((data) => { if (!cancelled) { setOp(data); setOpState('done') } })
      .catch(() => { if (!cancelled) setOpState('error') })
    return () => { cancelled = true }
    // ملاحظة: لا نضع opState في الاعتماديات — ضبطه إلى loading يعيد تشغيل التأثير فيُلغي طلبه (stuck loading).
  }, [tab, id])

  // المزايا الفعّالة — نداء مستقل، عند أول فتح للتبويب فقط
  useEffect(() => {
    if (tab !== 'operational' || featState !== 'idle') return
    let cancelled = false
    setFeatState('loading')
    getRestaurantFeatures(id)
      .then((data) => { if (!cancelled) { setFeat(data); setFeatState('done') } })
      .catch(() => { if (!cancelled) setFeatState('error') })
    return () => { cancelled = true }
    // ملاحظة: لا نضع featState في الاعتماديات (نفس سبب opState أعلاه).
  }, [tab, id])

  const runConfirm = async () => {
    if (!confirm) return
    setBusy(true)
    try { await confirm.action(); toast.success('تم بنجاح') }
    catch (e) { toast.error(e?.message || 'فشل الإجراء') }
    finally { setBusy(false); setConfirm(null) }
  }
  const askToggleSuspend = () => setConfirm({
    title: d.platform_suspended ? 'رفع تعليق المنصّة' : 'تعليق من المنصّة',
    msg: d.platform_suspended ? 'سيعود المطعم لاستقبال الطلبات.' : 'سيتوقّف المطعم عن استقبال الطلبات فوراً، ولا يستطيع صاحبه رفعه.',
    action: async () => { const nv = await setPlatformSuspended(d.id, !d.platform_suspended); setD(x => ({ ...x, platform_suspended: nv })) },
  })
  const askApplyPlan = () => setConfirm({
    title: 'تغيير الخطة', msg: `تغيير خطة «${d.name}» إلى «${planSel}»؟`,
    action: async () => { const nv = await setRestaurantPlan(d.id, planSel); setD(x => ({ ...x, subscription_plan: nv })) },
  })

  const st = d?.stats || {}
  const daily = d?.daily || []
  const maxOrders = Math.max(...daily.map(x => num(x.orders)), 1)
  const TABS = [['overview', 'نظرة عامة'], ['operational', '🩺 الحالة التشغيلية'], ['orders', 'الطلبات'], ['billing', 'الفوترة'], ['branches', `الفروع (${(d?.branches || []).length})`], ['activity', 'النشاط']]

  return (
    <AdminShell active="restaurants" title="ملف المطعم">
      <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
        <Link to="/admin/restaurants" style={{ color: MUTED, fontSize: '12.5px', textDecoration: 'none', fontWeight: '700' }}>← كل المطاعم</Link>

        {error ? (
          <div style={{ marginTop: '14px' }}><ErrorState msg={error} onRetry={() => setReloadKey((k) => k + 1)} /></div>
        ) : loading ? (
          <div style={{ marginTop: '14px' }}><SkeletonTiles count={4} /></div>
        ) : !d ? (
          <EmptyState msg="المطعم غير موجود" />
        ) : (
          <div style={{ marginTop: '14px' }}>
            {/* رأس */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '18px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '13px', background: 'rgba(255,106,0,0.15)', border: `1px solid ${ACCENT}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>🏪</div>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <span style={{ fontFamily: 'Tajawal,sans-serif', fontWeight: '900', fontSize: '18px', color: 'white' }}>{d.name}</span>
                  {st.health_band && <span style={{ fontSize: '11px', fontWeight: '800', color: HEALTH_C[st.health_band] }}>● صحّة {num(st.health_score)}</span>}
                  {d.platform_suspended && <span style={{ fontSize: '10px', fontWeight: '800', color: '#FCA5A5', background: 'rgba(239,68,68,0.18)', border: '1px solid #B91C1C', borderRadius: '100px', padding: '2px 9px' }}>🚫 معلّق</span>}
                  <span style={{ fontSize: '10px', fontWeight: '800', color: '#FFB27F', background: 'rgba(255,106,0,0.12)', borderRadius: '100px', padding: '2px 9px' }}>{d.subscription_plan || '—'}</span>
                </div>
                <div style={{ fontSize: '12px', color: MUTED, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ direction: 'ltr' }}>/{d.slug}</span>
                  {d.owner_email && <span style={{ direction: 'ltr' }}>· {d.owner_email}</span>}
                  {d.phone && <span style={{ direction: 'ltr' }}>· {d.phone}</span>}
                </div>
              </div>
            </div>

            {/* تبويبات */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '14px', borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
              {TABS.map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} style={{ padding: '9px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'Tajawal,sans-serif', fontWeight: '800', fontSize: '12.5px', color: tab === k ? 'white' : MUTED, borderBottom: tab === k ? `2px solid ${ACCENT}` : '2px solid transparent' }}>{l}</button>
              ))}
            </div>

            {/* نظرة عامة */}
            {tab === 'overview' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '12px', marginBottom: '12px' }}>
                  {[
                    { label: 'MRR', val: `${fmt(st.mrr)} ﷼`, sub: st.subscription_status || 'بلا اشتراك' },
                    { label: 'الطلبات', val: fmt(d.orders_total), sub: `${fmt(d.orders_30d)} آخر 30ي` },
                    { label: 'الإيراد (مكتمل)', val: `${fmt(d.revenue_total)} ﷼` },
                    { label: 'العملاء', val: fmt(d.customers_count) },
                    { label: 'خطر الإلغاء', val: st.churn_risk === 'high' ? 'مرتفع 🔴' : st.churn_risk === 'med' ? 'متوسط 🟡' : 'منخفض 🟢' },
                    { label: 'مستحقّ مفتوح', val: `${fmt(st.outstanding_amount)} ﷼` },
                  ].map(k => (
                    <div key={k.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '14px' }}>
                      <div style={{ fontFamily: 'Tajawal,sans-serif', fontWeight: '900', fontSize: '18px', color: 'white', marginBottom: '2px' }}>{k.val}</div>
                      <div style={{ fontSize: '12px', color: '#D1D5DB', fontWeight: '700' }}>{k.label}</div>
                      {k.sub && <div style={{ fontSize: '10.5px', color: MUTED, marginTop: '3px' }}>{k.sub}</div>}
                    </div>
                  ))}
                </div>
                {canManage && (
                  <Section title="⚙️ إجراءات الإدارة">
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <Button variant={d.platform_suspended ? 'success' : 'danger'} onClick={askToggleSuspend} disabled={busy}>{d.platform_suspended ? '▶ رفع تعليق المنصّة' : '⛔ تعليق من المنصّة'}</Button>
                      <span style={{ width: '1px', height: '26px', background: BORDER }} />
                      <select value={planSel} onChange={e => setPlanSel(e.target.value)} className="admin-select" style={{ width: 'auto' }}>
                        {[...new Set([...(d.subscription_plan ? [d.subscription_plan] : []), ...PLAN_OPTIONS])].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <Button variant="ghost" onClick={askApplyPlan} disabled={busy || !planSel || planSel === d.subscription_plan} style={{ opacity: (!planSel || planSel === d.subscription_plan) ? 0.5 : 1 }}>تطبيق الخطة</Button>
                    </div>
                  </Section>
                )}
              </>
            )}

            {/* الحالة التشغيلية */}
            {tab === 'operational' && (
              opState === 'loading' ? <Empty msg="جارٍ التحميل…" />
              : opState === 'error' ? <Empty msg="تعذّر تحميل الحالة التشغيلية" />
              : op ? (() => {
                const m = op.menu || {}, c = op.config || {}
                const warn = (bad) => (bad ? '#FBBF24' : '#6EE7B7')
                const menuTiles = [
                  { label: 'الأقسام', val: num(m.categories), bad: num(m.categories) === 0 },
                  { label: 'المنتجات', val: num(m.products_total), bad: num(m.products_total) === 0 },
                  { label: 'متاح', val: num(m.products_available), bad: false },
                  { label: 'مخفي', val: num(m.products_hidden), bad: num(m.products_hidden) > 0 },
                  { label: 'بلا قسم', val: num(m.uncategorized), bad: num(m.uncategorized) > 0 },
                  { label: 'بلا سعر', val: num(m.missing_price), bad: num(m.missing_price) > 0 },
                  { label: 'بلا صورة', val: num(m.missing_image), bad: num(m.missing_image) > 0 },
                ]
                const menuUrl = c.slug ? `${window.location.origin}/menu/${c.slug}` : null
                const readiness = [
                  { label: 'المطعم نشِط', ok: !!c.is_active },
                  { label: 'غير معلّق من المنصّة', ok: !c.platform_suspended },
                  { label: 'رابط عام (slug)', ok: !!c.slug },
                  { label: 'عملة محدّدة', ok: !!c.currency },
                  { label: 'شعار', ok: !!c.has_logo },
                  { label: 'هاتف', ok: !!c.has_phone },
                  { label: 'عنوان', ok: !!c.has_address },
                  { label: 'فرع نشط واحد على الأقل', ok: num(c.branches_active) > 0 },
                ]
                return (
                  <>
                    <Section title="🍽️ جاهزية المنيو">
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: '10px' }}>
                        {menuTiles.map(t => (
                          <div key={t.label} style={{ background: '#0B0D12', border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '12px' }}>
                            <div style={{ fontFamily: 'Tajawal,sans-serif', fontWeight: '900', fontSize: '20px', color: warn(t.bad) }}>{fmt(t.val)}</div>
                            <div style={{ fontSize: '11.5px', color: '#D1D5DB', fontWeight: '700', marginTop: '2px' }}>{t.label}</div>
                          </div>
                        ))}
                      </div>
                    </Section>
                    <Section title="⚙️ جاهزية الإعداد">
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '8px', marginBottom: menuUrl ? '14px' : 0 }}>
                        {readiness.map(r => (
                          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: '9px', fontSize: '12.5px' }}>
                            <span style={{ color: r.ok ? '#6EE7B7' : '#FBBF24', fontWeight: '900' }}>{r.ok ? '✓' : '✗'}</span>
                            <span style={{ color: '#D1D5DB' }}>{r.label}</span>
                          </div>
                        ))}
                      </div>
                      {menuUrl && (
                        <div style={{ fontSize: '12px', color: MUTED, borderTop: `1px solid ${BORDER}`, paddingTop: '12px' }}>
                          الرابط العام:{' '}
                          <a href={menuUrl} target="_blank" rel="noreferrer" style={{ color: '#FFB27F', direction: 'ltr', display: 'inline-block' }}>{menuUrl}</a>
                          <span style={{ marginInlineStart: '8px' }}>· الفروع النشطة {fmt(c.branches_active)}/{fmt(c.branches_total)}</span>
                        </div>
                      )}
                    </Section>
                    <Section title="🚩 المزايا الفعّالة">
                      {featState === 'loading' ? <Empty msg="جارٍ التحميل…" />
                        : featState === 'error' ? <Empty msg="تعذّر تحميل المزايا" />
                        : (feat || []).length === 0 ? <Empty msg="لا مزايا معرّفة على المنصّة." />
                        : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {feat.map(fx => (
                              <div key={fx.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${BORDER}` }}>
                                <span style={{ color: fx.effective ? '#6EE7B7' : '#F87171', fontWeight: '900', fontSize: '13px' }}>{fx.effective ? '●' : '○'}</span>
                                <span style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', direction: 'ltr', fontSize: '12.5px', color: 'white', fontWeight: '700' }}>{fx.key}</span>
                                {fx.description && <span style={{ fontSize: '11px', color: MUTED, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fx.description}</span>}
                                <span style={{ marginInlineStart: 'auto', fontSize: '10px', fontWeight: '800', color: fx.effective ? '#6EE7B7' : '#F87171' }}>{fx.effective ? 'مفعّلة' : 'معطّلة'}</span>
                                {fx.overridden && <span style={{ fontSize: '10px', fontWeight: '800', color: '#FFB27F', background: 'rgba(255,106,0,0.15)', borderRadius: '100px', padding: '2px 9px' }}>مُخصّص</span>}
                              </div>
                            ))}
                          </div>
                        )}
                    </Section>
                  </>
                )
              })() : <Empty msg="لا بيانات" />
            )}

            {/* الطلبات */}
            {tab === 'orders' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '12px' }}>
                <Section title="📈 الطلبات — آخر 14 يوماً">
                  {daily.length === 0 ? <Empty msg="لا بيانات" /> : (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '110px' }}>
                      {daily.map((x, i) => (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', height: '100%', justifyContent: 'flex-end' }}>
                          <div style={{ fontSize: '9px', color: MUTED }}>{num(x.orders) || ''}</div>
                          <div title={x.d} style={{ width: '100%', borderRadius: '4px 4px 0 0', background: i === daily.length - 1 ? ACCENT : 'rgba(255,106,0,0.4)', height: `${Math.max((num(x.orders) / maxOrders) * 88, num(x.orders) > 0 ? 6 : 0)}%` }} />
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
                <Section title="الأكثر طلبًا 🔥">
                  {(d.top_products || []).length === 0 ? <Empty msg="لا بيانات" /> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                      {d.top_products.map((p, i) => (
                        <div key={p.name + i} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                          <span style={{ fontSize: '12.5px', color: '#D1D5DB', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                          <span style={{ fontFamily: 'Tajawal,sans-serif', fontWeight: '900', color: 'white', fontSize: '13px' }}>{fmt(p.count)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            )}

            {/* الفوترة */}
            {tab === 'billing' && (
              <>
                <Section title="🔁 الاشتراك">
                  {!d.subscription ? <Empty msg="لا يوجد اشتراك مُسجّل" /> : (
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '12.5px', color: '#D1D5DB' }}>
                      <div><div style={{ color: MUTED, fontSize: '11px' }}>الباقة</div>{d.subscription.plan_label || '—'}</div>
                      <div><div style={{ color: MUTED, fontSize: '11px' }}>المبلغ</div>{fmt(d.subscription.amount)} ﷼ / {d.subscription.billing_cycle === 'yearly' ? 'سنوي' : 'شهري'}</div>
                      <div><div style={{ color: MUTED, fontSize: '11px' }}>الحالة</div>{d.subscription.status}</div>
                      <div><div style={{ color: MUTED, fontSize: '11px' }}>تنتهي</div>{fmtDate(d.subscription.current_period_end)}</div>
                    </div>
                  )}
                </Section>
                <Section title={`🧾 الفواتير (${(d.invoices || []).length})`}>
                  {(d.invoices || []).length === 0 ? <Empty msg="لا فواتير" /> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {d.invoices.map(i => (
                        <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, fontSize: '12.5px' }}>
                          <span style={{ color: 'white', fontWeight: '700' }}>#{i.number}</span>
                          <span style={{ fontSize: '10px', fontWeight: '800', color: INV_C[i.status] }}>{i.status}</span>
                          <span style={{ flex: 1, color: MUTED, fontSize: '11px' }}>أُصدرت {fmtDate(i.issued_at)}</span>
                          <span style={{ color: 'white', fontWeight: '700' }}>{fmt(i.total)} ﷼</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </>
            )}

            {/* الفروع */}
            {tab === 'branches' && (
              <Section title={`🏢 الفروع (${(d.branches || []).length})`}>
                {(d.branches || []).length === 0 ? <Empty msg="لا فروع" /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {d.branches.map(b => (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${BORDER}` }}>
                        <span>{b.is_primary ? '🏠' : '🏢'}</span>
                        <span style={{ flex: 1, fontSize: '13px', fontWeight: '700', color: 'white' }}>{b.name}</span>
                        {b.address && <span style={{ fontSize: '11px', color: MUTED }}>{b.address}</span>}
                        <span style={{ fontSize: '10px', fontWeight: '800', color: b.is_active ? '#6EE7B7' : '#FCA5A5' }}>{b.is_active ? (b.is_paused ? 'موقوف مؤقتاً' : 'نشط') : 'معطّل'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {/* النشاط */}
            {tab === 'activity' && (
              <Section title="📜 نشاط المنصّة على هذا المطعم">
                {(d.activity || []).length === 0 ? <Empty msg="لا نشاط مُسجّل" /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    {d.activity.map((a, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: ACCENT, flexShrink: 0 }} />
                        <span style={{ flex: 1, color: '#D1D5DB' }}>{a.action}</span>
                        <span style={{ color: MUTED, fontSize: '11px' }}>{fmtDateTime(a.at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}
          </div>
        )}

        {confirm && (
          <Modal title={confirm.title} onClose={() => !busy && setConfirm(null)} maxWidth="360px">
            <div style={{ fontSize: '13px', color: MUTED, lineHeight: 1.7, marginBottom: '18px' }}>{confirm.msg}</div>
            <ModalActions busy={busy} onSave={runConfirm} saveLabel="تأكيد" onCancel={() => setConfirm(null)} />
          </Modal>
        )}
      </div>
    </AdminShell>
  )
}
