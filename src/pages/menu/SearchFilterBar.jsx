import { inputStyle } from './menuFormShared'

// شريط البحث + زر الفلاتر (يظهر فقط في تبويب الأصناف — الفلاتر خصائص أصناف).
export default function SearchFilterBar({ query, onQueryChange, placeholder, showFilterButton, activeFilterCount, onOpenFilters }) {
  return (
    <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', padding:'10px 16px', display:'flex', gap:'8px', flexShrink:0 }}>
      <div style={{ position:'relative', flex:1, minWidth:0 }}>
        <span style={{ position:'absolute', top:'50%', right:'13px', transform:'translateY(-50%)', fontSize:'14px', color:'#9CA3AF', pointerEvents:'none' }}>🔍</span>
        <input
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...inputStyle, marginTop:0, paddingRight:'34px' }}
          aria-label="بحث"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label="مسح البحث"
            style={{ position:'absolute', top:'50%', left:'10px', transform:'translateY(-50%)', width:'22px', height:'22px', border:'none', background:'#E5E7EB', borderRadius:'50%', color:'#374151', fontSize:'12px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
          >✕</button>
        )}
      </div>

      {showFilterButton && (
        <button
          type="button"
          onClick={onOpenFilters}
          aria-label="الفلاتر"
          style={{
            position:'relative', flexShrink:0, width:'44px', height:'44px', borderRadius:'11px',
            border: activeFilterCount > 0 ? '1.5px solid #FF6A00' : '1.5px solid #E5E7EB',
            background: activeFilterCount > 0 ? '#FFF0EB' : 'white',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:'17px', cursor:'pointer',
          }}
        >
          ⚙️
          {activeFilterCount > 0 && (
            <span style={{ position:'absolute', top:'-4px', left:'-4px', minWidth:'17px', height:'17px', padding:'0 4px', borderRadius:'100px', background:'#FF6A00', color:'white', fontSize:'10px', fontWeight:'800', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {activeFilterCount}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
