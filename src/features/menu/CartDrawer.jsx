import { vatBreakdown } from '../../lib/pricing'
import TableSelect from './TableSelect'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'

// درج السلة: العناصر + الملخص المالي + نوع الطلب + بيانات الزبون + زر التأكيد
export default function CartDrawer({
  cart, cartCount, cartTotal, restaurant, brandColor, isEn, t, itemName,
  orderType, setOrderType,
  customerName, setCustomerName, customerPhone, setCustomerPhone,
  tableNumber, setTableNumber, deliveryAddress, setDeliveryAddress,
  orderNote, setOrderNote, tables = [], tableQr = null,
  openStatus, deliveryEnabled, deliveryFee, takeawayEnabled = true, placeOrder, submitting, removeFromCart, incrementCartItem, onDeleteItem, onEditItem, onClose,
  suggestions = [], onAddSuggestion, onOpenSuggestion, loyalty,
  couponInput, setCouponInput, appliedCoupon, applyCoupon, removeCoupon, applyingCoupon, discountAmount = 0,
}) {
  const suggestionBadge = {
    curated:    { label: t('reasonCurated'),    bg:'#FFF1E8', fg:'#C8481B' },
    category:   { label: t('reasonCategory'),   bg:'#EAF3FF', fg:'#1E5FBF' },
    mostOrdered: { label: t('reasonMostOrdered'), bg:'#FEF3C7', fg:'#92400E' },
  }
  const discountedSubtotal = Math.max(0, cartTotal - discountAmount)
  const finalTotal = discountedSubtotal + (orderType === 'delivery' ? (Number(deliveryFee) || 0) : 0)
  // TASK-CART-003: أصناف حُذفت أو أصبحت غير متاحة منذ إضافتها للسلة — لا يمكن تأكيد الطلب وهي موجودة
  const hasUnavailableItems = cart.some(item => item.available === false)
  const canSubmit = openStatus.open && !submitting && !hasUnavailableItems
  const loyaltyThreshold = loyalty?.reward_threshold || 0
  const loyaltyBalance = loyalty?.balance || 0
  const loyaltyReady = loyaltyThreshold > 0 && loyaltyBalance >= loyaltyThreshold
  const loyaltyPct = loyaltyThreshold > 0 ? Math.min(100, Math.round((loyaltyBalance / loyaltyThreshold) * 100)) : 0
  const loyaltyReward = loyalty?.reward_description || t('rewardDefault')

  // قفل تمرير الصفحة خلف السلة طول ما هي مفتوحة (يمنع تحرّك المنيو أثناء التمرير داخل السلة)
  useBodyScrollLock()

  return (
    <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', animation:'fadeIn 0.2s ease' }}/>
      <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', maxHeight:'88vh', display:'flex', flexDirection:'column', animation:'slideUp 0.3s ease', position:'relative', overflow:'hidden' }}>
        <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'12px auto' }}/>

        <div style={{ padding:'0 20px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
          <h3 style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'18px' }}>🛒 {t('cartYours')} ({cartCount})</h3>
          <button type="button" onClick={onClose} aria-label={t('closeA')} style={{ width:'32px', height:'32px', borderRadius:'50%', border:'1.5px solid #E5E7EB', background:'white', fontSize:'18px', color:'#6B7280' }}>✕</button>
        </div>

        {/* سلة فارغة — تحدث لو حذف الزبون آخر صنف وهو داخل الدرج (زر 🗑) */}
        {cart.length === 0 ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'12px', padding:'40px 20px', textAlign:'center' }}>
            <span style={{ fontSize:'44px' }}>🛒</span>
            <div style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'15px', color:'#374151' }}>{t('emptyCartTitle')}</div>
            <button type="button" onClick={onClose} style={{ marginTop:'8px', padding:'12px 24px', borderRadius:'12px', border:'none', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'14px' }}>{t('browseMenuB')}</button>
          </div>
        ) : (
        <>
        {/* الجسم القابل للتمرير: العناصر + الاقتراحات + الملخص — شريط تمرير واحد للسلة كلها */}
        <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>

        {/* Cart items */}
        <div style={{ padding:'12px 20px' }}>
          {cart.map((item) => (
            <div key={item.cartKey} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 0', borderBottom:'1px solid #F3F4F6', opacity: item.available === false ? 0.6 : 1 }}>
              <div style={{ width:'48px', height:'48px', borderRadius:'12px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'24px', flexShrink:0, overflow:'hidden' }}>
                {item.image_url
                  ? <img loading="lazy" decoding="async" src={item.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  : item.emoji}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:'700', fontSize:'14px', marginBottom:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{itemName(item)}</div>
                {Array.isArray(item.selectedOptions) && item.selectedOptions.length > 0 && (
                  <div style={{ fontSize:'11px', color:'#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {item.selectedOptions.map(o => o.choiceName).join(isEn ? ', ' : '، ')}
                  </div>
                )}
                {item.note && <div style={{ fontSize:'11px', color:'#9CA3AF' }}>📝 {item.note}</div>}
                {/* TASK-CART-003: صنف حُذف/أصبح غير متاح — تعليم صريح بدل رفض خادمي غامض عند التأكيد */}
                {item.available === false && (
                  <div style={{ fontSize:'11px', color:'#B91C1C', fontWeight:'700', marginTop:'2px' }}>⚠️ {t('cartItemUnavailableNow')}</div>
                )}
                {item.available !== false && item.priceChanged && (
                  <div style={{ fontSize:'11px', color:'#C8481B', fontWeight:'700', marginTop:'2px' }}>{t('cartItemPriceChanged')} {item.currentBasePrice} ﷼</div>
                )}
                {/* تعديل ✎ / حذف السطر 🗑 — تحت اسم الصنف حتى لا يضيق الصف */}
                <div style={{ display:'flex', gap:'6px', marginTop:'5px' }}>
                  <button onClick={() => onEditItem(item)} aria-label={t('editItemA')} disabled={item.available === false} style={{ width:'28px', height:'28px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background:'white', fontSize:'13px', cursor: item.available === false ? 'not-allowed' : 'pointer', color:'#6B7280', display:'flex', alignItems:'center', justifyContent:'center', opacity: item.available === false ? 0.5 : 1 }}>✎</button>
                  <button onClick={() => onDeleteItem(item.cartKey)} aria-label={t('delItemA')} style={{ width:'28px', height:'28px', borderRadius:'8px', border:'1.5px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.06)', fontSize:'12px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>🗑</button>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'0', border:'1.5px solid #E5E7EB', borderRadius:'10px', overflow:'hidden', flexShrink:0 }}>
                <button type="button" onClick={() => removeFromCart(item.cartKey)} aria-label={t('decreaseA')} style={{ width:'30px', height:'30px', background:'none', border:'none', fontSize:'18px', color:brandColor, fontWeight:'300' }}>−</button>
                <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'13px', minWidth:'24px', textAlign:'center', borderRight:'1px solid #E5E7EB', borderLeft:'1px solid #E5E7EB', lineHeight:'30px' }}>{item.qty}</span>
                <button type="button" onClick={() => incrementCartItem(item.cartKey)} disabled={item.available === false} aria-label={t('increaseA')} style={{ width:'30px', height:'30px', background:'none', border:'none', fontSize:'18px', color:brandColor, fontWeight:'300', opacity: item.available === false ? 0.5 : 1, cursor: item.available === false ? 'not-allowed' : 'pointer' }}>+</button>
              </div>
              <div style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'14px', flexShrink:0, minWidth:'50px', textAlign:'left' }}>{(item.price * item.qty).toFixed(2)} ﷼</div>
            </div>
          ))}
        </div>

        {/* محرك الاقتراحات الذكي — قواعد المطعم ← نفس القسم ← الأكثر طلبًا (بهذا الترتيب) */}
        {suggestions.length > 0 && (
          <div style={{ padding:'12px 20px 14px', borderTop:'1px solid #F3F4F6', flexShrink:0 }}>
            <div style={{ fontSize:'13.5px', fontWeight:'800', fontFamily:'Tajawal,sans-serif', marginBottom:'10px' }}>{t('suggestTitle')}</div>
            <div style={{ display:'flex', gap:'10px', overflowX:'auto', paddingBottom:'2px' }}>
              {suggestions.map(({ product: p, reason }) => {
                const needsConfig = Array.isArray(p.options) && p.options.some(g => g.required)
                const badge = suggestionBadge[reason] || suggestionBadge.mostOrdered
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => needsConfig ? onOpenSuggestion(p) : onAddSuggestion(p)}
                    aria-label={`${t('addToCartB')}: ${(isEn && p.name_en) ? p.name_en : p.name}`}
                    style={{ width:'112px', flexShrink:0, display:'flex', flexDirection:'column', gap:'6px', border:'1.5px solid #E5E7EB', borderRadius:'14px', padding:'10px', background:'white', textAlign:'start' }}
                  >
                    <div style={{ width:'56px', height:'56px', borderRadius:'12px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px', overflow:'hidden' }}>
                      {p.image_url
                        ? <img loading="lazy" decoding="async" src={p.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                        : (p.emoji || '🍽️')}
                    </div>
                    <span style={{ alignSelf:'flex-start', fontSize:'10px', fontWeight:'800', fontFamily:'Tajawal,sans-serif', padding:'2px 7px', borderRadius:'100px', background:badge.bg, color:badge.fg, whiteSpace:'nowrap' }}>{badge.label}</span>
                    <div style={{ fontSize:'12px', fontWeight:'700', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{(isEn && p.name_en) ? p.name_en : p.name}</div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'4px' }}>
                      <span style={{ fontSize:'11.5px', fontWeight:'800', color:brandColor }}>{p.price} ﷼</span>
                      <span style={{ width:'20px', height:'20px', borderRadius:'50%', background:brandColor, color:'white', fontSize:'14px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontWeight:'300' }}>{needsConfig ? '›' : '+'}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ولاء هادئ — تحفيز بلا إزعاج، بلا CTA؛ المكافأة تُطلب عند المطعم (ADR-2) */}
        {loyalty && (
          <div style={{ margin:'12px 20px 0', padding:'10px 12px', background:'#FFF8F0', border:'1px solid #FCE8D6', borderRadius:'12px', display:'flex', alignItems:'center', gap:'10px' }}>
            <span style={{ fontSize:'16px', flexShrink:0 }}>⭐</span>
            <div style={{ flex:1, minWidth:0 }}>
              {loyaltyReady ? (
                <div style={{ fontSize:'12px', fontWeight:'800', color:'#374151' }}>
                  🎉 {isEn ? `Your reward is ready: ${loyaltyReward}` : `مكافأتك جاهزة: ${loyaltyReward}`}
                </div>
              ) : (
                <>
                  <div style={{ fontSize:'12px', fontWeight:'700', color:'#374151', marginBottom:'6px' }}>
                    {isEn ? `${Math.max(0, loyaltyThreshold - loyaltyBalance)} pts left for: ${loyaltyReward}` : `باقي ${Math.max(0, loyaltyThreshold - loyaltyBalance)} نقطة على: ${loyaltyReward}`}
                  </div>
                  <div style={{ height:'5px', background:'#FCE8D6', borderRadius:'100px', overflow:'hidden' }}>
                    <div style={{ width:`${loyaltyPct}%`, height:'100%', background:brandColor, borderRadius:'100px' }}/>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* نوع الطلب + بيانات الزبون + ملاحظة الطلب — قبل الملخص المالي */}
        <div style={{ padding:'14px 20px 2px', borderTop:'1px solid #E5E7EB', flexShrink:0 }}>
          {/* QR الموثوق يثبّت الطلب على طاولة داخل المطعم؛ لا يمكن تغيير الطاولة أو نوع الطلب من السلة. */}
          {tableQr ? (
            <div style={{ marginBottom:'14px', padding:'11px 12px', background:'#FFF8F3', border:'1px solid #FDE2CD', borderRadius:'12px', display:'flex', alignItems:'center', gap:'10px' }}>
              <span style={{ width:'32px', height:'32px', display:'grid', placeItems:'center', background:'#FFF0E6', borderRadius:'9px', color:brandColor, fontSize:'16px', flexShrink:0 }}>🪑</span>
              <div style={{ minWidth:0, flex:1 }}>
                <span style={{ display:'block', color:'#9A3412', fontSize:'10.5px', fontWeight:'800', marginBottom:'2px' }}>طلب داخل المطعم عبر QR</span>
                <strong dir="auto" style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#374151', fontSize:'13px' }}>طاولة {tableQr.tableName}</strong>
              </div>
              <span style={{ color:'#047857', background:'#ECFDF5', border:'1px solid #D1FAE5', borderRadius:'999px', padding:'3px 7px', fontSize:'10px', fontWeight:'800', whiteSpace:'nowrap' }}>موثوقة</span>
            </div>
          ) : (
            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>{t('orderTypeR')} *</label>
              <div style={{ display:'grid', gridTemplateColumns: `repeat(${1 + (takeawayEnabled ? 1 : 0) + (deliveryEnabled ? 1 : 0)},1fr)`, gap:'8px' }}>
                {[
                  { key:'dine_in', icon:'🪑', label:t('dineIn') },
                  ...(takeawayEnabled ? [{ key:'takeaway', icon:'🥡', label:t('takeaway2') }] : []),
                  ...(deliveryEnabled ? [{ key:'delivery', icon:'🛵', label:t('deliveryT') }] : []),
                ].map(opt => (
                  <button
                    type="button"
                    key={opt.key}
                    onClick={() => setOrderType(opt.key)}
                    aria-pressed={orderType===opt.key}
                    style={{
                      padding:'12px 8px', borderRadius:'11px', textAlign:'center',
                      border:`1.5px solid ${orderType===opt.key ? brandColor : '#E5E7EB'}`,
                      background: orderType===opt.key ? `${brandColor}0D` : 'white',
                      transition:'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize:'20px', marginBottom:'4px' }}>{opt.icon}</div>
                    <div style={{ fontSize:'12px', fontWeight:'700', color: orderType===opt.key ? brandColor : '#374151' }}>{opt.label}</div>
                  </button>
                ))}
              </div>
              {orderType === 'delivery' && deliveryFee > 0 && (
                <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'6px' }}>+ {Number(deliveryFee).toFixed(2)} ﷼ {t('feeSuffix')}</div>
              )}
            </div>
          )}

          {/* Customer info */}
          <div style={{ marginBottom:'12px' }}>
            <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>{t('nameOpt')}</label>
            <input
              type="text"
              placeholder={t('namePh2')}
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0B0B0F', background:'white', outline:'none', textAlign:'right', marginBottom:'10px' }}
            />
            <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>{t('phoneReq')} *</label>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', direction:'ltr' }}>
              <span style={{ flexShrink:0, padding:'11px 12px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', fontWeight:'700', color:'#6B7280', background:'#F8F9FB' }}>+966</span>
              <input
                type="tel"
                placeholder={t('phonePh')}
                value={customerPhone}
                onChange={e => {
                  let digits = e.target.value.replace(/[^\d]/g, '')
                  if (digits.startsWith('00966')) digits = digits.slice(5)
                  else if (digits.startsWith('966')) digits = digits.slice(3)
                  if (digits.startsWith('0')) digits = digits.slice(1)
                  digits = digits.slice(0, 9)
                  if (digits && digits[0] !== '5') return // الجوال السعودي يبدأ دائماً بـ5
                  setCustomerPhone(digits)
                }}
                style={{ flex:1, minWidth:0, padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0B0B0F', background:'white', outline:'none', textAlign:'right' }}
              />
            </div>
          </div>

          {/* رقم الطاولة — محلي فقط. Dropdown من طاولات المطعم المفعّلة؛ لو المطعم لم يُعرِّف طاولات بعد
              (لوحة التحكم فارغة)، نتراجع للحقل النصي القديم حتى لا نعطّل طلبات "داخل المطعم" */}
          {!tableQr && orderType === 'dine_in' && (
            <div style={{ marginBottom:'12px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>{t('tableReq')} *</label>
              {tables.length > 0 ? (
                <TableSelect tables={tables} value={tableNumber} onChange={setTableNumber} brandColor={brandColor} t={t} />
              ) : (
                <input
                  type="text"
                  placeholder={t('tablePh')}
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value)}
                  style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0B0B0F', background:'white', outline:'none', textAlign:'right' }}
                />
              )}
            </div>
          )}

          {/* Delivery address — توصيل فقط */}
          {orderType === 'delivery' && (
            <div style={{ marginBottom:'12px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>{t('addrReq')} *</label>
              <textarea
                placeholder={t('addrPh2')}
                value={deliveryAddress}
                onChange={e => setDeliveryAddress(e.target.value)}
                style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0B0B0F', background:'white', outline:'none', textAlign:'right', minHeight:'72px', resize:'vertical' }}
              />
            </div>
          )}

          {/* ملاحظة عامة على الطلب — اختيارية، تُحفظ في orders.notes */}
          <div style={{ marginBottom:'12px' }}>
            <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>{t('orderNoteL')}</label>
            <textarea
              placeholder={t('orderNotePh')}
              value={orderNote}
              onChange={e => setOrderNote(e.target.value)}
              maxLength={200}
              style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0B0B0F', background:'white', outline:'none', textAlign:'right', minHeight:'60px', resize:'vertical' }}
            />
          </div>

          {/* كوبون الخصم — اختياري */}
          {applyCoupon && (
            <div style={{ marginBottom:'12px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>🎟️ {isEn ? 'Coupon code' : 'كود الخصم'}</label>
              {appliedCoupon ? (
                <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'#F0FDF4', border:'1.5px solid #BBF7D0', borderRadius:'11px', padding:'10px 13px' }}>
                  <span style={{ fontSize:'13px', fontWeight:'800', color:'#166534', direction:'ltr', flex:1 }}>✓ {appliedCoupon.code}</span>
                  <button type="button" onClick={removeCoupon} style={{ border:'none', background:'none', color:'#B91C1C', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>{isEn ? 'Remove' : 'إزالة'}</button>
                </div>
              ) : (
                <div style={{ display:'flex', gap:'8px' }}>
                  <input
                    type="text"
                    value={couponInput}
                    onChange={e => setCouponInput(e.target.value.toUpperCase())}
                    placeholder={isEn ? 'Enter code' : 'أدخل الكود'}
                    style={{ flex:1, padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0B0B0F', background:'white', outline:'none', textAlign:'right', direction:'ltr' }}
                  />
                  <button
                    type="button"
                    onClick={applyCoupon}
                    disabled={applyingCoupon || !couponInput.trim()}
                    style={{ padding:'0 18px', borderRadius:'11px', border:'none', background: couponInput.trim() ? brandColor : '#E5E7EB', color: couponInput.trim() ? 'white' : '#9CA3AF', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'13px', cursor: couponInput.trim() ? 'pointer' : 'not-allowed' }}
                  >
                    {isEn ? 'Apply' : 'تطبيق'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* الملخص المالي — آخر ما يراه الزبون قبل زر التأكيد (الأسعار شاملة ض.ق.م 15%) */}
        <div style={{ padding:'12px 20px', background:'#F8F9FB', borderTop:'1px solid #E5E7EB', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#9CA3AF', marginBottom:'4px' }}>
            <span>{t('totalVat')}</span><span>{cartTotal.toFixed(2)} ﷼</span>
          </div>
          {appliedCoupon && discountAmount > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#166534', fontWeight:'700', marginBottom:'4px' }}>
              <span>🎟️ {appliedCoupon.code}</span><span>-{discountAmount.toFixed(2)} ﷼</span>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#9CA3AF', marginBottom: orderType === 'delivery' && Number(deliveryFee) > 0 ? '4px' : '8px' }}>
            <span>{t('vatLine')}</span><span>{vatBreakdown(discountedSubtotal).tax.toFixed(2)} ﷼</span>
          </div>
          {orderType === 'delivery' && Number(deliveryFee) > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#9CA3AF', marginBottom:'8px' }}>
              <span>{t('deliveryFee')}</span><span>{Number(deliveryFee).toFixed(2)} ﷼</span>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'16px', paddingTop:'8px', borderTop:'1px solid #E5E7EB' }}>
            <span>{t('total')}</span>
            <span style={{ color:brandColor }}>{finalTotal.toFixed(2)} ﷼</span>
          </div>

          {hasUnavailableItems && (
            <div style={{ display:'flex', alignItems:'flex-start', gap:'8px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'12px', padding:'12px 14px', marginTop:'12px' }}>
              <span style={{ fontSize:'18px', flexShrink:0 }}>⚠️</span>
              <div style={{ fontSize:'13px', fontWeight:'800', color:'#B91C1C' }}>{t('cartHasUnavailableItems')}</div>
            </div>
          )}

          {!openStatus.open && (
            <div style={{ display:'flex', alignItems:'flex-start', gap:'8px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'12px', padding:'12px 14px', marginTop:'12px' }}>
              <span style={{ fontSize:'18px', flexShrink:0 }}>🔴</span>
              <div>
                <div style={{ fontSize:'13px', fontWeight:'800', color:'#B91C1C', marginBottom:'2px' }}>{t('closedTitle')}</div>
                {openStatus.nextText && (
                  <div style={{ fontSize:'12px', color:'#B91C1C', opacity:0.85 }}>{openStatus.nextText}</div>
                )}
              </div>
            </div>
          )}
        </div>

        </div>

        {/* زر التأكيد الثابت — خارج التمرير، يحمل السعر، ويتعطّل مع سبينر أثناء الإرسال */}
        <div style={{ flexShrink:0, background:'white', borderTop:'1px solid #E5E7EB', padding:'11px 16px 14px', boxShadow:'0 -8px 24px rgba(20,14,28,0.06)' }}>
          <button
            type="button"
            onClick={placeOrder}
            disabled={!canSubmit}
            style={{ width:'100%', height:'52px', borderRadius:'15px', border:'none', background: canSubmit ? `linear-gradient(135deg, ${brandColor}, ${brandColor}CC)` : '#E5E7EB', color: canSubmit ? 'white' : '#9CA3AF', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'15px', cursor: canSubmit ? 'pointer' : 'not-allowed', boxShadow: canSubmit ? `0 8px 22px ${brandColor}44` : 'none', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px' }}
          >
            {submitting ? (
              <>
                <span style={{ display:'flex', alignItems:'center', gap:'9px' }}>
                  <span style={{ width:'17px', height:'17px', border:'2.5px solid rgba(255,255,255,0.4)', borderTopColor:'white', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                  {t('placingOrder')}
                </span>
                <span/>
              </>
            ) : openStatus.open ? (
              <>
                <span>{t('confirmOrder')}</span>
                <span style={{ background:'rgba(0,0,0,0.16)', padding:'5px 12px', borderRadius:'10px', fontSize:'14px' }}>{finalTotal.toFixed(2)} ﷼</span>
              </>
            ) : (
              <span style={{ width:'100%', textAlign:'center' }}>{t('closedBtn')}</span>
            )}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  )
}
