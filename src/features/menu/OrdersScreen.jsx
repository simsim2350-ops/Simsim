// شاشة "طلباتي" — تتبع كل الطلبات النشطة (الأحدث أولاً) + نقاط الولاء + التقييم + الإلغاء
export default function OrdersScreen({
  restaurant, brandColor, isEn, t, itemName,
  activeOrders, liveOrdersCount, loyalty,
  reviewedIds, reviewDraft, setDraft, submitReview, submittingReview,
  cancelOrderByCustomer, lastOrderSummary, sendWhatsAppConfirmation, onBack,
}) {
  return (
    <div style={{ minHeight:'100vh', background:'#F8F9FB', direction:'rtl', fontFamily:'Tajawal,sans-serif', maxWidth:'480px', margin:'0 auto', position:'relative', boxShadow:'0 0 60px rgba(15,17,23,0.12)' }}>
      <style>{`@media(min-width:600px){body{background:#E9ECF2}}`}</style>
      <div style={{ background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, padding:'32px 24px', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, background:'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1), transparent)', pointerEvents:'none' }}/>
        <div style={{ fontSize:'56px', marginBottom:'10px', position:'relative' }}>🎉</div>
        <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'22px', color:'white', marginBottom:'4px' }}>{t('ordersTitle')}</h2>
        <p style={{ color:'rgba(255,255,255,0.8)', fontSize:'13px' }}>{liveOrdersCount > 0 ? `${liveOrdersCount} ${isEn ? 'active order(s)' : 'طلب نشط'}` : t('prevOrders')}</p>
      </div>

      <div style={{ padding:'20px 16px' }}>
        {/* بطاقة نقاط الولاء — تظهر لو البرنامج مفعّل والزبون معروف */}
        {loyalty && (() => {
          const threshold = loyalty.reward_threshold || 0
          const balance = loyalty.balance || 0
          const ready = threshold > 0 && balance >= threshold
          const pct = threshold > 0 ? Math.min(100, Math.round((balance / threshold) * 100)) : 0
          return (
            <div style={{ background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, borderRadius:'18px', padding:'18px', marginBottom:'16px', color:'white' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                <span style={{ fontSize:'13px', fontWeight:'700', opacity:0.9 }}>{t('loyaltyPts')}</span>
                <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'22px', lineHeight:1 }}>{balance}<span style={{ fontSize:'12px', fontWeight:'700', opacity:0.85 }}> {t('ptsUnit')}</span></span>
              </div>
              {ready ? (
                <div style={{ background:'rgba(255,255,255,0.2)', borderRadius:'11px', padding:'10px 12px', fontSize:'13px', fontWeight:'800' }}>
                  🎉 {isEn ? 'Your reward is ready' : 'مكافأتك جاهزة'}: {loyalty.reward_description || t('rewardDefault')} — {isEn ? 'claim it at the restaurant!' : 'اطلبها عند المطعم!'}
                </div>
              ) : (
                <>
                  <div style={{ height:'8px', background:'rgba(255,255,255,0.25)', borderRadius:'100px', overflow:'hidden', marginBottom:'8px' }}>
                    <div style={{ width:`${pct}%`, height:'100%', background:'white', borderRadius:'100px', transition:'width 0.5s' }}/>
                  </div>
                  <div style={{ fontSize:'12px', opacity:0.92 }}>
                    {isEn ? `${Math.max(0, threshold - balance)} pts left to unlock` : `باقي ${Math.max(0, threshold - balance)} نقطة للحصول على`}: {loyalty.reward_description || t('rewardDefault')}
                  </div>
                </>
              )}
            </div>
          )
        })()}
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

        {/* WhatsApp confirmation لآخر طلب (اختياري) */}
        {restaurant?.phone && lastOrderSummary && (
          <button
            onClick={sendWhatsAppConfirmation}
            style={{ width:'100%', padding:'15px', borderRadius:'14px', border:'1.5px solid #25D366', background:'rgba(37,211,102,0.08)', color:'#1FA855', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', cursor:'pointer', marginBottom:'12px', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}
          >
            {t('sendWaLast')}
          </button>
        )}

        {/* العودة للمنيو لطلب إضافي — الطلبات الحالية تستمر بالتتبع */}
        <button
          onClick={onBack}
          style={{ width:'100%', padding:'15px', borderRadius:'14px', border:'none', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'16px', cursor:'pointer', boxShadow:`0 8px 24px ${brandColor}44` }}
        >
          {t('backToMenu')}
        </button>
      </div>
    </div>
  )
}
