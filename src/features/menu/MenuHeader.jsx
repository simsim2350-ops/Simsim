import { SOCIAL_ICONS } from './SocialIcons'
import { estimatedPrepTime } from './helpers'

// هيدر المنيو: الغلاف + الشعار + زر اللغة + حالة الفتح + زر طلباتي + الوصف + الموقع + التواصل + المسبّبات + البحث
export default function MenuHeader({
  restaurant, branch, brandColor, descColor, openStatus, activeOrdersCount,
  isEn, t, tx, toggleLang,
  hasOrders, liveOrdersCount, onShowOrders, onShowAllergens,
  searchQuery, setSearchQuery,
}) {
  return (
    <div style={{ background:`linear-gradient(135deg, ${brandColor}22, ${brandColor}08)`, borderBottom:'1px solid #E5E7EB' }}>

      {/* Cover image */}
      {restaurant.cover_url && (
        <div style={{ width:'100%', height:'200px', overflow:'hidden' }}>
          <img src={restaurant.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        </div>
      )}

      <div style={{ padding: restaurant.cover_url ? '0 16px 16px' : '20px 16px 16px', marginTop: restaurant.cover_url ? '-32px' : 0 }}>
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'8px' }}>
          <button onClick={toggleLang} style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'6px 12px', borderRadius:'100px', border:'1.5px solid #E5E7EB', background:'white', cursor:'pointer', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', color:'#374151', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            🌐 {isEn ? 'العربية' : 'English'}
          </button>
        </div>
        <div style={{ display:'flex', alignItems:'flex-start', gap:'14px', marginBottom: tx(restaurant,'description') ? '10px' : 0 }}>
          <div style={{ width:'64px', height:'64px', borderRadius:'16px', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'30px', flexShrink:0, boxShadow:'0 4px 16px rgba(0,0,0,0.2)', overflow:'hidden', border: restaurant.cover_url ? '3px solid white' : 'none' }}>
            {restaurant.logo_url
              ? <img src={restaurant.logo_url} alt={restaurant.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : '🍕'}
          </div>
          <div style={{ flex:1, paddingTop: restaurant.cover_url ? '38px' : 0 }}>
            <h1 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', color:'#0F1117', marginBottom:'4px' }}>{restaurant.name}</h1>
            {branch && (
              <div style={{ fontSize:'12px', fontWeight:'700', color:brandColor, marginBottom:'6px' }}>🏢 {isEn && branch.name_en ? branch.name_en : branch.name}</div>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
              {(() => {
                const c = openStatus.open ? '#10B981' : '#EF4444'
                const bg = openStatus.open ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'
                return (
                  <>
                    <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'12px', fontWeight:'700', color:c, background:bg, padding:'3px 10px', borderRadius:'100px' }}>
                      <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:c, display:'inline-block' }}/>
                      {openStatus.open ? t('openNow') : t('closedNow')}
                    </span>
                    {openStatus.open
                      ? (!openStatus.unknown && openStatus.todayText && (
                          <span style={{ fontSize:'12px', color:'#9CA3AF', direction:'ltr' }}>🕐 {openStatus.todayText}</span>
                        ))
                      : (openStatus.nextText && (
                          <span style={{ fontSize:'12px', color:'#EF4444' }}>{openStatus.nextText}</span>
                        ))}
                  </>
                )
              })()}
              {estimatedPrepTime(activeOrdersCount) != null && (
                <span style={{ fontSize:'12px', color:'#9CA3AF' }}>⏱️ {estimatedPrepTime(activeOrdersCount)} {t('minShort')}</span>
              )}
            </div>
          </div>
          {hasOrders && (
            <button
              onClick={onShowOrders}
              style={{ flexShrink:0, padding:'9px 14px', borderRadius:'12px', border:'none', background:brandColor, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', boxShadow:`0 4px 12px ${brandColor}44` }}
            >
              📋 {t('myOrders')}
              {liveOrdersCount > 0 && (
                <span style={{ background:'rgba(255,255,255,0.3)', borderRadius:'100px', padding:'1px 7px', fontSize:'11px' }}>{liveOrdersCount}</span>
              )}
            </button>
          )}
        </div>

        {tx(restaurant,'description') && (
          <p style={{ fontSize:'13px', color:descColor, lineHeight:'1.6', marginBottom:'10px' }}>{tx(restaurant,'description')}</p>
        )}

        {/* موقع المحل — يعرض موقع الفرع لو محدد، وإلا موقع المطعم */}
        {(() => {
          const addr = branch?.address || restaurant.address
          const mapsUrl = branch?.maps_url
          if (!addr && !mapsUrl) return null
          return (
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px', flexWrap:'wrap' }}>
              {addr && (
                <span style={{ fontSize:'12px', color:'#6B7280', display:'inline-flex', alignItems:'center', gap:'4px' }}>
                  📍 {addr}
                </span>
              )}
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize:'12px', fontWeight:'700', color:brandColor, background:`${brandColor}14`, padding:'5px 11px', borderRadius:'100px', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:'5px' }}
                >
                  {t('mapLocation')}
                </a>
              )}
            </div>
          )
        })()}

        {/* Social links */}
        {restaurant.social_links && Object.values(restaurant.social_links).some(v => v) && (
          <div style={{ display:'flex', gap:'8px' }}>
            {['instagram', 'whatsapp_social', 'snapchat', 'twitter', 'tiktok']
              .filter(key => restaurant.social_links[key])
              .map(key => {
                const Icon = SOCIAL_ICONS[key]
                return (
                  <a
                    key={key}
                    href={restaurant.social_links[key]}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ width:'34px', height:'34px', borderRadius:'50%', background:'white', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', boxShadow:'0 2px 6px rgba(0,0,0,0.06)', overflow:'hidden' }}
                  >
                    <Icon/>
                  </a>
                )
              })}
          </div>
        )}

        {/* Allergens button */}
        {Array.isArray(restaurant.allergens) && restaurant.allergens.length > 0 && (
          <button
            onClick={onShowAllergens}
            style={{ marginTop:'10px', display:'flex', alignItems:'center', gap:'6px', padding:'7px 12px', borderRadius:'10px', border:'1.5px solid #FDE68A', background:'#FFFBEB', color:'#92400E', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}
          >
            ⚠️ {t('allergens')}
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ padding:'0 16px 14px' }}>
        <div style={{ background:'white', borderRadius:'12px', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', overflow:'hidden' }}>
          <span style={{ padding:'10px 12px', fontSize:'16px', color:'#9CA3AF' }}>🔍</span>
          <input
            type="text"
            placeholder={t('search')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ flex:1, padding:'10px 4px', border:'none', outline:'none', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'transparent', textAlign:'right' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ padding:'10px 12px', background:'none', border:'none', fontSize:'16px', cursor:'pointer', color:'#9CA3AF' }}>✕</button>
          )}
        </div>
      </div>
    </div>
  )
}
