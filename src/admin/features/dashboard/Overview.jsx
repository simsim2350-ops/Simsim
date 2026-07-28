import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import AdminShell from '../../AdminShell'
import { dashboard, refreshMetrics } from './dashboardApi'
import { PANEL as CARD, BORDER, MUTED, ACCENT } from '../../theme'
import { ErrorState } from '../../components/ui/States'
import { SkeletonTiles, SkeletonChart, SkeletonRows } from '../../components/ui/Skeleton'
import { IconRefresh } from '../../components/ui/Icon'

const num = (v) => Number(v) || 0
const fmt = (v) => num(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
const money = (v) => num(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ﷼'
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) : '—'
const daysAgo = (iso) => { if (!iso) return '—'; const d = Math.floor((Date.now() - new Date(iso)) / 86400000); return d <= 0 ? 'اليوم' : `${d} يوم` }

function Bars({ data, valKey, height = 130 }) {
  const max = Math.max(...data.map((x) => num(x[valKey])), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height, overflowX: 'auto' }}>
      {data.map((x, i) => (
        <div key={i} title={`${x.d}: ${fmt(x[valKey])}`} style={{ flex: '1 0 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
          <div style={{ width: '100%', borderRadius: '3px 3px 0 0', background: i === data.length - 1 ? ACCENT : 'rgba(124,58,237,0.4)', height: `${Math.max((num(x[valKey]) / max) * 92, num(x[valKey]) > 0 ? 4 : 0)}%` }} />
        </div>
      ))}
    </div>
  )
}

const HEALTH_C = { green: '#6EE7B7', yellow: '#FBBF24', red: '#F87171' }

export default function Overview() {
  const navigate = useNavigate()
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  // إعادة ضبط error/loading في كل نداء — ضروري لأن onRetry يستدعي load() نفسها بعد فشل سابق.
  const load = () => {
    setLoading(true); setError(null)
    dashboard().then(setD).catch((e) => setError(e?.message || 'تعذّر التحميل')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const doRefresh = async () => {
    setRefreshing(true)
    try { await refreshMetrics(); await load(); toast.success('تم التحديث') }
    catch (e) { toast.error(e?.message || 'فشل') } finally { setRefreshing(false) }
  }

  const k = d?.kpis || {}
  const a = d?.alerts || {}
  const mrrDelta = (k.mrr != null && k.mrr_30d_ago != null && num(k.mrr_30d_ago) > 0)
    ? Math.round(((num(k.mrr) - num(k.mrr_30d_ago)) / num(k.mrr_30d_ago)) * 100) : null
  const alertCount = (a.overdue?.length || 0) + (a.expiring?.length || 0) + (a.churn?.length || 0)

  const tiles = [
    { label: 'MRR (إيراد شهري متكرّر)', val: money(k.mrr), delta: mrrDelta, sub: 'من الاشتراكات النشطة' },
    { label: 'المطاعم النشطة', val: `${fmt(k.active_restaurants)} / ${fmt(k.total_restaurants)}`, sub: `+${fmt(k.new_restaurants_7d)} هذا الأسبوع` },
    { label: 'الطلبات (30 يوم)', val: fmt(k.orders_30d), sub: 'عبر كل المطاعم' },
    { label: 'مستحقّات مفتوحة', val: money(k.outstanding_amount), sub: `${fmt(a.overdue?.length)} فاتورة متأخّرة`, warn: num(k.outstanding_amount) > 0 },
  ]

  return (
    <AdminShell active="overview" title="نظرة عامة">
      <div style={{ padding: '20px', maxWidth: '1100px', margin: '0 auto' }}>
        {/* شريط علوي */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '11px', color: MUTED }}>آخر تحديث {fmtTime(d?.updated_at)}</span>
          <button onClick={doRefresh} disabled={refreshing} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '8px 13px', color: '#C4B5FD', fontFamily: 'Cairo,sans-serif', fontWeight: '700', fontSize: '12px', cursor: 'pointer', opacity: refreshing ? 0.6 : 1 }}><IconRefresh size={13} /> تحديث</button>
        </div>

        {error ? (
          <ErrorState msg={error} onRetry={load} />
        ) : loading ? (
          <>
            <SkeletonTiles count={4} />
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '16px', marginBottom: '12px' }}>
              <SkeletonChart />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              <SkeletonRows count={3} />
              <SkeletonRows count={3} />
            </div>
          </>
        ) : (
          <>
            {/* 🔔 يحتاج تدخّلك */}
            {alertCount > 0 && (
              <div style={{ background: CARD, border: '1px solid rgba(251,191,36,0.35)', borderRadius: '14px', padding: '14px 16px', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#FBBF24', fontFamily: 'Cairo,sans-serif', marginBottom: '10px' }}>🔔 يحتاج تدخّلك ({alertCount})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {(a.overdue || []).map((x, i) => (
                    <AlertRow key={`o${i}`} color="#F87171" text={`فاتورة متأخّرة: ${x.restaurant} — ${money(x.amount)} منذ ${x.days} يوم`} onClick={() => navigate('/admin/billing')} />
                  ))}
                  {(a.expiring || []).map((x, i) => (
                    <AlertRow key={`e${i}`} color="#FBBF24" text={`اشتراك ينتهي قريباً: ${x.restaurant} — ${x.period_end}`} onClick={() => navigate('/admin/billing')} />
                  ))}
                  {(a.churn || []).map((x, i) => (
                    <AlertRow key={`c${i}`} color="#F87171" text={`خطر إلغاء: ${x.restaurant} — صحّة ${x.health} · آخر طلب ${daysAgo(x.last_order)}`} onClick={() => navigate('/admin/restaurants')} />
                  ))}
                </div>
              </div>
            )}

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              {tiles.map((t) => (
                <div key={t.label} style={{ background: CARD, border: `1px solid ${t.warn ? 'rgba(251,191,36,0.35)' : BORDER}`, borderRadius: '14px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '900', fontSize: '22px', color: 'white' }}>{t.val}</div>
                    {t.delta != null && (
                      <span style={{ fontSize: '12px', fontWeight: '800', color: t.delta >= 0 ? '#6EE7B7' : '#F87171' }}>{t.delta >= 0 ? '▲' : '▼'} {Math.abs(t.delta)}%</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#D1D5DB', fontWeight: '700', marginBottom: '3px' }}>{t.label}</div>
                  <div style={{ fontSize: '11px', color: MUTED }}>{t.sub}</div>
                </div>
              ))}
            </div>

            {/* الطلبات 30 يوم */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '16px', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: 'white', fontFamily: 'Cairo,sans-serif', marginBottom: '14px' }}>📈 الطلبات — آخر 30 يوماً</div>
              {(d?.series?.length || 0) === 0 ? <div style={{ color: MUTED, fontSize: '12px' }}>لا بيانات كافية بعد</div> : <Bars data={d.series} valKey="orders" />}
            </div>

            {/* أكثر نمواً / أقل نشاطاً */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              <ListCard title="🚀 الأكثر نمواً" rows={d?.top_growing} empty="لا بيانات نمو بعد"
                render={(x) => [x.restaurant, <span style={{ color: '#6EE7B7', fontWeight: '800' }}>{num(x.growth) >= 0 ? '+' : ''}{fmt(x.growth)}%</span>]} />
              <ListCard title="😴 الأقل نشاطاً (خطر Churn)" rows={d?.least_active} empty="لا بيانات"
                render={(x) => [x.restaurant, <span style={{ color: HEALTH_C[x.health >= 70 ? 'green' : x.health >= 40 ? 'yellow' : 'red'], fontWeight: '800' }}>{fmt(x.orders)} طلب · صحّة {x.health}</span>]} />
            </div>
          </>
        )}
      </div>
    </AdminShell>
  )
}

function AlertRow({ color, text, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer', fontSize: '12.5px', color: '#E5E7EB' }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{text}</span>
      <span style={{ color: MUTED, fontSize: '11px' }}>عرض ←</span>
    </div>
  )
}

function ListCard({ title, rows, render, empty }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '16px' }}>
      <div style={{ fontSize: '13px', fontWeight: '800', color: 'white', fontFamily: 'Cairo,sans-serif', marginBottom: '12px' }}>{title}</div>
      {(rows?.length || 0) === 0 ? <div style={{ color: MUTED, fontSize: '12px' }}>{empty}</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          {rows.map((x, i) => {
            const [name, right] = render(x)
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12.5px', color: '#D1D5DB', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                <span style={{ fontSize: '12px', flexShrink: 0 }}>{right}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
