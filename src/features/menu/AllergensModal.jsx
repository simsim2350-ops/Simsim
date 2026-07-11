import ErrBoundary from './ErrBoundary'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'

// مودال مسبّبات الحساسية — بياناته data-driven من restaurant.allergens (نص أو كائن {label, icon, label_en})
export default function AllergensModal({ restaurant, isEn, t, onClose }) {
  useBodyScrollLock() // قفل تمرير الصفحة الخلفية طول ما المودال مفتوح
  return (
    <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={onClose}>
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)' }}/>
      <div onClick={e => e.stopPropagation()} style={{ position:'relative', background:'white', width:'100%', maxWidth:'480px', borderRadius:'24px 24px 0 0', padding:'20px', maxHeight:'75vh', overflowY:'auto', animation:'slideUp 0.25s ease' }}>
        <ErrBoundary>
        <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'0 auto 16px' }}/>
        <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'17px', marginBottom:'6px', textAlign:'center' }}>⚠️ {t('allergens')}</h3>
        <p style={{ fontSize:'12px', color:'#9CA3AF', textAlign:'center', marginBottom:'18px', lineHeight:'1.6' }}>
          {t('allergensDesc')}
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {(Array.isArray(restaurant.allergens) ? restaurant.allergens : [])
            .map((a, i) => {
              // تحصين: تجاهل القيم الفارغة، ودعم النص أو الكائن
              if (a == null) return null
              const item = typeof a === 'string' ? { label: a, icon: '⚠️' } : (a || {})
              const label = item.label || item.name || (typeof a === 'string' ? a : '')
              if (!label) return null
              const shown = (isEn && item.label_en) ? item.label_en : label
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', background:'#F8F9FB', borderRadius:'12px' }}>
                  <span style={{ fontSize:'18px' }}>{item.icon || '⚠️'}</span>
                  <span style={{ fontSize:'13px', fontWeight:'600' }}>{shown}</span>
                </div>
              )
            })}
        </div>
        <button
          onClick={onClose}
          style={{ width:'100%', marginTop:'18px', padding:'13px', borderRadius:'12px', border:'none', background:'#F3F4F6', color:'#374151', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer' }}
        >
          {t('close')}
        </button>
        </ErrBoundary>
      </div>
    </div>
  )
}
