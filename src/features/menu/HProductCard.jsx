// بطاقة صنف أفقية مدمجة — للشريط المنزلق (قائمة "يعجب زبائننا")
// صورة + اسم + سعر + زر إضافة. الضغط على الصورة/الاسم يفتح التفاصيل؛
// زر + يضيف مباشرة لو بلا خيارات، أو يفتح المودال لو له خيارات إجبارية.
export default function HProductCard({ product, onOpen, onQuickAdd, brandColor, priceColor, isEn }) {
  const pName = (isEn && product.name_en) ? product.name_en : product.name
  const hasOptions = Array.isArray(product.options) && product.options.length > 0
  return (
    <div style={{ width:'134px', flexShrink:0, background:'white', border:'1px solid #F0ECEF', borderRadius:'16px', overflow:'hidden', boxShadow:'0 4px 14px rgba(25,18,32,0.07)' }}>
      <div onClick={onOpen} style={{ height:'96px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'40px', overflow:'hidden', cursor:'pointer' }}>
        {product.image_url
          ? <img loading="lazy" decoding="async" src={product.image_url} alt={product.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : product.emoji}
      </div>
      <div style={{ padding:'8px 10px 10px' }}>
        <div onClick={onOpen} style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', color:'#1D1923', marginBottom:'7px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>{pName}</div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'12.5px', color:priceColor }}>{product.price} ﷼</span>
          {onQuickAdd && (
            <button
              onClick={() => hasOptions ? onOpen() : onQuickAdd()}
              style={{ width:'25px', height:'25px', borderRadius:'50%', border:'none', background:brandColor, color:'white', fontSize:'16px', fontWeight:'300', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, boxShadow:`0 3px 10px ${brandColor}55` }}
              aria-label="إضافة"
            >+</button>
          )}
        </div>
      </div>
    </div>
  )
}
