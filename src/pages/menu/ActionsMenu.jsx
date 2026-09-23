import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// قائمة إجراءات "⋮" موحّدة لبطاقات الأقسام/الأصناف — تُغلق تلقائياً عند الضغط
// خارجها أو بعد اختيار إجراء. items: [{ key, label, icon, danger, onClick }]
export default function ActionsMenu({ items, ariaLabel = 'المزيد من الإجراءات' }) {
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const ref = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // يقلب اتجاه القائمة للأعلى إن لم تكفِ المساحة أسفل الزر (بطاقة قرب أسفل الشاشة) —
  // بدلاً من الخروج جزئياً خارج الشاشة ويتطلّب تمريراً لرؤية بقية الخيارات.
  useLayoutEffect(() => {
    if (!open || !menuRef.current) return
    const menuRect = menuRef.current.getBoundingClientRect()
    setOpenUpward(menuRect.bottom > window.innerHeight)
  }, [open])

  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        style={{ width:'40px', height:'40px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'8px', border:'1.5px solid #E5E7EB', background:'white', cursor:'pointer', fontSize:'17px', color:'#374151', lineHeight:1 }}
      >⋮</button>
      {open && (
        <div ref={menuRef} role="menu" style={{ position:'absolute', ...(openUpward ? { bottom:'calc(100% + 4px)' } : { top:'calc(100% + 4px)' }), left:0, minWidth:'160px', background:'white', border:'1.5px solid #E5E7EB', borderRadius:'12px', boxShadow:'0 10px 24px rgba(0,0,0,0.12)', zIndex:20, overflow:'hidden' }}>
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); item.onClick() }}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:'8px', padding:'11px 14px', border:'none', borderBottom: i < items.length - 1 ? '1px solid #F3F4F6' : 'none', background:'white', color: item.danger ? '#E11D48' : '#374151', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'13px', textAlign:'right', cursor:'pointer' }}
            >
              <span style={{ fontSize:'14px' }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
