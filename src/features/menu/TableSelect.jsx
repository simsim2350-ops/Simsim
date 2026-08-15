import { useState } from 'react'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'

// قائمة اختيار رقم الطاولة (طلب داخل المطعم فقط) — Dropdown حقيقي وليس حقل نص:
// الزبون يختار من الطاولات المفعّلة التي عرّفها صاحب المطعم فقط، بلا كتابة يدوية.
// بحث داخلي يظهر تلقائياً لو تجاوز عدد الطاولات 30 (السلة نفسها منزلقة من الأسفل بنفس لغة تصميم المنيو).
export default function TableSelect({ tables, value, onChange, brandColor, t }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  useBodyScrollLock(open) // قفل إضافي (فوق قفل السلة) طول ما قائمة الطاولات مفتوحة

  const filtered = search.trim()
    ? tables.filter(tb => tb.table_number.toLowerCase().includes(search.trim().toLowerCase()))
    : tables

  const select = (tableNumber) => {
    onChange(tableNumber)
    setOpen(false)
    setSearch('')
  }

  return (
    <>
      <style>{`
        .simsim-table-trigger { background:white; color:#0B0B0F; border-color:#E5E7EB; }
        .simsim-table-sheet { background:white; color:#0B0B0F; }
        .simsim-table-search { background:white; color:#0B0B0F; border-color:#E5E7EB; }
        .simsim-table-row { color:#0B0B0F; border-color:#F3F4F6; }
        @media (prefers-color-scheme: dark) {
          .simsim-table-trigger { background:#1A1B22; color:#F3F4F6; border-color:#2E2F38; }
          .simsim-table-sheet { background:#1A1B22; color:#F3F4F6; }
          .simsim-table-search { background:#23252E; color:#F3F4F6; border-color:#2E2F38; }
          .simsim-table-row { color:#F3F4F6; border-color:#2E2F38; }
        }
      `}</style>

      <button
        type="button"
        className="simsim-table-trigger"
        onClick={() => setOpen(true)}
        style={{ width:'100%', padding:'11px 13px', border:'1.5px solid', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', display:'flex', alignItems:'center', justifyContent:'space-between', textAlign:'right' }}
      >
        <span style={{ color: value ? 'inherit' : '#9CA3AF' }}>{value || t('tablePh')}</span>
        <span style={{ fontSize:'12px', color:'#9CA3AF' }}>▾</span>
      </button>

      {open && (
        <div style={{ position:'fixed', inset:0, zIndex:110, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={() => setOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', animation:'fadeIn 0.2s ease' }}/>
          <div className="simsim-table-sheet" style={{ borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', maxHeight:'70vh', display:'flex', flexDirection:'column', animation:'slideUp 0.25s ease', position:'relative', overflow:'hidden' }}>
            <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'12px auto' }}/>
            <div style={{ padding:'0 18px 12px', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'16px', flexShrink:0 }}>{t('tableReq')}</div>

            {tables.length > 30 && (
              <div style={{ padding:'0 18px 12px', flexShrink:0 }}>
                <input
                  autoFocus
                  className="simsim-table-search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('tableSearchPh')}
                  style={{ width:'100%', padding:'10px 13px', border:'1.5px solid', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', outline:'none', textAlign:'right', boxSizing:'border-box' }}
                />
              </div>
            )}

            <div style={{ overflowY:'auto', padding:'0 10px 14px' }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px', color:'#9CA3AF', fontSize:'13px' }}>{t('tableNoResults')}</div>
              ) : filtered.map(tb => (
                <button
                  type="button"
                  key={tb.id}
                  className="simsim-table-row"
                  onClick={() => select(tb.table_number)}
                  style={{ width:'100%', textAlign:'right', padding:'13px 12px', borderRadius:'11px', border:'none', borderBottom:'1px solid', background: value === tb.table_number ? `${brandColor}14` : 'transparent', fontFamily:'Tajawal,sans-serif', fontSize:'14px', fontWeight: value === tb.table_number ? '800' : '500', display:'flex', alignItems:'center', justifyContent:'space-between' }}
                >
                  <span>🪑 {tb.table_number}</span>
                  {value === tb.table_number && <span style={{ color:brandColor }}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
