import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

// بطاقة تأكيد موحّدة داخل المنصّة — بديل عن window.confirm() الأصلي بلا هوية بصرية.
// تُستخدم لأي إجراء يحتاج تأكيداً قبل التنفيذ (حذف/استبدال/إلغاء...) في لوحة التحكم والمنيو العام معاً.
export default function ConfirmDialog({
  open, icon = '❓', title, body, confirmLabel, cancelLabel = 'إلغاء', danger = true, loading = false, onConfirm, onCancel,
}) {
  useBodyScrollLock(open) // يُستدعى دائماً (لا بعد return مبكر) احتراماً لقواعد الخطّافات
  if (!open) return null
  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      <div onClick={onCancel} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', animation:'fadeIn 0.15s ease' }}/>
      <div style={{ background:'white', borderRadius:'20px', width:'100%', maxWidth:'340px', padding:'22px', position:'relative', textAlign:'center' }}>
        <div style={{ fontSize:'34px', marginBottom:'10px' }}>{icon}</div>
        <div style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'16px', marginBottom: body ? '6px' : '20px' }}>{title}</div>
        {body && <div style={{ fontSize:'13px', color:'#6B7280', marginBottom:'20px', lineHeight:'1.6' }}>{body}</div>}
        <div style={{ display:'flex', gap:'10px' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{ flex:1, padding:'12px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', color:'#374151', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'13px', cursor:loading?'default':'pointer', opacity:loading?0.6:1 }}
          >{cancelLabel}</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{ flex:1, padding:'12px', borderRadius:'12px', border:'none', background: danger ? '#E11D48' : '#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'13px', cursor:loading?'default':'pointer', opacity:loading?0.7:1 }}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
