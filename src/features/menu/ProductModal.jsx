import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { getCalorieBadge } from './helpers'

// مودال تفاصيل الصنف: الخيارات + الكمية + الملاحظة + السحب للإغلاق.
// يملك حالته الداخلية — تُصفَّر تلقائياً مع كل فتح لأن المودال يُركَّب من جديد.
// initial: { qty, note, options } لوضع التعديل من السلة (✎) — يعبّئ الحالة مسبقاً
// submitLabel: نص زر التأكيد (الافتراضي «إضافة للسلة»)
// products/recommendationsMap/onAddCompanion: اقتراحات مخصّصة لهذا الصنف تحديداً (قواعد المطعم اليدوية فقط، بلا خيارات إجبارية لإضافة فورية)
export default function ProductModal({ product, brandColor, priceColor, isEn, t, onAdd, onClose, initial, submitLabel, products = [], recommendationsMap, onAddCompanion }) {
  const [qty, setQty] = useState(initial?.qty ?? 1)
  const [note, setNote] = useState(initial?.note ?? '')
  const [options, setOptions] = useState(initial?.options ?? {}) // { groupIdx: choiceIdx | [choiceIdx,...] }
  const [dragOffset, setDragOffset] = useState(0)
  const dragStartYRef = useRef(null)

  // قفل تمرير الصفحة خلف الـ Modal طول ما هي مفتوحة (يمنع تحرّك المنيو أثناء سحب الـ Modal)
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // التحقق من اكتمال كل مجموعات الخيارات الإجبارية
  const validateOptions = () => {
    const groups = Array.isArray(product?.options) ? product.options : []
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi]
      if (!group.required) continue
      const sel = options[gi]
      if (group.type === 'multiple') {
        if (!Array.isArray(sel) || sel.length === 0) return group.name
      } else {
        if (sel == null) return group.name
      }
    }
    return null
  }

  // تحويل الخيارات (مؤشرات) إلى قائمة مفسّرة {groupName, choiceName, price}
  const resolveOptions = () => {
    const groups = Array.isArray(product?.options) ? product.options : []
    const resolved = []
    groups.forEach((group, gi) => {
      const sel = options[gi]
      if (sel == null) return
      if (group.type === 'multiple') {
        (Array.isArray(sel) ? sel : []).forEach(ci => {
          const choice = group.choices[ci]
          if (choice) resolved.push({ groupName: group.name, choiceName: choice.name, price: choice.price || 0 })
        })
      } else {
        const choice = group.choices[sel]
        if (choice) resolved.push({ groupName: group.name, choiceName: choice.name, price: choice.price || 0 })
      }
    })
    return resolved
  }

  // اقتراحات مخصّصة لهذا الصنف (قواعد المطعم اليدوية فقط — بلا تسلسل احتياطي، دقة أعلى من عمومية)
  const companions = (recommendationsMap?.get(product.id) || [])
    .map(id => products.find(p => p.id === id))
    .filter(p => p && p.is_available && !(Array.isArray(p.options) && p.options.some(g => g.required)))

  const toggleSingleOption = (groupIdx, choiceIdx) => {
    setOptions(prev => ({ ...prev, [groupIdx]: choiceIdx }))
  }

  const toggleMultipleOption = (groupIdx, choiceIdx) => {
    setOptions(prev => {
      const current = Array.isArray(prev[groupIdx]) ? prev[groupIdx] : []
      const next = current.includes(choiceIdx)
        ? current.filter(i => i !== choiceIdx)
        : [...current, choiceIdx]
      return { ...prev, [groupIdx]: next }
    })
  }

  // سحب الـ Modal للأسفل بالإصبع لإغلاقها (Swipe-to-dismiss)
  const DRAG_CLOSE_THRESHOLD = 100 // px — لو السحب تجاوز هذا الحد، يُغلَق الـ Modal تلقائياً

  const handleTouchStart = (e) => {
    dragStartYRef.current = e.touches[0].clientY
  }

  const handleTouchMove = (e) => {
    if (dragStartYRef.current == null) return
    const delta = e.touches[0].clientY - dragStartYRef.current
    if (delta > 0) {
      e.preventDefault() // منع تمرير الصفحة خلف الـ Modal أثناء السحب للأسفل
      setDragOffset(delta)
    }
  }

  const handleTouchEnd = () => {
    if (dragOffset > DRAG_CLOSE_THRESHOLD) {
      onClose()
    }
    setDragOffset(0)
    dragStartYRef.current = null
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', animation: dragOffset > 0 ? 'none' : 'fadeIn 0.2s ease', opacity: dragOffset > 0 ? Math.max(1 - dragOffset / 300, 0.3) : 1 }}/>
      <div style={{
        background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px',
        animation: dragOffset > 0 ? 'none' : 'slideUp 0.3s ease',
        transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : 'none',
        transition: dragOffset > 0 ? 'none' : 'transform 0.2s ease',
        position:'relative', overflow:'hidden', maxHeight:'90vh', display:'flex', flexDirection:'column',
      }}>
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ flexShrink:0 }}
        >
          <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'12px auto' }}/>

          <div style={{ height:'190px', background: product.image_url ? '#F8F9FB' : `linear-gradient(135deg, ${brandColor}22, ${brandColor}08)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'70px', overflow:'hidden' }}>
            {product.image_url
              ? <img src={product.image_url} alt={product.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : product.emoji}
          </div>
        </div>

        <div style={{ overflowY:'auto' }}>
        <div style={{ padding:'20px 20px 32px' }}>
          <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'22px', marginBottom:'6px' }}>{(isEn && product.name_en) ? product.name_en : product.name}</h2>
          {((isEn && product.description_en) ? product.description_en : product.description) && <p style={{ fontSize:'14px', color:'#6B7280', lineHeight:'1.65', marginBottom:'16px' }}>{(isEn && product.description_en) ? product.description_en : product.description}</p>}

          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'24px', color:priceColor }}>{product.price} ﷼</span>
            {product.compare_price && <span style={{ fontSize:'15px', color:'#9CA3AF', textDecoration:'line-through' }}>{product.compare_price} ﷼</span>}
            {product.calories && <span style={{ fontSize:'12px', color:'#9CA3AF', background:'#F3F4F6', padding:'3px 10px', borderRadius:'100px', marginRight:'auto' }}>{getCalorieBadge(product.calories)} {product.calories} {t('calories')}</span>}
          </div>

          {/* Option groups: size, extras, etc. */}
          {Array.isArray(product.options) && product.options.length > 0 && (
            <div style={{ marginBottom:'20px', display:'flex', flexDirection:'column', gap:'16px' }}>
              {product.options.map((group, gi) => (
                <div key={gi}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
                    <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px' }}>{group.name}</span>
                    {group.required && <span style={{ fontSize:'10px', fontWeight:'700', color:'#EF4444', background:'#FEF2F2', padding:'2px 7px', borderRadius:'100px' }}>{t('required')}</span>}
                    {!group.required && group.type === 'multiple' && <span style={{ fontSize:'10px', fontWeight:'700', color:'#9CA3AF', background:'#F3F4F6', padding:'2px 7px', borderRadius:'100px' }}>{t('optional')}</span>}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                    {group.choices.map((choice, ci) => {
                      const isSelected = group.type === 'multiple'
                        ? (Array.isArray(options[gi]) && options[gi].includes(ci))
                        : options[gi] === ci
                      return (
                        <div
                          key={ci}
                          onClick={() => group.type === 'multiple' ? toggleMultipleOption(gi, ci) : toggleSingleOption(gi, ci)}
                          style={{
                            display:'flex', alignItems:'center', justifyContent:'space-between',
                            padding:'11px 14px', borderRadius:'11px', cursor:'pointer',
                            border:`1.5px solid ${isSelected ? brandColor : '#E5E7EB'}`,
                            background: isSelected ? `${brandColor}0D` : 'white',
                            transition:'all 0.15s',
                          }}
                        >
                          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                            <div style={{
                              width:'18px', height:'18px', flexShrink:0,
                              borderRadius: group.type === 'multiple' ? '5px' : '50%',
                              border:`2px solid ${isSelected ? brandColor : '#D1D5DB'}`,
                              background: isSelected ? brandColor : 'white',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:'11px', color:'white',
                            }}>
                              {isSelected && '✓'}
                            </div>
                            <span style={{ fontSize:'14px', fontWeight:'600' }}>{choice.name}</span>
                          </div>
                          {choice.price > 0 && <span style={{ fontSize:'13px', fontWeight:'700', color:brandColor }}>+{choice.price} ﷼</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quantity */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px' }}>{t('qty')}</span>
            <div style={{ display:'flex', alignItems:'center', gap:'0', border:'1.5px solid #E5E7EB', borderRadius:'12px', overflow:'hidden' }}>
              <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width:'40px', height:'40px', background:'none', border:'none', fontSize:'22px', cursor:'pointer', color:brandColor, fontWeight:'300' }}>−</button>
              <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', minWidth:'40px', textAlign:'center', borderRight:'1px solid #E5E7EB', borderLeft:'1px solid #E5E7EB', lineHeight:'40px' }}>{qty}</span>
              <button onClick={() => setQty(q => q + 1)} style={{ width:'40px', height:'40px', background:'none', border:'none', fontSize:'22px', cursor:'pointer', color:brandColor, fontWeight:'300' }}>+</button>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom:'20px' }}>
            <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>{t('noteRest')}</label>
            <textarea
              placeholder={t('notePh2')}
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'#F8F9FB', outline:'none', textAlign:'right', direction:'rtl', resize:'none' }}
            />
          </div>

          {/* اقتراحات مخصّصة لهذا الصنف — تُضاف مباشرة للسلة دون إغلاق هذه النافذة (نفس مقاس بطاقات "أكمل وجبتك") */}
          {companions.length > 0 && (
            <div style={{ marginBottom:'20px' }}>
              <div style={{ fontSize:'13.5px', fontWeight:'800', fontFamily:'Cairo,sans-serif', marginBottom:'10px' }}>{t('companionTitle')}</div>
              <div style={{ display:'flex', gap:'10px', overflowX:'auto', paddingBottom:'2px' }}>
                {companions.map(p => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => onAddCompanion(p)}
                    aria-label={`${t('addToCartB')}: ${(isEn && p.name_en) ? p.name_en : p.name}`}
                    style={{ width:'112px', flexShrink:0, display:'flex', flexDirection:'column', gap:'6px', border:'1.5px solid #E5E7EB', borderRadius:'14px', padding:'10px', background:'white', textAlign:'start' }}
                  >
                    <div style={{ width:'56px', height:'56px', borderRadius:'12px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px', overflow:'hidden' }}>
                      {p.image_url
                        ? <img loading="lazy" decoding="async" src={p.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                        : (p.emoji || '🍽️')}
                    </div>
                    <div style={{ fontSize:'12px', fontWeight:'700', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{(isEn && p.name_en) ? p.name_en : p.name}</div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'4px' }}>
                      <span style={{ fontSize:'11.5px', fontWeight:'800', color:brandColor }}>{p.price} ﷼</span>
                      <span style={{ width:'20px', height:'20px', borderRadius:'50%', background:brandColor, color:'white', fontSize:'14px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontWeight:'300' }}>+</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              const missingGroup = validateOptions()
              if (missingGroup) { toast.error(`${t('tPleaseChoose')}: ${missingGroup}`); return }
              const resolved = resolveOptions()
              onAdd(product, qty, note, resolved)
              onClose()
            }}
            style={{ width:'100%', padding:'16px', borderRadius:'14px', border:'none', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'16px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:`0 8px 24px ${brandColor}44` }}
          >
            <span>{submitLabel || t('addToCartB')}</span>
            <span style={{ background:'rgba(0,0,0,0.15)', padding:'4px 12px', borderRadius:'8px', fontSize:'14px' }}>
              {((product.price + resolveOptions().reduce((s,o)=>s+(o.price||0),0)) * qty).toFixed(2)} ﷼
            </span>
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}
