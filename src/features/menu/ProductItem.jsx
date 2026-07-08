import { getCalorieBadge } from './helpers'

// بطاقة صنف واحدة في المنيو — تدعم 3 تخطيطات: list (افتراضي) / grid / circles
export default function ProductItem({ product, cart, onAdd, onQtyChange, brandColor, priceColor, descColor, isEn, layout = 'list' }) {
  const _priceColor = priceColor || brandColor
  const _descColor = descColor || '#9CA3AF'
  const pName = (isEn && product.name_en) ? product.name_en : product.name
  const pDesc = (isEn && product.description_en) ? product.description_en : product.description
  const hasOptions = Array.isArray(product.options) && product.options.length > 0
  // لو الصنف بدون خيارات: نجمع كل عناصر السلة بنفس id (مفتاح بدون خيارات دائماً ثابت)
  const qty = hasOptions ? 0 : cart.filter(i => i.id === product.id).reduce((s,i) => s + i.qty, 0)

  // إضافة سريعة: الصنف بلا خيارات يُضاف للسلة بضغطة واحدة؛ الصنف بخيارات يفتح المودال (الاختيار إجباري)
  const quickAdd = hasOptions ? onAdd : () => onQtyChange(1)

  const qtyControl = qty === 0 ? (
    <button
      onClick={quickAdd}
      style={{ position:'absolute', bottom:'6px', left:'6px', width:'30px', height:'30px', borderRadius:'50%', border:'none', background: brandColor, color:'white', fontSize:'20px', fontWeight:'300', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 12px ${brandColor}55`, lineHeight:'1' }}
    >
      +
    </button>
  ) : (
    <div style={{ position:'absolute', bottom:'5px', left:'4px', display:'flex', alignItems:'center', background:'#0F1117', borderRadius:'100px', overflow:'hidden', boxShadow:'0 4px 12px rgba(0,0,0,0.3)' }}>
      <button onClick={() => onQtyChange(-1)} style={{ width:'26px', height:'26px', background:'none', border:'none', color:'white', fontSize:'17px', cursor:'pointer', fontWeight:'300', display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
      <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'13px', color:'white', minWidth:'20px', textAlign:'center' }}>{qty}</span>
      <button onClick={quickAdd} style={{ width:'26px', height:'26px', background:'none', border:'none', color:'white', fontSize:'17px', cursor:'pointer', fontWeight:'300', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
    </div>
  )

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
          {product.is_featured && (
            <span style={{ position:'absolute', top:'-2px', right:'-2px', fontSize:'9px', fontWeight:'800', color:'#92400E', background:'#FEF3C7', padding:'2px 6px', borderRadius:'100px', boxShadow:'0 2px 6px rgba(0,0,0,0.1)' }}>⭐</span>
          )}
          <div style={{ position:'absolute', bottom:'-2px', left:'50%', transform:'translateX(50%)' }}>
            {qtyControl}
          </div>
        </div>
        <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', color:'#0F1117', marginBottom:'4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%' }}>{pName}</div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'13px', color: _priceColor }}>{product.price} ﷼</span>
          {product.compare_price && <span style={{ fontSize:'10px', color:'#9CA3AF', textDecoration:'line-through' }}>{product.compare_price} ﷼</span>}
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
          {product.is_featured && (
            <span style={{ position:'absolute', top:'8px', right:'8px', fontSize:'10px', fontWeight:'800', color:'#92400E', background:'#FEF3C7', padding:'2px 7px', borderRadius:'100px' }}>{isEn ? '⭐ Featured' : '⭐ مميز'}</span>
          )}
          {qtyControl}
        </div>
        <div onClick={onAdd} style={{ padding:'10px 12px', cursor:'pointer' }}>
          <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', color:'#0F1117', marginBottom:'4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pName}</div>
          <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'13px', color: _priceColor }}>{product.price} ﷼</span>
            {product.compare_price && <span style={{ fontSize:'10px', color:'#9CA3AF', textDecoration:'line-through' }}>{product.compare_price} ﷼</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background:'white', padding:'14px 16px', display:'flex', gap:'12px', alignItems:'center' }}>
      <div onClick={onAdd} style={{ flex:1, minWidth:0, cursor:'pointer' }}>
        {product.is_featured && (
          <span style={{ fontSize:'10px', fontWeight:'800', color:'#92400E', background:'#FEF3C7', padding:'2px 7px', borderRadius:'100px', marginBottom:'4px', display:'inline-block' }}>{isEn ? '⭐ Featured' : '⭐ مميز'}</span>
        )}
        <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', color:'#0F1117', marginBottom:'4px' }}>{pName}</div>
        {pDesc && (
          <div style={{ fontSize:'12px', color:'#9CA3AF', lineHeight:'1.5', marginBottom:'8px', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
            {pDesc}
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px', color: _priceColor }}>{product.price} ﷼</span>
          {product.compare_price && <span style={{ fontSize:'12px', color:'#9CA3AF', textDecoration:'line-through' }}>{product.compare_price} ﷼</span>}
          {product.calories && <span style={{ fontSize:'11px', color:'#9CA3AF' }}>{getCalorieBadge(product.calories)} {product.calories}</span>}
        </div>
      </div>

      <div style={{ position:'relative', flexShrink:0 }}>
        <div onClick={onAdd} style={{ width:'88px', height:'88px', borderRadius:'14px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'42px', border:'1px solid #E5E7EB', overflow:'hidden', cursor:'pointer' }}>
          {product.image_url
            ? <img loading="lazy" decoding="async" src={product.image_url} alt={product.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : product.emoji}
        </div>
        {qtyControl}
      </div>
    </div>
  )
}
