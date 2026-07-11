import { useState } from 'react'

// ============================================================
// مكوّن Accordion مشترك قابل لإعادة الاستخدام في أي قسم كثيف الإعدادات.
// يعرض عنوان القسم ووصفاً مختصراً، وتظهر التفاصيل عند الفتح — لتقليل الضوضاء البصرية.
// يدعم مفتاح إظهار/إخفاء اختياري في رأس كل عنصر (لدمج «هل يظهر» مع «ماذا يظهر»).
// ============================================================

// حاوية Accordion — بطاقة بيضاء بعنوان علوي اختياري
export function Accordion({ icon, title, children }) {
  return (
    <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
      {title && (
        <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>
          {icon ? `${icon} ` : ''}{title}
        </div>
      )}
      <div>{children}</div>
    </div>
  )
}

// عنصر واحد داخل الـ Accordion.
// props:
//   title       : عنوان القسم
//   desc        : وصف مختصر يظهر تحت العنوان
//   toggle      : { checked, onChange } — مفتاح إظهار/إخفاء اختياري في الرأس
//   expandable  : هل للعنصر محتوى قابل للفتح؟ (false = صفّ مفتاح فقط بلا تفاصيل)
//   defaultOpen : يبدأ مفتوحاً؟
//   last        : آخر عنصر (بلا خط سفلي)
//   children    : محتوى التفاصيل
export function AccordionItem({ title, desc, toggle, expandable = true, defaultOpen = false, last = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid #F3F4F6' }}>
      <div
        onClick={expandable ? () => setOpen(o => !o) : undefined}
        style={{ display:'flex', alignItems:'center', gap:'11px', padding:'13px 16px', cursor: expandable ? 'pointer' : 'default' }}
      >
        {expandable && (
          <span style={{ flexShrink:0, width:'18px', height:'18px', borderRadius:'6px', background:'#F3F4F6', color:'#6B7280', fontSize:'13px', fontWeight:'800', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>
            {open ? '−' : '+'}
          </span>
        )}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'13.5px', fontWeight:'700', color:'#0F1117' }}>{title}</div>
          {desc && <div style={{ fontSize:'11.5px', color:'#9CA3AF', marginTop:'2px', lineHeight:'1.4' }}>{desc}</div>}
        </div>
        {toggle && (
          <label onClick={e => e.stopPropagation()} style={{ position:'relative', width:'42px', height:'23px', cursor:'pointer', flexShrink:0 }}>
            <input type="checkbox" checked={toggle.checked} onChange={toggle.onChange} style={{ opacity:0, width:0, height:0, position:'absolute' }} />
            <div style={{ position:'absolute', inset:0, background: toggle.checked ? '#10B981' : '#E5E7EB', borderRadius:'23px', transition:'0.3s' }}>
              <div style={{ position:'absolute', width:'17px', height:'17px', background:'white', borderRadius:'50%', top:'3px', left: toggle.checked ? '22px' : '3px', transition:'0.3s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
            </div>
          </label>
        )}
      </div>
      {expandable && open && (
        <div style={{ padding:'2px 16px 16px' }}>{children}</div>
      )}
    </div>
  )
}

export default Accordion
