// شاشة "طلباتي" — النشط مفتوح بالتتبع، والسابق (مكتمل/ملغي) منطوٍ مع «اطلب تاني»
import OrdersHeader from './OrdersHeader'
import LoyaltyCard from './LoyaltyCard'
import OrderCardActive from './OrderCardActive'
import OrderCardCollapsed from './OrderCardCollapsed'

export default function OrdersScreen({
  restaurant, brandColor, isEn, t, itemName,
  activeOrders, liveOrdersCount, loyalty, prepTime,
  reviewedIds, reviewDraft, setDraft, submitReview, submittingReview,
  cancelOrderByCustomer, lastOrderSummary, sendWhatsAppConfirmation, onBack, onReorder, onMessage,
}) {
  // KPIs — من الطلبات الظاهرة على هذا الجهاز (الإنفاق مدى الحياة = مرحلة لاحقة)
  const ordersCount = activeOrders.length
  const spend = activeOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (Number(o.total) || 0), 0)

  // فصل النشط (يُتتبَّع مفتوحاً) عن السابق (منطوٍ)
  const activeList = activeOrders.filter(o => ['pending','preparing','ready'].includes(o.status))
  const pastList = activeOrders.filter(o => ['completed','cancelled'].includes(o.status))
  const sec = { fontFamily:'Cairo,sans-serif', fontSize:'12px', fontWeight:'900', color:'#9CA3AF', margin:'2px 2px 10px' }

  return (
    <div style={{ minHeight:'100vh', background:'#F8F9FB', direction:'rtl', fontFamily:'Tajawal,sans-serif', maxWidth:'480px', margin:'0 auto', position:'relative', boxShadow:'0 0 60px rgba(15,17,23,0.12)' }}>
      <style>{`@media(min-width:600px){body{background:#E9ECF2}}`}</style>

      <OrdersHeader
        brandColor={brandColor} isEn={isEn} t={t}
        ordersCount={ordersCount} spend={spend} points={loyalty?.balance || 0}
        hasLoyalty={!!loyalty} onBack={onBack}
      />

      <div style={{ padding:'16px' }}>
        {/* بطاقة الولاء — تظهر لو البرنامج مفعّل والزبون معروف */}
        {loyalty && <LoyaltyCard loyalty={loyalty} brandColor={brandColor} isEn={isEn} t={t} />}

        {/* أزرار العمليات — منقولة للأعلى */}
        <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
          <button
            onClick={onBack}
            style={{ flex:1, padding:'13px', borderRadius:'13px', border:'none', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', cursor:'pointer', boxShadow:`0 6px 16px ${brandColor}44` }}
          >
            {t('browseMenu')}
          </button>
          {restaurant?.phone && lastOrderSummary && (
            <button
              onClick={sendWhatsAppConfirmation}
              style={{ padding:'13px 16px', borderRadius:'13px', border:'1.5px solid rgba(37,211,102,0.4)', background:'rgba(37,211,102,0.1)', color:'#1FA855', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', cursor:'pointer', whiteSpace:'nowrap' }}
            >
              💬 {isEn ? 'WhatsApp' : 'واتساب'}
            </button>
          )}
        </div>

        {/* قيد التنفيذ الآن — مفتوح بالكامل مع التتبّع */}
        {activeList.length > 0 && <div style={sec}>{t('activeNow')}</div>}
        {activeList.map(order => (
          <OrderCardActive
            key={order.id}
            order={order}
            brandColor={brandColor}
            isEn={isEn}
            t={t}
            itemName={itemName}
            prepTime={prepTime}
            onMessage={onMessage}
            onCancel={cancelOrderByCustomer}
          />
        ))}

        {/* طلبات سابقة — منطوية مع «اطلب تاني» */}
        {pastList.length > 0 && <div style={sec}>{t('pastSection')}</div>}
        {pastList.map(order => (
          <OrderCardCollapsed
            key={order.id}
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
            onReorder={onReorder}
          />
        ))}
      </div>
    </div>
  )
}
