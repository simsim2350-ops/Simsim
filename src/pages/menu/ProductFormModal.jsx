import { useEffect, useState } from 'react'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { EMOJIS, inputStyle, inputErrorStyle, errorTextStyle } from './menuFormShared'
import AccordionSection from './AccordionSection'

// ملاحظة: تُركَّب هذه المكوّنة بـ key={editingProd?.id || 'new'} من الصفحة الأم،
// فتُعاد تهيئة الأقسام القابلة للطي (defaultOpen) تلقائياً عند فتح صنف مختلف أو
// التبديل بين "إضافة"/"تعديل". أما إعادة فتح نفس الصنف بعد إغلاقه (بلا تغيّر
// key) فتُغطّى بالأسفل عبر useEffect على `open` — لمنع بقاء أخطاء/طيّ قديمة.
export default function ProductFormModal({
  open, editingProd, prodForm, setProdForm, categories, onSave, onClose,
  uploadingProdImage, onImageUpload, onImageRemove,
  addOptionGroup, removeOptionGroup, updateOptionGroup, addChoice, removeChoice, updateChoice,
  recommendations, recSearch, setRecSearch, recSearchResults, addRec, removeRec, moveRec,
}) {
  useBodyScrollLock(open)
  const [showEnglish, setShowEnglish] = useState(!!(prodForm.name_en || prodForm.description_en))
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (open) { setShowEnglish(!!(prodForm.name_en || prodForm.description_en)); setErrors({}) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingProd?.id])

  if (!open) return null

  const price = parseFloat(prodForm.price)
  const comparePrice = prodForm.compare_price ? parseFloat(prodForm.compare_price) : null
  const hasDiscountPreview = comparePrice != null && !Number.isNaN(comparePrice) && !Number.isNaN(price) && comparePrice > price

  const clearError = (field) => setErrors(e => (e[field] ? { ...e, [field]: undefined } : e))

  const handleSave = () => {
    const next = {}
    if (!prodForm.name.trim()) next.name = 'اسم الصنف مطلوب'
    if (!prodForm.price) next.price = 'السعر مطلوب'
    else if (Number.isNaN(parseFloat(prodForm.price)) || parseFloat(prodForm.price) <= 0) next.price = 'أدخل سعراً صحيحاً أكبر من صفر'
    if (categories.length > 0 && !prodForm.category_id) next.category_id = 'اختر القسم'
    if (prodForm.compare_price) {
      const cp = parseFloat(prodForm.compare_price)
      if (Number.isNaN(cp) || cp <= 0) next.compare_price = 'أدخل سعراً صحيحاً أكبر من صفر'
      else if (!Number.isNaN(price) && cp <= price) next.compare_price = 'يجب أن يكون أكبر من السعر الحالي'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onSave()
  }

  const salesBadge = (prodForm.is_featured ? 1 : 0) + (prodForm.is_best_seller ? 1 : 0) + (prodForm.options?.length || 0)
  const extraOpen = !!(prodForm.compare_price || prodForm.calories)
  const salesOpen = !!(prodForm.is_featured || prodForm.is_best_seller || (prodForm.options && prodForm.options.length > 0))

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={editingProd ? 'تعديل الصنف' : 'إضافة صنف جديد'} style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', maxHeight:'92vh', display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding:'20px 20px 0', flexShrink:0 }}>
          <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'0 auto 20px' }}/>
          <h3 style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'18px', marginBottom:'18px', textAlign:'center' }}>
            {editingProd ? 'تعديل الصنف' : '🍽️ إضافة صنف جديد'}
          </h3>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'0 20px 20px' }}>

          {/* ===== القسم 1: المعلومات الأساسية — مفتوح دائماً ===== */}
          <AccordionSection title="المعلومات الأساسية" icon="📝" defaultOpen>
            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>صورة الصنف (اختياري)</label>
              <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                <div style={{ width:'64px', height:'64px', borderRadius:'12px', background:'#F8F9FB', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px', overflow:'hidden', flexShrink:0 }}>
                  {prodForm.image_url
                    ? <img src={prodForm.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : prodForm.emoji}
                </div>
                <label style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'9px 14px', borderRadius:'10px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer', color:'#374151' }}>
                  {uploadingProdImage ? 'جارٍ الرفع...' : '📷 رفع صورة'}
                  <input type="file" accept="image/*" onChange={onImageUpload} disabled={uploadingProdImage} style={{ display:'none' }} />
                </label>
                {prodForm.image_url && (
                  <button type="button" onClick={onImageRemove} style={{ padding:'9px 12px', borderRadius:'10px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', color:'#EF4444', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>حذف</button>
                )}
              </div>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>أيقونة الصنف (تظهر إن لم توجد صورة)</label>
              <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
                {EMOJIS.map(e => (
                  <div key={e} onClick={() => setProdForm(f=>({...f,emoji:e}))} style={{ width:'36px', height:'36px', borderRadius:'9px', border:`2px solid ${prodForm.emoji===e?'#FF6A00':'#E5E7EB'}`, background: prodForm.emoji===e?'#FFF0EB':'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', cursor:'pointer', transition:'all 0.15s' }}>
                    {e}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>اسم الصنف *</label>
              <input
                style={errors.name ? inputErrorStyle : inputStyle}
                placeholder="مثال: برغر كلاسيك"
                value={prodForm.name}
                onChange={e => { setProdForm(f=>({...f,name:e.target.value})); clearError('name') }}
                autoFocus
              />
              {errors.name && <div style={errorTextStyle}>{errors.name}</div>}
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>الوصف</label>
              <textarea style={{ ...inputStyle, minHeight:'72px', resize:'vertical' }} placeholder="وصف شهي يجذب العملاء..." value={prodForm.description} onChange={e => setProdForm(f=>({...f,description:e.target.value}))} />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:'12px', marginBottom: hasDiscountPreview ? '8px' : '14px' }}>
              <div>
                <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>السعر الحالي *</label>
                <input
                  style={{ ...(errors.price ? inputErrorStyle : inputStyle), direction:'ltr', textAlign:'left' }}
                  type="number" min="0" step="0.5" placeholder="0.00"
                  value={prodForm.price}
                  onChange={e => { setProdForm(f=>({...f,price:e.target.value})); clearError('price') }}
                />
                {errors.price && <div style={errorTextStyle}>{errors.price}</div>}
              </div>
            </div>

            {hasDiscountPreview && (
              <div style={{ marginBottom:'14px', fontSize:'13px', fontWeight:'700', color:'#059669' }}>
                معاينة السعر: <span style={{ textDecoration:'line-through', color:'#9CA3AF', fontWeight:'600' }}>{comparePrice} ﷼</span> ← <span>{price} ﷼</span>
              </div>
            )}

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>القسم {categories.length > 0 ? '*' : ''}</label>
              <select
                style={{ ...(errors.category_id ? inputErrorStyle : inputStyle), cursor:'pointer' }}
                value={prodForm.category_id}
                onChange={e => { setProdForm(f=>({...f,category_id:e.target.value})); clearError('category_id') }}
                disabled={categories.length === 0}
              >
                <option value="">{categories.length === 0 ? 'أضف قسمًا أولاً' : 'اختر القسم'}</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.emoji} {cat.name}</option>
                ))}
              </select>
              {errors.category_id && <div style={errorTextStyle}>{errors.category_id}</div>}
              {categories.length === 0 && <div style={{ fontSize:'12px', color:'#9CA3AF', marginTop:'5px' }}>لا توجد أقسام بعد — أضف قسماً من تبويب «الأقسام» أولاً</div>}
            </div>
          </AccordionSection>

          {/* ===== القسم 2: خيارات البيع ===== */}
          <AccordionSection title="خيارات البيع" icon="🏷️" defaultOpen={salesOpen} badge={salesBadge}>
            <div style={{ display:'flex', gap:'12px 20px', marginBottom:'18px', flexWrap:'wrap' }}>
              <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}>
                <input type="checkbox" checked={prodForm.is_available} onChange={e => setProdForm(f=>({...f,is_available:e.target.checked}))} style={{ width:'17px', height:'17px', accentColor:'#FF6A00' }}/>
                <span style={{ fontSize:'13px', fontWeight:'600' }}>✅ متاح للطلب</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}>
                <input type="checkbox" checked={prodForm.is_featured} onChange={e => setProdForm(f=>({...f,is_featured:e.target.checked}))} style={{ width:'17px', height:'17px', accentColor:'#1E5FBF' }}/>
                <span style={{ fontSize:'13px', fontWeight:'600' }}>⭐ مختارات المطعم</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}>
                <input type="checkbox" checked={prodForm.is_best_seller} onChange={e => setProdForm(f=>({...f,is_best_seller:e.target.checked}))} style={{ width:'17px', height:'17px', accentColor:'#F59E0B' }}/>
                <span style={{ fontSize:'13px', fontWeight:'600' }}>🔥 الأكثر مبيعًا</span>
              </label>
            </div>

            {/* ===== خيارات الصنف (الحجم / الإضافات) ===== */}
            <div style={{ border:'1.5px solid #E5E7EB', borderRadius:'14px', overflow:'hidden' }}>
              <div style={{ padding:'12px 14px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:'13px', fontWeight:'800' }}>🧩 خيارات الصنف (الحجم، الإضافات...)</span>
                <button type="button" onClick={addOptionGroup} style={{ padding:'5px 10px', borderRadius:'8px', border:'1.5px solid #FF6A00', background:'white', color:'#FF6A00', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'11px', cursor:'pointer' }}>
                  ＋ مجموعة
                </button>
              </div>

              {(prodForm.options || []).length === 0 ? (
                <div style={{ padding:'16px', textAlign:'center', fontSize:'12px', color:'#9CA3AF' }}>
                  لا توجد خيارات — مفيدة لو الصنف له أحجام أو إضافات (مثل: الحجم، الإضافات)
                </div>
              ) : (
                <div style={{ padding:'12px', display:'flex', flexDirection:'column', gap:'12px' }}>
                  {prodForm.options.map((group, gi) => (
                    <div key={gi} style={{ border:'1.5px solid #E5E7EB', borderRadius:'12px', padding:'10px', background:'white' }}>
                      <div style={{ display:'flex', gap:'8px', marginBottom:'8px', alignItems:'center' }}>
                        <input
                          placeholder="اسم المجموعة (مثال: الحجم)"
                          value={group.name}
                          onChange={e => updateOptionGroup(gi, 'name', e.target.value)}
                          style={{ flex:1, padding:'8px 10px', border:'1.5px solid #E5E7EB', borderRadius:'9px', fontFamily:'Tajawal,sans-serif', fontSize:'13px', outline:'none', textAlign:'right' }}
                        />
                        <button type="button" onClick={() => removeOptionGroup(gi)} style={{ width:'30px', height:'30px', flexShrink:0, borderRadius:'8px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'13px' }}>🗑️</button>
                      </div>

                      <div style={{ display:'flex', gap:'14px', marginBottom:'10px', flexWrap:'wrap' }}>
                        <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'12px' }}>
                          <input
                            type="radio"
                            name={`group-type-${gi}`}
                            checked={group.type !== 'multiple'}
                            onChange={() => updateOptionGroup(gi, 'type', 'single')}
                            style={{ accentColor:'#FF6A00' }}
                          />
                          اختيار واحد
                        </label>
                        <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'12px' }}>
                          <input
                            type="radio"
                            name={`group-type-${gi}`}
                            checked={group.type === 'multiple'}
                            onChange={() => updateOptionGroup(gi, 'type', 'multiple')}
                            style={{ accentColor:'#FF6A00' }}
                          />
                          اختيار متعدد
                        </label>
                        <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'12px' }}>
                          <input
                            type="checkbox"
                            checked={!!group.required}
                            onChange={e => updateOptionGroup(gi, 'required', e.target.checked)}
                            style={{ accentColor:'#FF6A00' }}
                          />
                          إجباري
                        </label>
                      </div>

                      <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                        {group.choices.map((choice, ci) => (
                          <div key={ci} style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                            <input
                              placeholder="اسم الخيار"
                              value={choice.name}
                              onChange={e => updateChoice(gi, ci, 'name', e.target.value)}
                              style={{ flex:2, padding:'7px 9px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontFamily:'Tajawal,sans-serif', fontSize:'12px', outline:'none', textAlign:'right' }}
                            />
                            <input
                              type="number"
                              step="0.5"
                              placeholder="+0"
                              value={choice.price}
                              onChange={e => updateChoice(gi, ci, 'price', e.target.value)}
                              style={{ flex:1, padding:'7px 9px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontFamily:'Tajawal,sans-serif', fontSize:'12px', outline:'none', direction:'ltr', textAlign:'left' }}
                            />
                            <button type="button" onClick={() => removeChoice(gi, ci)} style={{ width:'26px', height:'26px', flexShrink:0, borderRadius:'7px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'11px' }}>✕</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => addChoice(gi)} style={{ marginTop:'4px', padding:'6px', borderRadius:'8px', border:'1.5px dashed #E5E7EB', background:'transparent', color:'#9CA3AF', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'11px', cursor:'pointer' }}>
                          ＋ إضافة خيار
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AccordionSection>

          {/* ===== القسم 3: معلومات إضافية ===== */}
          <AccordionSection title="معلومات إضافية" icon="ℹ️" defaultOpen={extraOpen}>
            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>السعر قبل الخصم <span style={{ fontWeight:'400', fontSize:'11px', color:'#9CA3AF' }}>— اختياري</span></label>
              <input
                style={{ ...(errors.compare_price ? inputErrorStyle : inputStyle), direction:'ltr', textAlign:'left' }}
                type="number" min="0" step="0.5" placeholder="0.00"
                value={prodForm.compare_price}
                onChange={e => { setProdForm(f=>({...f,compare_price:e.target.value})); clearError('compare_price') }}
              />
              {errors.compare_price && <div style={errorTextStyle}>{errors.compare_price}</div>}
            </div>

            <div>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>🔥 السعرات الحرارية (اختياري)</label>
              <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} type="number" min="0" step="1" placeholder="مثال: 450" value={prodForm.calories} onChange={e => setProdForm(f=>({...f,calories:e.target.value}))} />
            </div>
          </AccordionSection>

          {/* ===== القسم 4: الترجمة — مطوي افتراضياً إلا لو فيه بيانات محفوظة ===== */}
          <AccordionSection title="الترجمة" icon="🌐" defaultOpen={showEnglish}>
            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px', color:'#6B7280' }}>🇬🇧 اسم الصنف (إنجليزي) <span style={{ fontWeight:'400', fontSize:'11px' }}>— اختياري</span></label>
              <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} placeholder="e.g. Classic Burger" value={prodForm.name_en} onChange={e => setProdForm(f=>({...f,name_en:e.target.value}))} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px', color:'#6B7280' }}>🇬🇧 الوصف (إنجليزي) <span style={{ fontWeight:'400', fontSize:'11px' }}>— اختياري</span></label>
              <textarea style={{ ...inputStyle, minHeight:'72px', resize:'vertical', direction:'ltr', textAlign:'left' }} placeholder="Appetizing description..." value={prodForm.description_en} onChange={e => setProdForm(f=>({...f,description_en:e.target.value}))} />
            </div>
          </AccordionSection>

          {/* محرك الاقتراحات الذكي — يظهر فقط لصنف محفوظ فعلاً (يحتاج معرّفاً) */}
          {editingProd && (
            <AccordionSection title="اقتراح مع هذا الصنف" icon="🔗" defaultOpen={recommendations.length > 0} badge={recommendations.length}>
              <div style={{ fontSize:'12px', color:'#9CA3AF', marginBottom:'10px', lineHeight:'1.5' }}>
                تظهر هذه الأصناف في السلة عند إضافة الزبون لـ«{editingProd.name}»
              </div>

              {recommendations.length > 0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'10px' }}>
                  {recommendations.map((rec, i) => (
                    <div key={rec.id} style={{ display:'flex', alignItems:'center', gap:'8px', border:'1.5px solid #E5E7EB', borderRadius:'10px', padding:'7px 10px', background:'white' }}>
                      <div style={{ display:'flex', flexDirection:'column', gap:'0', flexShrink:0 }}>
                        <button type="button" onClick={() => moveRec(rec, 'up')} disabled={i === 0} style={{ width:'18px', height:'14px', border:'none', background:'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#E5E7EB' : '#6B7280', fontSize:'9px' }}>▲</button>
                        <button type="button" onClick={() => moveRec(rec, 'down')} disabled={i === recommendations.length - 1} style={{ width:'18px', height:'14px', border:'none', background:'none', cursor: i === recommendations.length - 1 ? 'default' : 'pointer', color: i === recommendations.length - 1 ? '#E5E7EB' : '#6B7280', fontSize:'9px' }}>▼</button>
                      </div>
                      <span style={{ fontSize:'16px', flexShrink:0 }}>{rec.recommended?.emoji || '🍽️'}</span>
                      <span style={{ flex:1, fontSize:'13px', fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{rec.recommended?.name}</span>
                      <span style={{ fontSize:'12px', color:'#9CA3AF', flexShrink:0 }}>{rec.recommended?.price} ﷼</span>
                      <button type="button" onClick={() => removeRec(rec)} style={{ width:'24px', height:'24px', flexShrink:0, borderRadius:'7px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'11px' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ position:'relative' }}>
                <input
                  value={recSearch}
                  onChange={e => setRecSearch(e.target.value)}
                  placeholder="ابحث عن صنف لإضافته كاقتراح..."
                  style={{ ...inputStyle, marginTop:0 }}
                />
                {recSearchResults.length > 0 && (
                  <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, left:0, background:'white', border:'1.5px solid #E5E7EB', borderRadius:'10px', boxShadow:'0 8px 20px rgba(0,0,0,0.08)', zIndex:10, overflow:'hidden' }}>
                    {recSearchResults.map(p => (
                      <div key={p.id} onClick={() => addRec(p)} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid #F3F4F6' }}>
                        <span style={{ fontSize:'15px' }}>{p.emoji || '🍽️'}</span>
                        <span style={{ flex:1, fontSize:'13px' }}>{p.name}</span>
                        <span style={{ fontSize:'12px', color:'#9CA3AF' }}>{p.price} ﷼</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </AccordionSection>
          )}
        </div>

        <div style={{ flexShrink:0, display:'flex', gap:'10px', padding:'14px 20px', paddingBottom:'calc(14px + env(safe-area-inset-bottom, 0px))', borderTop:'1px solid #F0F1F3', background:'white' }}>
          <button type="button" onClick={onClose} style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'600', fontSize:'14px', cursor:'pointer', color:'#6B7280' }}>إلغاء</button>
          <button type="button" onClick={handleSave} style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer' }}>
            💾 {editingProd ? 'تحديث الصنف' : 'إضافة الصنف'}
          </button>
        </div>
      </div>
    </div>
  )
}
