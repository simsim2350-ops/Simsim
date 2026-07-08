import { vatBreakdown } from '../../lib/pricing'

// درج السلة: العناصر + الملخص المالي + نوع الطلب + بيانات الزبون + زر التأكيد
export default function CartDrawer({
  cart, cartCount, cartTotal, restaurant, brandColor, isEn, t, itemName,
  orderType, setOrderType,
  customerName, setCustomerName, customerPhone, setCustomerPhone,
  tableNumber, setTableNumber, deliveryAddress, setDeliveryAddress,
  openStatus, placeOrder, removeFromCart, incrementCartItem, onClose,
}) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', animation:'fadeIn 0.2s ease' }}/>
      <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', maxHeight:'88vh', display:'flex', flexDirection:'column', animation:'slideUp 0.3s ease', position:'relative', overflow:'hidden' }}>
        <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'12px auto' }}/>

        <div style={{ padding:'0 20px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
          <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px' }}>🛒 {t('cartYours')} ({cartCount})</h3>
          <button onClick={onClose} style={{ width:'32px', height:'32px', borderRadius:'50%', border:'1.5px solid #E5E7EB', background:'white', fontSize:'18px', cursor:'pointer', color:'#6B7280' }}>✕</button>
        </div>

        {/* Cart items */}
        <div style={{ flex:1, overflowY:'auto', padding:'12px 20px' }}>
          {cart.map((item) => (
            <div key={item.cartKey} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 0', borderBottom:'1px solid #F3F4F6' }}>
              <div style={{ width:'48px', height:'48px', borderRadius:'12px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'24px', flexShrink:0, overflow:'hidden' }}>
                {item.image_url
                  ? <img src={item.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
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
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'0', border:'1.5px solid #E5E7EB', borderRadius:'10px', overflow:'hidden', flexShrink:0 }}>
                <button onClick={() => removeFromCart(item.cartKey)} style={{ width:'30px', height:'30px', background:'none', border:'none', fontSize:'18px', cursor:'pointer', color:brandColor, fontWeight:'300' }}>−</button>
                <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'13px', minWidth:'24px', textAlign:'center', borderRight:'1px solid #E5E7EB', borderLeft:'1px solid #E5E7EB', lineHeight:'30px' }}>{item.qty}</span>
                <button onClick={() => incrementCartItem(item.cartKey)} style={{ width:'30px', height:'30px', background:'none', border:'none', fontSize:'18px', cursor:'pointer', color:brandColor, fontWeight:'300' }}>+</button>
              </div>
              <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', flexShrink:0, minWidth:'50px', textAlign:'left' }}>{(item.price * item.qty).toFixed(2)} ﷼</div>
            </div>
          ))}
        </div>

        {/* Summary — الأسعار شاملة ض.ق.م 15% */}
        <div style={{ padding:'12px 20px', background:'#F8F9FB', borderTop:'1px solid #E5E7EB', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#9CA3AF', marginBottom:'4px' }}>
            <span>{t('totalVat')}</span><span>{cartTotal.toFixed(2)} ﷼</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#9CA3AF', marginBottom: orderType === 'delivery' && restaurant?.delivery_fee > 0 ? '4px' : '8px' }}>
            <span>{t('vatLine')}</span><span>{vatBreakdown(cartTotal).tax.toFixed(2)} ﷼</span>
          </div>
          {orderType === 'delivery' && Number(restaurant?.delivery_fee) > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#9CA3AF', marginBottom:'8px' }}>
              <span>{t('deliveryFee')}</span><span>{Number(restaurant.delivery_fee).toFixed(2)} ﷼</span>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', paddingTop:'8px', borderTop:'1px solid #E5E7EB', marginBottom:'12px' }}>
            <span>{t('total')}</span>
            <span style={{ color:brandColor }}>{(cartTotal + (orderType === 'delivery' ? (Number(restaurant.delivery_fee) || 0) : 0)).toFixed(2)} ﷼</span>
          </div>

          {/* Order type */}
          <div style={{ marginBottom:'14px' }}>
            <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>{t('orderTypeR')} *</label>
            <div style={{ display:'grid', gridTemplateColumns: restaurant?.delivery_enabled ? 'repeat(3,1fr)' : 'repeat(2,1fr)', gap:'8px' }}>
              {[
                { key:'dine_in', icon:'🪑', label:t('dineIn') },
                { key:'takeaway', icon:'🥡', label:t('takeaway2') },
                ...(restaurant?.delivery_enabled ? [{ key:'delivery', icon:'🛵', label:t('deliveryT') }] : []),
              ].map(opt => (
                <div
                  key={opt.key}
                  onClick={() => setOrderType(opt.key)}
                  style={{
                    padding:'12px 8px', borderRadius:'11px', cursor:'pointer', textAlign:'center',
                    border:`1.5px solid ${orderType===opt.key ? brandColor : '#E5E7EB'}`,
                    background: orderType===opt.key ? `${brandColor}0D` : 'white',
                    transition:'all 0.15s',
                  }}
                >
                  <div style={{ fontSize:'20px', marginBottom:'4px' }}>{opt.icon}</div>
                  <div style={{ fontSize:'12px', fontWeight:'700', color: orderType===opt.key ? brandColor : '#374151' }}>{opt.label}</div>
                </div>
              ))}
            </div>
            {orderType === 'delivery' && restaurant?.delivery_fee > 0 && (
              <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'6px' }}>+ {Number(restaurant.delivery_fee).toFixed(2)} ﷼ {t('feeSuffix')}</div>
            )}
          </div>

          {/* Customer info */}
          <div style={{ marginBottom:'12px' }}>
            <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>{t('nameOpt')}</label>
            <input
              type="text"
              placeholder={t('namePh2')}
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'white', outline:'none', textAlign:'right', marginBottom:'10px' }}
            />
            <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>{t('phoneReq')} *</label>
            <input
              type="tel"
              placeholder={t('phonePh')}
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'white', outline:'none', textAlign:'right', direction:'ltr' }}
            />
          </div>

          {/* Table number — محلي فقط */}
          {orderType === 'dine_in' && (
            <div style={{ marginBottom:'12px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>{t('tableReq')} *</label>
              <input
                type="text"
                placeholder={t('tablePh')}
                value={tableNumber}
                onChange={e => setTableNumber(e.target.value)}
                style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'white', outline:'none', textAlign:'right' }}
              />
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
                style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'white', outline:'none', textAlign:'right', minHeight:'72px', resize:'vertical' }}
              />
            </div>
          )}

          {!openStatus.open && (
            <div style={{ display:'flex', alignItems:'flex-start', gap:'8px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'12px', padding:'12px 14px', marginBottom:'12px' }}>
              <span style={{ fontSize:'18px', flexShrink:0 }}>🔴</span>
              <div>
                <div style={{ fontSize:'13px', fontWeight:'800', color:'#B91C1C', marginBottom:'2px' }}>{t('closedTitle')}</div>
                {openStatus.nextText && (
                  <div style={{ fontSize:'12px', color:'#B91C1C', opacity:0.85 }}>{openStatus.nextText}</div>
                )}
              </div>
            </div>
          )}

          <button
            onClick={placeOrder}
            disabled={!openStatus.open}
            style={{ width:'100%', padding:'15px', borderRadius:'14px', border:'none', background: openStatus.open ? `linear-gradient(135deg, ${brandColor}, ${brandColor}CC)` : '#E5E7EB', color: openStatus.open ? 'white' : '#9CA3AF', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'16px', cursor: openStatus.open ? 'pointer' : 'not-allowed', boxShadow: openStatus.open ? `0 8px 24px ${brandColor}44` : 'none' }}
          >
            {openStatus.open ? t('confirmOrder') : t('closedBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}
