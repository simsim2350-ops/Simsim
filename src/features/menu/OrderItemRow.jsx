// صف صنف داخل الطلب — صورة مصغّرة + شارة كمية + الاسم + الإضافات + الملاحظة + السعر
// مشترك بين بطاقة الطلب النشط والطلب المنطوي (عند التوسيع)
export default function OrderItemRow({ item, itemName, isEn, t }) {
  const opts = Array.isArray(item.selectedOptions) ? item.selectedOptions : []
  const optsText = opts.map(o => o.choiceName).filter(Boolean).join(isEn ? ', ' : '، ')
  const lineTotal = (Number(item.price) || 0) * (item.qty || 1)

  return (
    <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'7px 0', opacity: item.unavailable ? 0.55 : 1 }}>
      <div style={{ position:'relative', width:'42px', height:'42px', borderRadius:'11px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'21px', overflow:'hidden', background: item.image_url ? '#F8F9FB' : 'linear-gradient(145deg,#FDF0E4,#F6DEC9)' }}>
        {item.image_url
          ? <img loading="lazy" decoding="async" src={item.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : (item.emoji || '🍽️')}
        <span style={{ position:'absolute', top:'-5px', left:'-5px', background:'#1B1D24', color:'white', fontSize:'8.5px', fontWeight:'800', borderRadius:'100px', minWidth:'15px', height:'15px', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>{item.qty || 1}</span>
      </div>

      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <span style={{ fontSize:'12.5px', fontWeight:'800', textDecoration: item.unavailable ? 'line-through' : 'none' }}>{itemName(item)}</span>
          {item.unavailable && <span style={{ fontSize:'8.5px', fontWeight:'700', color:'#E11D48', background:'#FEECEF', padding:'1px 6px', borderRadius:'100px' }}>{t('unavailable')}</span>}
        </div>
        {optsText && <div style={{ fontSize:'9.5px', color:'#9CA3AF', marginTop:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{optsText}</div>}
        {item.notes && <div style={{ fontSize:'9.5px', color:'#9CA3AF', marginTop:'2px' }}>📝 {item.notes}</div>}
      </div>

      <span style={{ fontSize:'12px', fontWeight:'800', color:'#6B7280', flexShrink:0 }}>{lineTotal.toFixed(2)} ﷼</span>
    </div>
  )
}
