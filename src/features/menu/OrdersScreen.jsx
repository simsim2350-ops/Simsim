// شاشة "طلباتي" — النشط مفتوح بالتتبع، والسابق (مكتمل/ملغي) منطوٍ مع «اطلب تاني»
import { useState } from 'react'
import OrdersHeader from './OrdersHeader'
import LoyaltyCard from './LoyaltyCard'
import OrderCardActive from './OrderCardActive'
import OrderCardCollapsed from './OrderCardCollapsed'
import EmptyOrders from './EmptyOrders'

const IS_ACTIVE = (s) => ['pending','preparing','ready'].includes(s)

export default function OrdersScreen({
  brandColor, isEn, t, itemName,
  activeOrders, liveOrdersCount, loyalty, prepTime,
  reviewedIds, reviewDraft, setDraft, submitReview, submittingReview,
  reviewsEnabled = true, ordering = true,
  cancelOrderByCustomer, onBack, onReorder, onMessage,
}) {
  const [filter, setFilter] = useState('all')   // all | active | completed | cancelled
  const [q, setQ] = useState('')                // بحث برقم الطلب

  // KPIs — من الطلبات الظاهرة على هذا الجهاز (الإنفاق مدى الحياة = مرحلة لاحقة)
  const ordersCount = activeOrders.length
  const spend = activeOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (Number(o.total) || 0), 0)

  // عدّادات الفلاتر (من كل الطلبات قبل الفلترة)
  const counts = {
    all: activeOrders.length,
    active: activeOrders.filter(o => IS_ACTIVE(o.status)).length,
    completed: activeOrders.filter(o => o.status === 'completed').length,
    cancelled: activeOrders.filter(o => o.status === 'cancelled').length,
  }
  const filterDefs = [
    { key:'all', label:t('filterAll') },
    { key:'active', label:t('filterActive') },
    { key:'completed', label:t('filterCompleted') },
    { key:'cancelled', label:t('filterCancelled') },
  ]

  // تطبيق الفلتر + البحث
  const matchQ = (o) => !q.trim() || String(o.orderNumber || '').toLowerCase().includes(q.trim().toLowerCase())
  const matchFilter = (o) =>
    filter === 'active' ? IS_ACTIVE(o.status)
    : filter === 'completed' ? o.status === 'completed'
    : filter === 'cancelled' ? o.status === 'cancelled'
    : true
  const filtered = activeOrders.filter(o => matchFilter(o) && matchQ(o))

  // فصل النشط (يُتتبَّع مفتوحاً) عن السابق (منطوٍ)
  const activeList = filtered.filter(o => IS_ACTIVE(o.status))
  // المكتمل غير المُقيَّم يبقى مفتوحاً بانتظار تقييم الزبون (OrderCardCollapsed) — يُقدَّم على البقية ليُلاحَظ فوراً
  const needsReview = (o) => o.status === 'completed' && !reviewedIds.includes(o.id)
  const pastList = filtered
    .filter(o => ['completed','cancelled'].includes(o.status))
    .sort((a, b) => (needsReview(b) ? 1 : 0) - (needsReview(a) ? 1 : 0))
  const sec = { fontFamily:'Cairo,sans-serif', fontSize:'12px', fontWeight:'900', color:'#9CA3AF', margin:'2px 2px 10px' }

  return (
    <div style={{ minHeight:'100vh', background:'#F8F9FB', direction:'rtl', fontFamily:'Tajawal,sans-serif', maxWidth:'480px', margin:'0 auto', position:'relative', boxShadow:'0 0 60px rgba(15,17,23,0.12)' }}>
      <style>{`
        @keyframes ordIn{ from{ opacity:0; transform:translateY(12px) } to{ opacity:1; transform:none } }
        .ord-in{ animation:ordIn .4s ease both }
        @media (prefers-reduced-motion: reduce){ .ord-in{ animation:none } }
        @media(min-width:600px){ body{ background:#E9ECF2 } }
      `}</style>

      <OrdersHeader
        brandColor={brandColor} isEn={isEn} t={t}
        ordersCount={ordersCount} spend={spend} points={loyalty?.balance || 0}
        hasLoyalty={!!loyalty} onBack={onBack}
      />

      <div style={{ padding:'16px' }}>
        {/* بطاقة الولاء — تظهر لو البرنامج مفعّل والزبون معروف */}
        {loyalty && <LoyaltyCard loyalty={loyalty} brandColor={brandColor} isEn={isEn} t={t} />}

        {activeOrders.length === 0 ? (
          <EmptyOrders brandColor={brandColor} t={t} onBack={onBack} />
        ) : (
        <>
        {/* أزرار العمليات — منقولة للأعلى */}
        <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
          <button
            onClick={onBack}
            style={{ flex:1, padding:'13px', borderRadius:'13px', border:'none', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', cursor:'pointer', boxShadow:`0 6px 16px ${brandColor}44` }}
          >
            {t('browseMenu')}
          </button>
        </div>

        {/* فلاتر لاصقة + بحث برقم الطلب */}
        {(
          <div style={{ position:'sticky', top:0, zIndex:20, background:'#F8F9FB', paddingTop:'2px', marginBottom:'12px' }}>
            <div style={{ display:'flex', gap:'7px', overflowX:'auto', paddingBottom:'10px' }}>
              {filterDefs.map(f => {
                const on = filter === f.key
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    style={{ flexShrink:0, fontFamily:'Cairo,sans-serif', fontSize:'12px', fontWeight:'800', padding:'7px 14px', borderRadius:'100px', cursor:'pointer', border:`1.5px solid ${on ? '#1B1D24' : '#E5E7EB'}`, background: on ? '#1B1D24' : 'white', color: on ? 'white' : '#9CA3AF' }}
                  >
                    {f.label}{counts[f.key] > 0 ? ` (${counts[f.key]})` : ''}
                  </button>
                )
              })}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'7px', background:'white', border:'1.5px solid #E5E7EB', borderRadius:'100px', padding:'8px 14px' }}>
              <span style={{ fontSize:'14px', color:'#9CA3AF' }}>🔍</span>
              <input
                type="text"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={t('searchOrder')}
                style={{ flex:1, border:'none', outline:'none', background:'transparent', fontFamily:'Tajawal,sans-serif', fontSize:'13px', color:'#0F1117', textAlign:'right' }}
              />
              {q && <button onClick={() => setQ('')} style={{ border:'none', background:'none', fontSize:'14px', cursor:'pointer', color:'#9CA3AF' }}>✕</button>}
            </div>
          </div>
        )}

        {/* لا نتائج مطابقة للفلتر/البحث */}
        {filtered.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 20px', color:'#9CA3AF' }}>
            <div style={{ fontSize:'38px', opacity:0.3, marginBottom:'10px' }}>🔍</div>
            <div style={{ fontSize:'13px', fontWeight:'700', color:'#374151' }}>{t('noOrdersFilter')}</div>
          </div>
        )}

        {/* قيد التنفيذ الآن — مفتوح بالكامل مع التتبّع */}
        {activeList.length > 0 && <div style={sec}>{t('activeNow')}</div>}
        {activeList.map((order, i) => (
          <div key={order.id} className="ord-in" style={{ animationDelay:`${i * 45}ms` }}>
            <OrderCardActive
              order={order}
              brandColor={brandColor}
              isEn={isEn}
              t={t}
              itemName={itemName}
              prepTime={prepTime}
              onMessage={onMessage}
              onCancel={cancelOrderByCustomer}
            />
          </div>
        ))}

        {/* طلبات سابقة — منطوية مع «اطلب تاني» */}
        {pastList.length > 0 && <div style={sec}>{t('pastSection')}</div>}
        {pastList.map((order, i) => (
          <div key={order.id} className="ord-in" style={{ animationDelay:`${(activeList.length + i) * 45}ms` }}>
            <OrderCardCollapsed
              order={order}
              brandColor={brandColor}
              isEn={isEn}
              t={t}
              itemName={itemName}
              reviewedIds={reviewedIds}
              reviewDraft={reviewDraft}
              setDraft={setDraft}
              submitReview={submitReview}
              submittingReview={submittingReview}
              reviewsEnabled={reviewsEnabled}
              onReorder={ordering ? onReorder : null}
            />
          </div>
        ))}
        </>
        )}
      </div>
    </div>
  )
}
