import ActionsMenu from './ActionsMenu'
import { getCalorieBadge } from './menuFormShared'

export default function ProductCard({ prod, onEdit, onToggleAvailability, onDelete }) {
  return (
    <div style={{ background:'white', borderRadius:'14px', border:'1.5px solid #E5E7EB', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
      <div style={{ width:'52px', height:'52px', borderRadius:'12px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px', flexShrink:0, border:'1px solid #E5E7EB', overflow:'hidden' }}>
        {prod.image_url
          ? <img src={prod.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : prod.emoji}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'3px' }}>
          <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'14px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>{prod.name}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap', marginBottom: prod.description ? '4px' : 0 }}>
          <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'14px', color:'#FF6A00' }}>{prod.price} ﷼</span>
          {prod.compare_price && <span style={{ fontSize:'12px', color:'#9CA3AF', textDecoration:'line-through' }}>{prod.compare_price} ﷼</span>}
          <button
            type="button"
            onClick={() => onToggleAvailability(prod)}
            style={{ padding:'2px 8px', borderRadius:'7px', border:'1.5px solid #E5E7EB', background: prod.is_available ? '#D1FAE5' : '#F3F4F6', color: prod.is_available ? '#065F46' : '#6B7280', fontSize:'10.5px', fontWeight:'700', cursor:'pointer', whiteSpace:'nowrap' }}
          >
            {prod.is_available ? '✅ متاح' : '🚫 مخفي'}
          </button>
        </div>
        {prod.description && <div style={{ fontSize:'12px', color:'#9CA3AF', marginBottom:'4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{prod.description}</div>}
        <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
          {prod.calories != null && prod.calories !== '' && <span style={{ fontSize:'11px', color:'#9CA3AF' }}>{getCalorieBadge(prod.calories)} {prod.calories} كالوري</span>}
          {prod.is_best_seller && <span style={{ fontSize:'10px', color:'#B45309', background:'#FEF3C7', padding:'2px 6px', borderRadius:'100px' }}>🔥 الأكثر مبيعًا</span>}
          {prod.is_featured && <span style={{ fontSize:'10px', color:'#1E5FBF', background:'#EAF3FF', padding:'2px 6px', borderRadius:'100px' }}>⭐ مختارات المطعم</span>}
        </div>
      </div>
      <ActionsMenu
        ariaLabel={`إجراءات صنف ${prod.name}`}
        items={[
          { key:'edit', label:'تعديل', icon:'✏️', onClick: () => onEdit(prod) },
          { key:'delete', label:'حذف', icon:'🗑️', danger:true, onClick: () => onDelete(prod) },
        ]}
      />
    </div>
  )
}
