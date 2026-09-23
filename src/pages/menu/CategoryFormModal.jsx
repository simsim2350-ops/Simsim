import { useEffect, useState } from 'react'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { EMOJIS, inputStyle, inputErrorStyle, errorTextStyle } from './menuFormShared'

export default function CategoryFormModal({
  open, editingCat, catForm, setCatForm, onSave, onClose,
  uploadingCatImage, onImageUpload, onImageRemove,
}) {
  useBodyScrollLock(open)
  const [showEnglish, setShowEnglish] = useState(!!catForm.name_en)
  const [error, setError] = useState('')

  // كل مرة يُفتح فيها المودال (قسم جديد أو تعديل مختلف) — أعد ضبط حالة الطي/الأخطاء
  useEffect(() => {
    if (open) { setShowEnglish(!!catForm.name_en); setError('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingCat?.id])

  if (!open) return null

  const handleSave = () => {
    if (!catForm.name.trim()) { setError('اسم القسم مطلوب'); return }
    setError('')
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={editingCat ? 'تعديل القسم' : 'إضافة قسم جديد'} style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', maxHeight:'92vh', display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding:'20px 20px 0', flexShrink:0 }}>
          <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'0 auto 20px' }}/>
          <h3 style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'18px', marginBottom:'18px', textAlign:'center' }}>
            {editingCat ? 'تعديل القسم' : '📋 إضافة قسم جديد'}
          </h3>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'0 20px 20px' }}>
          <div style={{ marginBottom:'14px' }}>
            <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>صورة غلاف القسم (اختياري)</label>
            <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
              <div style={{ width:'64px', height:'64px', borderRadius:'12px', background:'#F8F9FB', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px', overflow:'hidden', flexShrink:0 }}>
                {catForm.cover_url
                  ? <img src={catForm.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  : catForm.emoji}
              </div>
              <label style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'9px 14px', borderRadius:'10px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer', color:'#374151' }}>
                {uploadingCatImage ? 'جارٍ الرفع...' : '📷 رفع صورة'}
                <input type="file" accept="image/*" onChange={onImageUpload} disabled={uploadingCatImage} style={{ display:'none' }} />
              </label>
              {catForm.cover_url && (
                <button type="button" onClick={onImageRemove} style={{ padding:'9px 12px', borderRadius:'10px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', color:'#EF4444', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>حذف</button>
              )}
            </div>
          </div>

          <div style={{ marginBottom:'14px' }}>
            <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>أيقونة القسم (تظهر إن لم توجد صورة)</label>
            <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
              {EMOJIS.map(e => (
                <div key={e} onClick={() => setCatForm(f=>({...f,emoji:e}))} style={{ width:'36px', height:'36px', borderRadius:'9px', border:`2px solid ${catForm.emoji===e?'#FF6A00':'#E5E7EB'}`, background: catForm.emoji===e?'#FFF0EB':'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', cursor:'pointer', transition:'all 0.15s' }}>
                  {e}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:'14px' }}>
            <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>اسم القسم *</label>
            <input
              style={error ? inputErrorStyle : inputStyle}
              placeholder="مثال: البرغر، المشروبات..."
              value={catForm.name}
              onChange={e => { setCatForm(f=>({...f,name:e.target.value})); if (error) setError('') }}
              autoFocus
            />
            {error && <div style={errorTextStyle}>{error}</div>}
          </div>

          {showEnglish ? (
            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px', color:'#6B7280' }}>🇬🇧 اسم القسم (إنجليزي) <span style={{ fontWeight:'400', fontSize:'11px' }}>— اختياري</span></label>
              <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} placeholder="e.g. Burgers, Drinks..." value={catForm.name_en} onChange={e => setCatForm(f=>({...f,name_en:e.target.value}))} />
            </div>
          ) : (
            <button type="button" onClick={() => setShowEnglish(true)} style={{ marginBottom:'14px', padding:'9px 4px', border:'none', background:'transparent', color:'#FF6A00', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}>
              + إضافة ترجمة إنجليزية
            </button>
          )}

          <label style={{ display:'flex', alignItems:'center', gap:'10px', cursor:'pointer' }}>
            <input type="checkbox" checked={catForm.is_visible} onChange={e => setCatForm(f=>({...f,is_visible:e.target.checked}))} style={{ width:'18px', height:'18px', accentColor:'#FF6A00' }}/>
            <span style={{ fontSize:'14px', fontWeight:'600' }}>إظهار القسم في المنيو</span>
          </label>
        </div>

        <div style={{ flexShrink:0, display:'flex', gap:'10px', padding:'14px 20px', paddingBottom:'calc(14px + env(safe-area-inset-bottom, 0px))', borderTop:'1px solid #F0F1F3', background:'white' }}>
          <button type="button" onClick={onClose} style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'600', fontSize:'14px', cursor:'pointer', color:'#6B7280' }}>إلغاء</button>
          <button type="button" onClick={handleSave} style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer' }}>
            💾 {editingCat ? 'تحديث القسم' : 'إضافة القسم'}
          </button>
        </div>
      </div>
    </div>
  )
}
