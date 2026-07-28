import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminShell from '../../AdminShell'
import { listRestaurants } from './restaurantsApi'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { PANEL as CARD, BORDER, MUTED, ACCENT } from '../../theme'
import { Loading, EmptyState, ErrorState } from '../../components/ui/States'

const PAGE_SIZE = 25
const HEALTH_C = { green: '#6EE7B7', yellow: '#FBBF24', red: '#F87171' }
const num = (v) => Number(v) || 0
const fmt = (v) => num(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
const daysAgo = (iso) => { if (!iso) return '—'; const d = Math.floor((Date.now() - new Date(iso)) / 86400000); return d <= 0 ? 'اليوم' : `${d}ي` }

const FILTERS = [['', 'الكل'], ['at_risk', '⚠️ معرّض للخطر'], ['green', '🟢'], ['yellow', '🟡'], ['red', '🔴']]
const COLS = [
  { key: 'name', label: 'المطعم', sortable: true, w: '1fr' },
  { key: 'health', label: 'الصحّة', sortable: true, w: '90px' },
  { key: 'status', label: 'الحالة', sortable: false, w: '110px' },
  { key: 'mrr', label: 'MRR', sortable: true, w: '90px' },
  { key: 'orders', label: 'طلبات 30ي', sortable: true, w: '90px' },
  { key: 'last', label: 'آخر نشاط', sortable: false, w: '80px' },
]

export default function RestaurantsList() {
  const navigate = useNavigate()
  const { isMobile } = useBreakpoint()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('created_at')
  const [dir, setDir] = useState('desc')
  const [filter, setFilter] = useState('')
  const reqRef = useRef(0)

  const fetchPage = useCallback(async (opts, offset) => {
    const first = offset === 0
    const token = ++reqRef.current
    if (first) setLoading(true); else setLoadingMore(true)
    setError(null)
    try {
      const { rows: page, total: t } = await listRestaurants({ ...opts, limit: PAGE_SIZE, offset })
      if (token !== reqRef.current) return
      setTotal(t); setRows((prev) => first ? page : [...prev, ...page])
    } catch (e) {
      if (token === reqRef.current) setError(e?.message || 'تعذّر التحميل')
    } finally {
      if (token === reqRef.current) { if (first) setLoading(false); else setLoadingMore(false) }
    }
  }, [])

  const reload = () => fetchPage({ search: q, sort, dir, filter: filter || null }, 0)
  useEffect(() => {
    const id = setTimeout(reload, 300)
    return () => clearTimeout(id)
  }, [q, sort, dir, filter, fetchPage]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSort = (key) => {
    if (sort === key) setDir((x) => x === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir(key === 'name' ? 'asc' : 'desc') }
  }
  const openRestaurant = (id) => navigate(`/admin/restaurants/${id}`)
  const onRowKeyDown = (e, id) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRestaurant(id) } }
  const canLoadMore = rows.length < total
  const gridCols = COLS.map((c) => c.w).join(' ')

  return (
    <AdminShell active="restaurants" title="المطاعم">
      <div style={{ padding: '20px', maxWidth: '1100px', margin: '0 auto' }}>
        {/* شريط: بحث + فلاتر */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div style={{ fontSize: '12.5px', color: MUTED, fontWeight: '700' }}>{loading ? '…' : `${rows.length} من ${total}`}</div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {FILTERS.map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} style={{ padding: '6px 11px', borderRadius: '9px', border: `1px solid ${filter === v ? ACCENT : BORDER}`, background: filter === v ? 'rgba(124,58,237,0.15)' : 'transparent', color: filter === v ? '#C4B5FD' : MUTED, fontFamily: 'Tajawal,sans-serif', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث…" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '8px 12px', color: 'white', fontFamily: 'Tajawal,sans-serif', fontSize: '13px', outline: 'none', minWidth: '160px' }} />
        </div>

        {error ? (
          <ErrorState msg={error} onRetry={reload} />
        ) : loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState msg="لا توجد نتائج" />
        ) : isMobile ? (
          // عرض بطاقات على الموبايل — الأعمدة الثابتة العرض لا تتجاوب تحت 768px
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {rows.map((r) => (
              <div key={r.id} onClick={() => openRestaurant(r.id)} role="link" tabIndex={0} onKeyDown={(e) => onRowKeyDown(e, r.id)}
                aria-label={`فتح ملف ${r.name}`}
                style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '14px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '3px' }}>
                  <span style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '800', color: 'white', fontSize: '14px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  {r.platform_suspended && <span style={{ fontSize: '9px', fontWeight: '800', color: '#FCA5A5', background: 'rgba(239,68,68,0.18)', borderRadius: '100px', padding: '1px 7px' }}>معلّق</span>}
                </div>
                <div style={{ fontSize: '10.5px', color: MUTED, direction: 'ltr', textAlign: 'right', marginBottom: '10px' }}>/{r.slug}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12.5px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: MUTED, marginBottom: '2px' }}>الصحّة</div>
                    <span style={{ color: HEALTH_C[r.health_band], fontWeight: '800' }}>{num(r.health_score)}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: MUTED, marginBottom: '2px' }}>الحالة</div>
                    <span style={{ color: r.subscription_status === 'active' ? '#6EE7B7' : r.subscription_status === 'past_due' ? '#FBBF24' : MUTED }}>{r.subscription_status || 'بلا اشتراك'}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: MUTED, marginBottom: '2px' }}>MRR</div>
                    <span style={{ color: 'white', fontWeight: '700' }}>{fmt(r.mrr)} ﷼</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: MUTED, marginBottom: '2px' }}>طلبات 30ي</div>
                    <span style={{ color: '#D1D5DB' }}>{fmt(r.orders_30d)}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: MUTED, marginBottom: '2px' }}>آخر نشاط</div>
                    <span style={{ color: r.churn_risk === 'high' ? '#F87171' : MUTED }}>{daysAgo(r.last_order_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', overflow: 'hidden' }}>
            {/* حاوية تمرير أفقي: تحمي من قصّ الأعمدة على تابلت ضيّق دون تغيير العرض الطبيعي على سطح المكتب */}
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: '640px' }} role="table" aria-label="قائمة المطاعم">
                {/* رأس الجدول */}
                <div role="row" style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '10px', padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, fontSize: '11px', color: MUTED, fontWeight: '800' }}>
                  {COLS.map((c) => (
                    <div key={c.key} role="columnheader" aria-sort={c.sortable ? (sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                      tabIndex={c.sortable ? 0 : undefined}
                      onClick={() => c.sortable && toggleSort(c.key)}
                      onKeyDown={(e) => { if (c.sortable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleSort(c.key) } }}
                      style={{ cursor: c.sortable ? 'pointer' : 'default', userSelect: 'none' }}>
                      {c.label}{c.sortable && sort === c.key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </div>
                  ))}
                </div>
                {/* الصفوف */}
                {rows.map((r) => (
                  <div key={r.id} role="row" tabIndex={0} onClick={() => openRestaurant(r.id)} onKeyDown={(e) => onRowKeyDown(e, r.id)}
                    aria-label={`فتح ملف ${r.name}`}
                    style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '10px', padding: '11px 14px', borderBottom: `1px solid ${BORDER}`, alignItems: 'center', cursor: 'pointer', fontSize: '12.5px' }}>
                    {/* المطعم */}
                    <div role="cell" style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '800', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                        {r.platform_suspended && <span style={{ fontSize: '9px', fontWeight: '800', color: '#FCA5A5', background: 'rgba(239,68,68,0.18)', borderRadius: '100px', padding: '1px 7px' }}>معلّق</span>}
                      </div>
                      <div style={{ fontSize: '10.5px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'ltr' }}>/{r.slug}</div>
                    </div>
                    {/* الصحّة */}
                    <div role="cell" style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <span style={{ width: '30px', height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden', flexShrink: 0 }}>
                        <span style={{ display: 'block', height: '100%', width: `${num(r.health_score)}%`, background: HEALTH_C[r.health_band] }} />
                      </span>
                      <span style={{ color: HEALTH_C[r.health_band], fontWeight: '800' }}>{num(r.health_score)}</span>
                    </div>
                    {/* الحالة */}
                    <div role="cell">
                      <span style={{ fontSize: '11px', color: r.subscription_status === 'active' ? '#6EE7B7' : r.subscription_status === 'past_due' ? '#FBBF24' : MUTED }}>
                        {r.subscription_status || 'بلا اشتراك'}
                      </span>
                    </div>
                    {/* MRR */}
                    <div role="cell" style={{ color: 'white', fontWeight: '700' }}>{fmt(r.mrr)} <span style={{ color: MUTED, fontSize: '10px' }}>﷼</span></div>
                    {/* طلبات 30 */}
                    <div role="cell" style={{ color: '#D1D5DB' }}>{fmt(r.orders_30d)}</div>
                    {/* آخر نشاط */}
                    <div role="cell" style={{ color: r.churn_risk === 'high' ? '#F87171' : MUTED }}>{daysAgo(r.last_order_at)}</div>
                  </div>
                ))}
              </div>
            </div>
            {canLoadMore && (
              <div onClick={() => fetchPage({ search: q, sort, dir, filter: filter || null }, rows.length)}
                style={{ padding: '12px', textAlign: 'center', color: '#C4B5FD', fontFamily: 'Cairo,sans-serif', fontSize: '12.5px', fontWeight: '800', cursor: loadingMore ? 'default' : 'pointer', opacity: loadingMore ? 0.6 : 1 }}>
                {loadingMore ? 'جارٍ…' : `تحميل المزيد (${total - rows.length})`}
              </div>
            )}
          </div>
        )}

        {!error && !loading && rows.length > 0 && isMobile && canLoadMore && (
          <div onClick={() => fetchPage({ search: q, sort, dir, filter: filter || null }, rows.length)}
            style={{ marginTop: '10px', padding: '12px', textAlign: 'center', color: '#C4B5FD', fontFamily: 'Cairo,sans-serif', fontSize: '12.5px', fontWeight: '800', cursor: loadingMore ? 'default' : 'pointer', opacity: loadingMore ? 0.6 : 1 }}>
            {loadingMore ? 'جارٍ…' : `تحميل المزيد (${total - rows.length})`}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
