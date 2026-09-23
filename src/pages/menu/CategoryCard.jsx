import ActionsMenu from './ActionsMenu'

export default function CategoryCard({ cat, itemCount, onEdit, onToggleVisibility, onDelete }) {
  return (
    <div style={{ background:'white', borderRadius:'14px', border:'1.5px solid #E5E7EB', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
      <div style={{ width:'44px', height:'44px', borderRadius:'12px', background:'#FFF0EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px', flexShrink:0, overflow:'hidden' }}>
        {cat.cover_url
          ? <img src={cat.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : cat.emoji}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'3px' }}>
          <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'15px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cat.name}</span>
          {!cat.is_visible && (
            <span style={{ fontSize:'10px', color:'#6B7280', background:'#F3F4F6', padding:'2px 7px', borderRadius:'100px', flexShrink:0, fontWeight:'700' }}>🚫 مخفي</span>
          )}
        </div>
        <div style={{ fontSize:'12px', color:'#9CA3AF' }}>
          {itemCount} صنف
        </div>
      </div>
      <ActionsMenu
        ariaLabel={`إجراءات قسم ${cat.name}`}
        items={[
          { key:'edit', label:'تعديل', icon:'✏️', onClick: () => onEdit(cat) },
          { key:'visibility', label: cat.is_visible ? 'إخفاء' : 'إظهار', icon: cat.is_visible ? '🚫' : '👁️', onClick: () => onToggleVisibility(cat) },
          { key:'delete', label:'حذف', icon:'🗑️', danger:true, onClick: () => onDelete(cat) },
        ]}
      />
    </div>
  )
}
