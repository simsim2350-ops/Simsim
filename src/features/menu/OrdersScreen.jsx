// شاشة "طلباتي" — تتبع كل الطلبات النشطة (الأحدث أولاً) + نقاط الولاء + التقييم + الإلغاء
import OrdersHeader from './OrdersHeader'
import LoyaltyCard from './LoyaltyCard'

export default function OrdersScreen({
  restaurant, brandColor, isEn, t, itemName,
  activeOrders, liveOrdersCount, loyalty,
  reviewedIds, reviewDraft, setDraft, submitReview, submittingReview,
  cancelOrderByCustomer, lastOrderSummary, sendWhatsAppConfirmation, onBack,
}) {
  // KPIs — من الطلبات الظاهرة على هذا الجهاز (الإنفاق مدى الحياة = مرحلة لاحقة)
  const ordersCount = activeOrders.length
  const spend = activeOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (Number(o.total) || 0), 0)

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

        {activeOrders.map(order => {
          const statuses = ['pending','preparing','ready','completed']
          const currentIdx = statuses.indexOf(order.status)
          return (
            <div key={order.id} style={{ background:'white', borderRadius:'18px', padding:'18px', marginBottom:'16px', border: order.status==='cancelled' ? '1.5px solid #FEE2E2' : '1px solid #E5E7EB' }}>

              {/* رقم الطلب وحالته */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px' }}>{order.orderNumber}</span>
                <span style={{ fontSize:'11px', fontWeight:'700', color: order.status==='cancelled' ? '#EF4444' : brandColor, background: order.status==='cancelled' ? '#FEF2F2' : `${brandColor}15`, padding:'4px 10px', borderRadius:'100px' }}>
                  {order.status === 'cancelled'
                    ? (order.cancelledBy === 'customer' ? t('stCancYou') : t('stCancShop'))
                    : { pending:t('stReceived'), preparing:t('stPreparing'), ready:t('stReady'), completed:t('stCompleted') }[order.status] || order.status}
                </span>
              </div>

              <div style={{ fontSize:'12px', color:'#9CA3AF', marginBottom:'16px' }}>
                {{ dine_in:t('otDine'), takeaway:t('otTake'), delivery:t('otDeliv') }[order.orderType] || ''}
                {order.orderType === 'dine_in' && order.tableNumber && ` — طاولة ${order.tableNumber}`}
                {order.orderType === 'delivery' && order.deliveryAddress && ` — ${order.deliveryAddress}`}
              </div>

              {/* Status stepper */}
              {order.status !== 'cancelled' && (
                <div style={{ display:'flex', alignItems:'center', marginBottom:'16px' }}>
                  {[
                    { key:'pending', icon:'📥' }, { key:'preparing', icon:'👨‍🍳' },
                    { key:'ready', icon:'✅' }, { key:'completed', icon:'🎉' },
                  ].map((step, i, arr) => {
                    const stepIdx = statuses.indexOf(step.key)
                    const isDone = stepIdx < currentIdx
                    const isCurrent = stepIdx === currentIdx
                    return (
                      <div key={step.key} style={{ display:'flex', alignItems:'center', flex: i < arr.length - 1 ? 1 : 'none' }}>
                        <div style={{
                          width:'30px', height:'30px', borderRadius:'50%',
                          background: isDone ? '#10B981' : isCurrent ? brandColor : '#F3F4F6',
                          border: `2px solid ${isDone ? '#10B981' : isCurrent ? brandColor : '#E5E7EB'}`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:'13px', transition:'all 0.5s', flexShrink:0,
                        }}>
                          {isDone ? '✓' : step.icon}
                        </div>
                        {i < arr.length - 1 && (
                          <div style={{ flex:1, height:'2px', background: isDone ? '#10B981' : '#E5E7EB', margin:'0 4px', transition:'background 0.5s' }}/>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* الأصناف */}
              <div style={{ borderTop:'1px solid #F3F4F6', paddingTop:'12px' }}>
                {order.items.map((item, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 0', opacity: item.unavailable ? 0.55 : 1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <span style={{ fontSize:'15px' }}>{item.emoji || '🍽️'}</span>
                      <span style={{ fontSize:'13px', fontWeight:'600', textDecoration: item.unavailable ? 'line-through' : 'none' }}>{itemName(item)} × {item.qty}</span>
                      {item.unavailable && <span style={{ fontSize:'9px', fontWeight:'700', color:'#EF4444', background:'#FEF2F2', padding:'2px 6px', borderRadius:'100px' }}>{t('unavailable')}</span>}
                    </div>
                  </div>
                ))}
                <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', paddingTop:'8px', marginTop:'4px', borderTop:'1px solid #F3F4F6' }}>
                  <span>{t('total')}</span>
                  <span style={{ color:brandColor }}>{order.total.toFixed(2)} ﷼</span>
                </div>
              </div>

              {/* تقييم الزبون — يظهر بعد اكتمال الطلب فقط */}
              {order.status === 'completed' && (
                reviewedIds.includes(order.id) ? (
                  <div style={{ marginTop:'12px', padding:'12px', borderRadius:'12px', background:'#ECFDF5', border:'1px solid #A7F3D0', textAlign:'center', fontSize:'13px', fontWeight:'700', color:'#065F46' }}>
                    {t('reviewedOk')}
                  </div>
                ) : (
                  <div style={{ marginTop:'14px', paddingTop:'14px', borderTop:'1px dashed #E5E7EB' }}>
                    <div style={{ fontSize:'13px', fontWeight:'800', marginBottom:'10px', textAlign:'center' }}>{t('reviewQ')} 🌟</div>
                    <div style={{ display:'flex', justifyContent:'center', gap:'8px', marginBottom:'12px' }}>
                      {[1,2,3,4,5].map(n => {
                        const active = (reviewDraft[order.id]?.rating || 0) >= n
                        return (
                          <span
                            key={n}
                            onClick={() => setDraft(order.id, { rating:n })}
                            style={{ fontSize:'32px', cursor:'pointer', lineHeight:1, filter: active ? 'none' : 'grayscale(1)', opacity: active ? 1 : 0.35, transition:'all 0.1s' }}
                          >⭐</span>
                        )
                      })}
                    </div>
                    <textarea
                      value={reviewDraft[order.id]?.comment || ''}
                      onChange={e => setDraft(order.id, { comment: e.target.value })}
                      placeholder={t('noteShop')}
                      style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'13px', outline:'none', textAlign:'right', minHeight:'60px', resize:'vertical', boxSizing:'border-box', marginBottom:'10px' }}
                    />
                    <button
                      onClick={() => submitReview(order)}
                      disabled={submittingReview}
                      style={{ width:'100%', padding:'11px', borderRadius:'11px', border:'none', background:brandColor, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', cursor:'pointer', opacity: submittingReview ? 0.7 : 1 }}
                    >
                      {submittingReview ? t('sendingRev') : t('sendReview')}
                    </button>
                  </div>
                )
              )}

              {/* إلغاء الطلب — متاح فقط قبل أن يبدأ المطعم التحضير */}
              {order.status === 'pending' && (
                <button
                  onClick={() => cancelOrderByCustomer(order)}
                  style={{ width:'100%', marginTop:'12px', padding:'10px', borderRadius:'11px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', color:'#EF4444', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}
                >
                  {t('cancelOrder')}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
