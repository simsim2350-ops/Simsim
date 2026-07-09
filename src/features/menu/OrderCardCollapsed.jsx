import { useState } from 'react'
import OrderItemRow from './OrderItemRow'

// بطاقة طلب سابق (مكتمل/ملغي) — منطوية في صفّ مدمج مع زر «اطلب تاني»،
// تنفتح بالنقر لعرض الأصناف والإجمالي والتقييم.
export default function OrderCardCollapsed({
  order, brandColor, isEn, t, itemName,
  reviewedIds, reviewDraft, setDraft, submitReview, submittingReview,
  onReorder,
}) {
  const [open, setOpen] = useState(false)
  const items = Array.isArray(order.items) ? order.items : []
  const isCancelled = order.status === 'cancelled'
  const count = items.reduce((s, i) => s + (i.qty || 1), 0)
  const reviewed = reviewedIds.includes(order.id)

  // زمن الطلب المختصر
  const timeAgo = (() => {
    if (!order.createdAt) return ''
    const days = Math.floor((Date.now() - order.createdAt) / 86400000)
    if (days <= 0) return t('today')
    if (days === 1) return t('yesterday')
    return t('daysAgo').replace('{n}', days)
  })()

  const thumbs = items.slice(0, 3)
  const metaBits = [
    timeAgo,
    `${(Number(order.total) || 0).toFixed(2)} ﷼`,
    `${count} ${t('itemsUnit')}`,
    ...(isCancelled ? [] : [reviewed ? t('ratedShort') : t('notRated')]),
  ].filter(Boolean)

  return (
    <div style={{ background:'white', border:'1px solid #E5E7EB', borderRadius:'16px', boxShadow:'0 4px 14px rgba(15,17,23,0.05)', marginBottom:'11px', overflow:'hidden' }}>
      {/* الصف المنطوي */}
      <div onClick={() => setOpen(o => !o)} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 14px', cursor:'pointer' }}>
        {/* صور مكدّسة */}
        <div style={{ display:'flex', flexShrink:0, direction:'ltr' }}>
          {thumbs.map((it, i) => (
            <div key={i} style={{ width:'34px', height:'34px', borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', overflow:'hidden', background: it.image_url ? '#F8F9FB' : 'linear-gradient(145deg,#FDF0E4,#F6DEC9)', border:'2px solid white', marginLeft: i > 0 ? '-12px' : 0, opacity: isCancelled ? 0.6 : 1 }}>
              {it.image_url ? <img loading="lazy" decoding="async" src={it.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (it.emoji || '🍽️')}
            </div>
          ))}
        </div>

        {/* الوسط */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'13px' }}>{order.orderNumber}</span>
            <span style={{ fontSize:'10px', fontWeight:'800', padding:'3px 9px', borderRadius:'100px', color: isCancelled ? '#E11D48' : '#0E9F6E', background: isCancelled ? '#FEECEF' : '#E6F6EF' }}>
              {isCancelled ? (order.cancelledBy === 'customer' ? t('stCancYou') : t('stCancShop')) : t('stCompleted')}
            </span>
          </div>
          <div style={{ fontSize:'10px', color:'#9CA3AF', marginTop:'3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{metaBits.join(' · ')}</div>
        </div>

        {/* اطلب تاني */}
        <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:'3px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onReorder(order) }}
            aria-label={t('reorder')}
            style={{ width:'38px', height:'38px', borderRadius:'50%', border:'none', background:brandColor, color:'white', fontSize:'17px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 5px 13px ${brandColor}55` }}
          >🔄</button>
          <span style={{ fontSize:'8.5px', fontWeight:'800', color:brandColor }}>{t('reorder')}</span>
        </div>
      </div>

      {/* التفاصيل عند التوسيع */}
      {open && (
        <div style={{ borderTop:'1px solid #F3F4F6', padding:'10px 14px 12px' }}>
          {items.map((item, i) => (
            <OrderItemRow key={i} item={item} itemName={itemName} isEn={isEn} t={t} />
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'13.5px', paddingTop:'8px', marginTop:'4px', borderTop:'1px solid #F3F4F6' }}>
            <span>{t('total')}</span>
            <span style={{ color:brandColor }}>{(Number(order.total) || 0).toFixed(2)} ﷼</span>
          </div>

          {/* التقييم — للطلب المكتمل فقط */}
          {!isCancelled && (
            reviewed ? (
              <div style={{ marginTop:'12px', padding:'11px', borderRadius:'12px', background:'#ECFDF5', border:'1px solid #A7F3D0', textAlign:'center', fontSize:'12.5px', fontWeight:'700', color:'#065F46' }}>
                {t('reviewedOk')}
              </div>
            ) : (
              <div style={{ marginTop:'12px', paddingTop:'12px', borderTop:'1px dashed #E5E7EB' }}>
                <div style={{ fontSize:'12.5px', fontWeight:'800', marginBottom:'9px', textAlign:'center' }}>{t('reviewQ')} 🌟</div>
                <div style={{ display:'flex', justifyContent:'center', gap:'7px', marginBottom:'11px' }}>
                  {[1,2,3,4,5].map(n => {
                    const active = (reviewDraft[order.id]?.rating || 0) >= n
                    return (
                      <span key={n} onClick={() => setDraft(order.id, { rating:n })} style={{ fontSize:'30px', cursor:'pointer', lineHeight:1, filter: active ? 'none' : 'grayscale(1)', opacity: active ? 1 : 0.35, transition:'all 0.1s' }}>⭐</span>
                    )
                  })}
                </div>
                <textarea
                  value={reviewDraft[order.id]?.comment || ''}
                  onChange={e => setDraft(order.id, { comment: e.target.value })}
                  placeholder={t('noteShop')}
                  style={{ width:'100%', padding:'10px 12px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'13px', outline:'none', textAlign:'right', minHeight:'54px', resize:'vertical', boxSizing:'border-box', marginBottom:'9px' }}
                />
                <button
                  onClick={() => submitReview(order)}
                  disabled={submittingReview}
                  style={{ width:'100%', padding:'10px', borderRadius:'11px', border:'none', background:brandColor, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12.5px', cursor:'pointer', opacity: submittingReview ? 0.7 : 1 }}
                >
                  {submittingReview ? t('sendingRev') : t('sendReview')}
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
