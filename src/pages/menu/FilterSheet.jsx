import { useEffect, useState } from 'react'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { DEFAULT_PRODUCT_FILTERS } from './menuSearch'

// ورقة فلاتر الأصناف — لا تُطبَّق فوراً على الاختيار، فقط عند "تطبيق" (بلا وميض
// أثناء تجربة عدة خيارات)، مع "إعادة تعيين" للعودة للحالة الافتراضية.
export default function FilterSheet({ open, categories, filters, onApply, onClose }) {
  const [draft, setDraft] = useState(filters)
  useBodyScrollLock(open)

  useEffect(() => { if (open) setDraft(filters) }, [open, filters])

  if (!open) return null

  const chipStyle = (active) => ({
    padding:'9px 14px', borderRadius:'100px', border: active ? '1.5px solid #FF6A00' : '1.5px solid #E5E7EB',
    background: active ? '#FFF0EB' : 'white', color: active ? '#FF6A00' : '#374151',
    fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer', whiteSpace:'nowrap',
  })

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:210, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="فلترة الأصناف" style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', maxHeight:'85vh', display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding:'14px 20px 0', flexShrink:0 }}>
          <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'0 auto 16px' }}/>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
            <h3 style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'17px', margin:0 }}>فلترة الأصناف</h3>
            <button type="button" onClick={onClose} aria-label="إغلاق" style={{ width:'32px', height:'32px', borderRadius:'50%', border:'1.5px solid #E5E7EB', background:'white', fontSize:'14px', cursor:'pointer' }}>✕</button>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'0 20px 20px' }}>
          <div style={{ marginBottom:'18px' }}>
            <label style={{ display:'block', fontSize:'13px', fontWeight:'800', marginBottom:'8px' }}>القسم</label>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              <button type="button" style={chipStyle(draft.categoryId === 'all')} onClick={() => setDraft(d => ({ ...d, categoryId: 'all' }))}>الكل</button>
              {categories.map(cat => (
                <button key={cat.id} type="button" style={chipStyle(draft.categoryId === cat.id)} onClick={() => setDraft(d => ({ ...d, categoryId: cat.id }))}>{cat.emoji} {cat.name}</button>
              ))}
              <button type="button" style={chipStyle(draft.categoryId === 'none')} onClick={() => setDraft(d => ({ ...d, categoryId: 'none' }))}>📦 بدون قسم</button>
            </div>
          </div>

          <div style={{ marginBottom:'18px' }}>
            <label style={{ display:'block', fontSize:'13px', fontWeight:'800', marginBottom:'8px' }}>التوفر</label>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              <button type="button" style={chipStyle(draft.availability === 'all')} onClick={() => setDraft(d => ({ ...d, availability: 'all' }))}>الكل</button>
              <button type="button" style={chipStyle(draft.availability === 'available')} onClick={() => setDraft(d => ({ ...d, availability: 'available' }))}>✅ متاح</button>
              <button type="button" style={chipStyle(draft.availability === 'unavailable')} onClick={() => setDraft(d => ({ ...d, availability: 'unavailable' }))}>🚫 غير متاح</button>
            </div>
          </div>

          <div>
            <label style={{ display:'block', fontSize:'13px', fontWeight:'800', marginBottom:'8px' }}>إبراز خاص</label>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              <button type="button" style={chipStyle(draft.bestSeller)} onClick={() => setDraft(d => ({ ...d, bestSeller: !d.bestSeller }))}>🔥 الأكثر مبيعًا</button>
              <button type="button" style={chipStyle(draft.featured)} onClick={() => setDraft(d => ({ ...d, featured: !d.featured }))}>⭐ مختارات المطعم</button>
            </div>
          </div>
        </div>

        <div style={{ flexShrink:0, display:'flex', gap:'10px', padding:'14px 20px', paddingBottom:'calc(14px + env(safe-area-inset-bottom, 0px))', borderTop:'1px solid #F0F1F3' }}>
          <button type="button" onClick={() => setDraft(DEFAULT_PRODUCT_FILTERS)} style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer', color:'#6B7280' }}>إعادة تعيين</button>
          <button type="button" onClick={() => onApply(draft)} style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer' }}>تطبيق</button>
        </div>
      </div>
    </div>
  )
}
