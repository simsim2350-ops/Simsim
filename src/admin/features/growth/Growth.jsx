import { useEffect, useState } from 'react'
import AdminShell from '../../AdminShell'
import { growth } from './growthApi'
import { PANEL as CARD, BORDER, MUTED, ACCENT } from '../../theme'
import { ErrorState } from '../../components/ui/States'
import { SkeletonTiles, SkeletonChart, SkeletonRows } from '../../components/ui/Skeleton'

const num = (v) => Number(v) || 0
const fmt = (v) => num(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
const money = (v) => fmt(v) + ' ﷼'

function Bars({ data, valKey, height = 130 }) {
  const max = Math.max(...data.map((x) => num(x[valKey])), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height, overflowX: 'auto' }}>
      {data.map((x, i) => (
        <div key={i} title={`${x.d}: ${fmt(x[valKey])}`} style={{ flex: '1 0 6px', display: 'flex', alignItems: 'flex-end', height: '100%' }}>
          <div style={{ width: '100%', borderRadius: '3px 3px 0 0', background: i === data.length - 1 ? ACCENT : 'rgba(255,106,0,0.4)', height: `${Math.max((num(x[valKey]) / max) * 92, num(x[valKey]) > 0 ? 3 : 0)}%` }} />
        </div>
      ))}
    </div>
  )
}

export default function Growth() {
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = () => {
    setLoading(true); setError(null)
    growth().then(setD).catch((e) => setError(e?.message || 'تعذّر التحميل')).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const s = d?.summary || {}
  const churnRate = num(s.active_subs) > 0 ? Math.round((num(s.churned_subs_30d) / num(s.active_subs)) * 100) : null
  const netMrr = num(s.new_mrr_30d) - num(s.churned_mrr_30d)

  const tiles = [
    { label: 'MRR الحالي', val: money(s.current_mrr) },
    { label: 'MRR جديد (30ي)', val: '+' + money(s.new_mrr_30d), c: '#6EE7B7' },
    { label: 'MRR مفقود (30ي)', val: '−' + money(s.churned_mrr_30d), c: '#F87171' },
    { label: 'صافي الحركة (30ي)', val: (netMrr >= 0 ? '+' : '−') + money(Math.abs(netMrr)), c: netMrr >= 0 ? '#6EE7B7' : '#F87171' },
    { label: 'معدّل الإلغاء (30ي)', val: churnRate == null ? '—' : churnRate + '%' },
    { label: 'اشتراكات نشطة', val: `${fmt(s.active_subs)} / ${fmt(s.total_subs)}` },
  ]

  return (
    <AdminShell active="growth" title="📈 النمو">
      <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
        {error ? (
          <ErrorState msg={error} onRetry={load} />
        ) : loading ? (
          <>
            <SkeletonTiles count={6} />
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '16px', marginBottom: '12px' }}>
              <SkeletonChart />
            </div>
            <SkeletonRows count={4} />
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '12px', marginBottom: '16px' }}>
              {tiles.map((t) => (
                <div key={t.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '14px' }}>
                  <div style={{ fontFamily: 'Tajawal,sans-serif', fontWeight: '900', fontSize: '18px', color: t.c || 'white', marginBottom: '3px' }}>{t.val}</div>
                  <div style={{ fontSize: '12px', color: '#D1D5DB', fontWeight: '700' }}>{t.label}</div>
                </div>
              ))}
            </div>

            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '16px', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: 'white', fontFamily: 'Tajawal,sans-serif', marginBottom: '14px' }}>💰 MRR — آخر 90 يوماً</div>
              {(d?.mrr_series?.length || 0) === 0 ? <div style={{ color: MUTED, fontSize: '12px' }}>لا بيانات كافية بعد</div> : <Bars data={d.mrr_series} valKey="mrr" />}
            </div>

            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: 'white', fontFamily: 'Tajawal,sans-serif', marginBottom: '14px' }}>📅 التفصيل الشهري</div>
              {(d?.monthly?.length || 0) === 0 ? <div style={{ color: MUTED, fontSize: '12px' }}>لا حركة اشتراكات بعد — ستظهر هنا فور بدء الاشتراكات الفعلية.</div> : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 90px 90px', gap: '8px', padding: '0 0 8px', borderBottom: `1px solid ${BORDER}`, fontSize: '11px', color: MUTED, fontWeight: '800' }}>
                    <span>الشهر</span><span>MRR جديد</span><span>MRR مفقود</span><span>الصافي</span><span>اشتراكات+</span><span>إلغاءات</span>
                  </div>
                  {d.monthly.map((m) => (
                    <div key={m.month} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 90px 90px', gap: '8px', padding: '9px 0', borderBottom: `1px solid ${BORDER}`, fontSize: '12.5px', alignItems: 'center' }}>
                      <span style={{ color: 'white', fontWeight: '700', direction: 'ltr', textAlign: 'right' }}>{m.month}</span>
                      <span style={{ color: '#6EE7B7' }}>+{fmt(m.new_mrr)}</span>
                      <span style={{ color: '#F87171' }}>−{fmt(m.churned_mrr)}</span>
                      <span style={{ color: num(m.net_mrr) >= 0 ? '#6EE7B7' : '#F87171', fontWeight: '700' }}>{num(m.net_mrr) >= 0 ? '+' : '−'}{fmt(Math.abs(num(m.net_mrr)))}</span>
                      <span style={{ color: '#D1D5DB' }}>{fmt(m.new_subs)}</span>
                      <span style={{ color: '#D1D5DB' }}>{fmt(m.churned_subs)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminShell>
  )
}
