import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// يلف أي بطاقة (قسم أو صنف) ليصبح قابلاً للسحب والإفلات، مع مقبض سحب صريح
// (أأمن من سحب البطاقة كلها لأنها فيها أزرار أخرى — الضغط العادي لا يحرّك الترتيب).
export default function SortableCard({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  }
  return (
    <div ref={setNodeRef} style={{ ...style, display:'flex', alignItems:'center', gap:'4px' }}>
      <div {...attributes} {...listeners} aria-label="سحب لإعادة الترتيب" style={{ cursor:'grab', padding:'8px 4px', color:'#D1D5DB', fontSize:'18px', flexShrink:0, touchAction:'none' }}>
        ⠿
      </div>
      <div style={{ flex:1, minWidth:0 }}>{children}</div>
    </div>
  )
}
