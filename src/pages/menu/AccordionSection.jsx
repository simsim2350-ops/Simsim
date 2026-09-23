import { useState } from 'react'

// قسم قابل للطي داخل فورم الصنف — يفتح افتراضياً حسب defaultOpen، لكن يبقى قابلاً
// للطي/الفتح يدوياً بعدها. يُستخدم لتقليل الازدحام البصري بدون حذف أي حقل.
export default function AccordionSection({ title, icon, defaultOpen = false, badge, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom:'14px', border:'1.5px solid #E5E7EB', borderRadius:'14px', overflow:'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{ width:'100%', display:'flex', alignItems:'center', gap:'8px', padding:'13px 14px', border:'none', background:'#F8F9FB', cursor:'pointer', fontFamily:'Tajawal,sans-serif' }}
      >
        <span style={{ fontSize:'14px' }}>{icon}</span>
        <span style={{ flex:1, textAlign:'right', fontWeight:'800', fontSize:'13.5px', color:'#0B0B0F' }}>{title}</span>
        {badge != null && badge > 0 && (
          <span style={{ fontSize:'11px', color:'#FF6A00', background:'#FFF0EB', padding:'1px 8px', borderRadius:'100px', fontWeight:'700' }}>{badge}</span>
        )}
        <span style={{ fontSize:'11px', color:'#9CA3AF', transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.15s' }}>▼</span>
      </button>
      {open && (
        <div style={{ padding:'14px' }}>
          {children}
        </div>
      )}
    </div>
  )
}
