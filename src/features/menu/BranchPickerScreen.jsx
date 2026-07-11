import { computeOpenStatus } from './helpers'

// شاشة "اختر فرعك" — تظهر لو فيه فروع نشطة ولم يُحدَّد فرع في الرابط
export default function BranchPickerScreen({ restaurant, branchList, brandColor, isEn, t, onChoose }) {
  // بطاقة فرع واحدة (تُستخدم للفرع الرئيسي وباقي الفروع)
  const BranchCard = ({ name, address, mapsUrl, hours, onPick, isMain }) => {
    const st = computeOpenStatus(hours)
    const c = st.open ? '#10B981' : '#EF4444'
    const bg = st.open ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'
    return (
      <div
        onClick={onPick}
        style={{ background:'white', borderRadius:'16px', border:'1.5px solid #E5E7EB', padding:'16px', cursor:'pointer', transition:'all 0.15s', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{ width:'46px', height:'46px', borderRadius:'12px', background:`${brandColor}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px', flexShrink:0 }}>
            {isMain ? '🏠' : '🏢'}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', color:'#0F1117', marginBottom:'3px' }}>{name}</div>
            {address && <div style={{ fontSize:'12px', color:'#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>📍 {address}</div>}
          </div>
          <span style={{ fontSize:'20px', color:'#D1D5DB', flexShrink:0 }}>‹</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginTop:'10px', flexWrap:'wrap' }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'11px', fontWeight:'700', color:c, background:bg, padding:'3px 9px', borderRadius:'100px' }}>
            <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:c, display:'inline-block' }}/>
            {st.open ? t('openNow') : t('closedNow')}
          </span>
          {!st.open && st.nextText && <span style={{ fontSize:'11px', color:'#EF4444' }}>{st.nextText}</span>}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ fontSize:'11px', fontWeight:'700', color:brandColor, background:`${brandColor}14`, padding:'3px 9px', borderRadius:'100px', textDecoration:'none' }}
            >
              {t('mapBtn')}
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', background:'#F8F9FB', direction:'rtl', fontFamily:'Tajawal,sans-serif', maxWidth:'480px', margin:'0 auto', position:'relative', boxShadow:'0 0 60px rgba(15,17,23,0.12)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} * { box-sizing: border-box; } @media(min-width:600px){body{background:#E9ECF2}}`}</style>

      {/* Header */}
      <div style={{ background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, padding:'28px 20px 22px', textAlign:'center', color:'white' }}>
        <div style={{ width:'64px', height:'64px', borderRadius:'16px', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'30px', margin:'0 auto 12px', overflow:'hidden' }}>
          {restaurant.logo_url
            ? <img src={restaurant.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : '🍕'}
        </div>
        <h1 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', marginBottom:'4px' }}>{restaurant.name}</h1>
        <p style={{ fontSize:'13px', opacity:0.9 }}>{t('pickBranch')}</p>
      </div>

      {/* Branch list */}
      <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:'12px', maxWidth:'520px', margin:'0 auto' }}>
        {/* الفرع الرئيسي (المطعم نفسه) */}
        <BranchCard
          isMain
          name="الفرع الرئيسي"
          address={restaurant.address}
          mapsUrl={restaurant.maps_url}
          hours={restaurant.opening_hours}
          onPick={() => onChoose(null)}
        />
        {branchList.map(b => (
          <BranchCard
            key={b.id}
            name={isEn && b.name_en ? b.name_en : b.name}
            address={isEn && b.address_en ? b.address_en : b.address}
            mapsUrl={b.maps_url}
            hours={b.opening_hours}
            onPick={() => onChoose(b)}
          />
        ))}
      </div>
    </div>
  )
}
