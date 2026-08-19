// بطاقة صنف أفقية مدمجة — للشريط المنزلق (قائمة "يعجب زبائننا")
// صورة + اسم + سعر + زر إضافة. الضغط على الصورة/الاسم يفتح التفاصيل؛
// زر + يضيف مباشرة لو بلا خيارات، أو يفتح المودال لو له خيارات إجبارية.
import { TYPE } from './typography'
import ResponsiveMenuImage from './ResponsiveMenuImage'

export default function HProductCard({ product, onOpen, onQuickAdd, brandColor, priceColor, isEn, priority = false }) {
  const pName = (isEn && product.name_en) ? product.name_en : product.name
  const hasOptions = Array.isArray(product.options) && product.options.length > 0
  return (
    <div style={{ width:'134px', flexShrink:0, background:'white', border:'1px solid #F0ECEF', borderRadius:'16px', overflow:'hidden', boxShadow:'0 4px 14px rgba(25,18,32,0.07)' }}>
      <div onClick={onOpen} style={{ height:'96px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'40px', overflow:'hidden', cursor:'pointer' }}>
        {product.image_url
          ? <ResponsiveMenuImage src={product.image_url} alt={product.name} width="134" height="96" widths={[160, 320, 480]} sizes="134px" quality={72} priority={priority} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
          : product.emoji}
      </div>
      <div style={{ padding:'8px 10px 10px' }}>
        <div onClick={onOpen} style={{ ...TYPE.itemNameSm, color:'#1D1923', marginBottom:'7px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>{pName}</div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ ...TYPE.priceSm, color:priceColor }}>{product.price} ﷼</span>
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
