import { getCalorieBadge } from './helpers'
import { TYPE } from './typography'

// بطاقة صنف واحدة في المنيو — تدعم 4 تخطيطات: list (افتراضي) / grid / circles / showcase
export default function ProductItem({ product, cart, onAdd, onQtyChange, brandColor, priceColor, descColor, isEn, layout = 'list', ordering = true }) {
  const _priceColor = priceColor || brandColor
  const _descColor = descColor || '#9CA3AF'
  const pName = (isEn && product.name_en) ? product.name_en : product.name
  const pDesc = (isEn && product.description_en) ? product.description_en : product.description
  const hasOptions = Array.isArray(product.options) && product.options.length > 0
  // لو الصنف بدون خيارات: نجمع كل عناصر السلة بنفس id (مفتاح بدون خيارات دائماً ثابت)
  const qty = hasOptions ? 0 : cart.filter(i => i.id === product.id).reduce((s,i) => s + i.qty, 0)

  // إضافة سريعة: الصنف بلا خيارات يُضاف للسلة بضغطة واحدة؛ الصنف بخيارات يفتح المودال (الاختيار إجباري)
  const quickAdd = hasOptions ? onAdd : () => onQtyChange(1)

  // edge: مسافة الزر عن زاوية حاويته (بالبكسل، تقبل قيمة سالبة لتعويم الزر خارجها)
  // floating: يضيف حلقة بيضاء حول الزر لفصله بصرياً عندما يطفو خارج الصورة
  const renderQtyControl = (edge = 6, floating = false) => {
    if (!ordering) return null // PCR: الطلبات أونلاين مُطفأة → منيو عرض فقط (بلا إضافة)
    const ring = floating ? { border:'2.5px solid white' } : {}
    return qty === 0 ? (
      <button
        onClick={quickAdd}
        style={{ position:'absolute', bottom:`${edge}px`, left:`${edge}px`, width:'30px', height:'30px', borderRadius:'50%', border:'none', background: brandColor, color:'white', fontSize:'20px', fontWeight:'300', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 12px ${brandColor}55`, lineHeight:'1', ...ring }}
      >
        +
      </button>
    ) : (
      <div style={{ position:'absolute', bottom:`${edge-1}px`, left:`${edge-2}px`, display:'flex', alignItems:'center', background:'#0B0B0F', borderRadius:'100px', overflow:'hidden', boxShadow:'0 4px 12px rgba(0,0,0,0.3)', ...ring }}>
        <button onClick={() => onQtyChange(-1)} style={{ width:'26px', height:'26px', background:'none', border:'none', color:'white', fontSize:'17px', cursor:'pointer', fontWeight:'300', display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
        <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'13px', color:'white', minWidth:'20px', textAlign:'center' }}>{qty}</span>
        <button onClick={quickAdd} style={{ width:'26px', height:'26px', background:'none', border:'none', color:'white', fontSize:'17px', cursor:'pointer', fontWeight:'300', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
      </div>
    )
  }
  const qtyControl = renderQtyControl()
  const renderTags = (position = {}) => {
    if (!product.is_most_ordered && !product.is_featured) return null
    return (
      <div style={{ position:'absolute', top:'8px', right:'8px', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'4px', zIndex:1, ...position }}>
        {product.is_most_ordered && <span style={{ fontSize:'9px', fontWeight:'800', color:'#92400E', background:'#FEF3C7', padding:'2px 7px', borderRadius:'100px', whiteSpace:'nowrap' }}>{isEn ? 'Most Ordered 🔥' : 'الأكثر طلبًا 🔥'}</span>}
        {product.is_featured && <span style={{ fontSize:'9px', fontWeight:'800', color:'#1E5FBF', background:'#EAF3FF', padding:'2px 7px', borderRadius:'100px', whiteSpace:'nowrap' }}>{isEn ? 'Featured' : 'مميز'}</span>}
      </div>
    )
  }

  if (layout === 'circles') {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', padding:'6px 4px' }}>
        <div style={{ position:'relative', marginBottom:'10px' }}>
          <div onClick={onAdd} style={{
            width:'104px', height:'104px', borderRadius:'50%', background:'#F8F9FB',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:'44px',
            overflow:'hidden', boxShadow:'0 6px 18px rgba(0,0,0,0.10)', border:'3px solid white', cursor:'pointer',
          }}>
            {product.image_url
              ? <img loading="lazy" decoding="async" src={product.image_url} alt={product.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : product.emoji}
          </div>
          {renderTags({ top:'-2px', right:'-2px', transform:'scale(.82)', transformOrigin:'top right' })}
          <div style={{ position:'absolute', bottom:'-2px', left:'50%', transform:'translateX(50%)' }}>
            {qtyControl}
          </div>
        </div>
        <div style={{ ...TYPE.itemNameSm, color:'#0B0B0F', marginBottom:'4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%' }}>{pName}</div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
          <span style={{ ...TYPE.priceSm, color: _priceColor }}>{product.price} ﷼</span>
          {product.compare_price && <span style={{ ...TYPE.caption, color:'#9CA3AF', textDecoration:'line-through' }}>{product.compare_price} ﷼</span>}
        </div>
      </div>
    )
  }

  if (layout === 'grid') {
    return (
      <div style={{ background:'white', borderRadius:'14px', overflow:'hidden', border:'1px solid #F0F0F0' }}>
        <div style={{ position:'relative' }}>
          <div onClick={onAdd} style={{ width:'100%', aspectRatio:'1/1', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'46px', overflow:'hidden', cursor:'pointer' }}>
            {product.image_url
              ? <img loading="lazy" decoding="async" src={product.image_url} alt={product.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : product.emoji}
          </div>
          {renderTags()}
          {qtyControl}
        </div>
        <div onClick={onAdd} style={{ padding:'10px 12px', cursor:'pointer' }}>
          <div style={{ ...TYPE.itemNameSm, color:'#0B0B0F', marginBottom:'4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pName}</div>
          <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
            <span style={{ ...TYPE.priceSm, color: _priceColor }}>{product.price} ﷼</span>
            {product.compare_price && <span style={{ ...TYPE.caption, color:'#9CA3AF', textDecoration:'line-through' }}>{product.compare_price} ﷼</span>}
          </div>
        </div>
      </div>
    )
  }

  if (layout === 'showcase') {
    return (
      <div style={{ background:'white', borderRadius:'14px', overflow:'hidden', border:'1px solid #F0F0F0' }}>
        <div style={{ position:'relative' }}>
          <div onClick={onAdd} style={{ width:'100%', aspectRatio:'4/3', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'52px', overflow:'hidden', cursor:'pointer' }}>
            {product.image_url
              ? <img loading="lazy" decoding="async" src={product.image_url} alt={product.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : product.emoji}
          </div>
          {renderTags()}
          {qtyControl}
        </div>
        <div onClick={onAdd} style={{ padding:'12px 14px', cursor:'pointer' }}>
          <div style={{ ...TYPE.itemName, color:'#0B0B0F', marginBottom:'4px' }}>{pName}</div>
          {pDesc && (
            <div style={{ ...TYPE.body, color:_descColor, marginBottom:'8px', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
              {pDesc}
            </div>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <span style={{ ...TYPE.price, color: _priceColor }}>{product.price} ﷼</span>
            {product.compare_price && <span style={{ ...TYPE.caption, color:'#9CA3AF', textDecoration:'line-through' }}>{product.compare_price} ﷼</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background:'white', padding:'12px 14px', display:'flex', gap:'12px', alignItems:'center' }}>
      <div onClick={onAdd} style={{ flex:1, minWidth:0, cursor:'pointer' }}>
        <div style={{ ...TYPE.itemName, color:'#0B0B0F', marginBottom:'3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pName}</div>
        {pDesc && (
          <div style={{ ...TYPE.body, color:'#9CA3AF', marginBottom:'6px', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
            {pDesc}
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ ...TYPE.price, color: _priceColor, fontVariantNumeric:'tabular-nums' }}>{product.price} ﷼</span>
          {product.compare_price && <span style={{ ...TYPE.caption, color:'#9CA3AF', textDecoration:'line-through' }}>{product.compare_price} ﷼</span>}
          {product.calories && <span style={{ ...TYPE.meta, color:'#9CA3AF' }}>{getCalorieBadge(product.calories)} {product.calories}</span>}
        </div>
      </div>

      <div style={{ position:'relative', flexShrink:0 }}>
        <div onClick={onAdd} style={{ width:'108px', height:'108px', borderRadius:'14px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'36px', border:'1px solid #E5E7EB', overflow:'hidden', cursor:'pointer' }}>
          {product.image_url
            ? <img loading="lazy" decoding="async" src={product.image_url} alt={product.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : product.emoji}
        </div>
        {renderTags()}
        {renderQtyControl(-9, true)}
      </div>
    </div>
  )
}
