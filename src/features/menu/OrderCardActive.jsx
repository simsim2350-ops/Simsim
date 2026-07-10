import { useState } from 'react'
import OrderItemRow from './OrderItemRow'
import ConfirmDialog from '../../components/ConfirmDialog'

// بطاقة الطلب النشط — هيدر (رقم + وقت + حالة حيّة) + Timeline + الوقت المتوقّع
// + الأصناف والإجمالي + أزرار (رسالة للمطعم · إلغاء قبل التحضير)
export default function OrderCardActive({
  order, brandColor, isEn, t, itemName, prepTime, onMessage, onCancel,
}) {
  // تأكيد الإلغاء داخل المنصّة بنفس هوية سمسم — بديل عن نافذة المتصفح الافتراضية
  const [confirmOpen, setConfirmOpen] = useState(false)
  const statuses = ['pending','preparing','ready','completed']
  const currentIdx = statuses.indexOf(order.status)
  const items = Array.isArray(order.items) ? order.items : []
  const count = items.reduce((s, i) => s + (i.qty || 1), 0)

  const dt = order.createdAt ? new Date(order.createdAt) : null
  const timeStr = dt ? dt.toLocaleTimeString(isEn ? 'en-US' : 'ar-EG', { hour:'2-digit', minute:'2-digit' }) : ''

  const steps = [
    { key:'pending',   icon:'📥', lbl:t('stepReceived') },
    { key:'preparing', icon:'👨‍🍳', lbl:t('stepPreparing') },
    { key:'ready',     icon:'✅', lbl:t('stepReady') },
    { key:'completed', icon:'🎉', lbl:t('stepDelivered') },
  ]
  const statusLabel = { pending:t('stReceived'), preparing:t('stPreparing'), ready:t('stReady') }[order.status] || order.status
  const showEta = ['pending','preparing'].includes(order.status)

  const metaTags = [
    { dine_in:t('otDine'), takeaway:t('otTake'), delivery:t('otDeliv') }[order.orderType] || '',
    order.orderType === 'dine_in' && order.tableNumber ? `${isEn ? 'Table' : 'طاولة'} ${order.tableNumber}` : '',
    order.orderType === 'delivery' && order.deliveryAddress ? order.deliveryAddress : '',
    `${count} ${t('itemsUnit')}`,
  ].filter(Boolean)

  return (
    <div style={{ background:'white', border:'1px solid #E5E7EB', borderRadius:'18px', boxShadow:'0 6px 20px rgba(15,17,23,0.06)', marginBottom:'16px', overflow:'hidden' }}>
      {/* هيدر */}
      <div style={{ padding:'14px 15px 12px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px' }}>{order.orderNumber}</div>
            {timeStr && <div style={{ fontSize:'10.5px', color:'#9CA3AF', marginTop:'3px' }}>{t('today')} · {timeStr}</div>}
          </div>
          <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', fontSize:'10.5px', fontWeight:'800', color:'#1E5FBF', background:'#EAF3FF', padding:'4px 11px', borderRadius:'100px' }}>
            <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#1E5FBF', animation:'blink 1.4s infinite' }}/>
            {statusLabel}
          </span>
        </div>
        <div style={{ display:'flex', gap:'7px', flexWrap:'wrap', marginTop:'10px' }}>
          {metaTags.map((m, i) => (
            <span key={i} style={{ fontSize:'10px', fontWeight:'700', color:'#6B7280', background:'rgba(120,110,130,0.09)', padding:'4px 9px', borderRadius:'8px' }}>{m}</span>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ display:'flex', alignItems:'flex-start', padding:'4px 15px 12px' }}>
        {steps.map((step, i) => {
          const idx = statuses.indexOf(step.key)
          const done = idx < currentIdx
          const cur = idx === currentIdx
          return (
            <div key={step.key} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', position:'relative' }}>
              {i < steps.length - 1 && (
                <div style={{ position:'absolute', top:'15px', right:'50%', width:'100%', height:'2px', background: done ? '#10B981' : '#E5E7EB', zIndex:1 }}/>
              )}
              <div style={{
                width:'30px', height:'30px', borderRadius:'50%', zIndex:2,
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px',
                background: done ? '#10B981' : cur ? brandColor : '#F1EFEA',
                border: `2px solid ${done ? '#10B981' : cur ? brandColor : '#E5E7EB'}`,
                color: (done || cur) ? 'white' : 'inherit',
                boxShadow: cur ? `0 0 0 5px ${brandColor}28` : 'none',
                transition:'all 0.4s',
              }}>{done ? '✓' : step.icon}</div>
              <div style={{ fontSize:'8.5px', fontWeight: cur ? '900' : '700', marginTop:'5px', color: cur ? brandColor : '#9CA3AF' }}>{step.lbl}</div>
            </div>
          )
        })}
      </div>

      {/* الوقت المتوقّع */}
      {showEta && prepTime && (
        <div style={{ margin:'0 15px 12px', background:'#EAF3FF', borderRadius:'11px', padding:'9px 12px', fontSize:'11.5px', fontWeight:'800', color:'#1E5FBF', display:'flex', alignItems:'center', gap:'7px' }}>
          ⏱️ {t('etaLabel')}: {prepTime} {t('minShort')}
        </div>
      )}

      {/* الأصناف + الإجمالي */}
      <div style={{ padding:'2px 15px 12px', borderTop:'1px solid #F3F4F6' }}>
        <div style={{ paddingTop:'8px' }}>
          {items.map((item, i) => (
            <OrderItemRow key={i} item={item} itemName={itemName} isEn={isEn} t={t} />
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', paddingTop:'8px', marginTop:'4px', borderTop:'1px solid #F3F4F6' }}>
            <span>{t('total')}</span>
            <span style={{ color:brandColor }}>{(Number(order.total) || 0).toFixed(2)} ﷼</span>
          </div>
        </div>
      </div>

      {/* أزرار */}
      <div style={{ display:'flex', gap:'8px', padding:'0 15px 15px' }}>
        <button
          onClick={() => onMessage(order)}
          style={{ flex:1, padding:'11px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', color:'#374151', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer' }}
        >{t('msgRest')}</button>
        {order.status === 'pending' && (
          <button
            onClick={() => setConfirmOpen(true)}
            style={{ flex:1, padding:'11px', borderRadius:'12px', border:'none', background:'#FEECEF', color:'#E11D48', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer' }}
          >✕ {t('cancelOrder')}</button>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t('cancelConfirmTitle')}
        body={t('cancelConfirmBody').replace('{n}', order.orderNumber)}
        cancelLabel={t('cancelConfirmBack')}
        confirmLabel={t('cancelConfirmYes')}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); onCancel(order) }}
      />
    </div>
  )
}
