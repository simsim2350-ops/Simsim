import { SOCIAL_ICONS } from './SocialIcons'
import { estimatedPrepTime } from './helpers'

// هيدر المنيو — الهندسة الجديدة (مستلهمة من تطبيقات التوصيل):
// هيرو مصوّر بكامل العرض + أزرار عائمة، ثم ورقة بيضاء بزوايا دائرية تحوي:
// الهوية (شعار/اسم/فرع مع تغيير) + الوصف + الموقع + التواصل + بطاقة الإحصائيات + البحث
export default function MenuHeader({
  restaurant, branch, brandColor, descColor, openStatus, activeOrdersCount,
  isEn, t, tx, toggleLang,
  hasOrders, liveOrdersCount, onShowOrders, onShowAllergens,
  searchQuery, setSearchQuery,
  hasBranches, onChangeBranch,
}) {
  // خلية إحصائيات واحدة (حالة الفتح / وقت التجهيز / التوصيل)
  const statCells = [
    {
      value: openStatus.open ? t('openNow') : t('closedNow'),
      color: openStatus.open ? '#10B981' : '#EF4444',
      sub: openStatus.open
        ? (!openStatus.unknown && openStatus.todayText ? openStatus.todayText : '')
        : (openStatus.nextText || ''),
    },
    {
      value: `${estimatedPrepTime(activeOrdersCount)} ${t('minShort')}`,
      color: '#0F1117',
      sub: isEn ? 'Prep time' : 'وقت التجهيز',
    },
    ...(restaurant?.delivery_enabled ? [{
      value: Number(restaurant.delivery_fee) > 0 ? `${Number(restaurant.delivery_fee).toFixed(0)} ﷼` : (isEn ? 'Free' : 'مجاني'),
      color: '#0F1117',
      sub: isEn ? 'Delivery' : 'رسوم التوصيل',
    }] : []),
  ]

  return (
    <div>
      {/* ===== الهيرو: غلاف المطعم بكامل العرض (أو تدرّج بلون الهوية كبديل تلقائي) ===== */}
      <div style={{ height:'210px', position:'relative', overflow:'hidden', background:`linear-gradient(160deg, ${brandColor}, ${brandColor}88)` }}>
        {restaurant.cover_url && (
          <img src={restaurant.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
        )}
        {/* تظليل خفيف أسفل الهيرو ليبرز انزلاق الورقة */}
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(0,0,0,0.12), transparent 30%, transparent 70%, rgba(0,0,0,0.18))', pointerEvents:'none' }}/>

        {/* زر اللغة — عائم */}
        <button onClick={toggleLang} style={{ position:'absolute', top:'18px', left:'14px', width:'40px', height:'40px', borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.95)', boxShadow:'0 4px 14px rgba(0,0,0,0.28)', cursor:'pointer', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', color:'#374151', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {isEn ? 'ع' : 'EN'}
        </button>

        {/* زر طلباتي — عائم بعداد حي */}
        {hasOrders && (
          <button onClick={onShowOrders} style={{ position:'absolute', top:'18px', right:'14px', padding:'10px 15px', borderRadius:'100px', border:'none', background:brandColor, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', boxShadow:`0 6px 18px ${brandColor}66` }}>
            📋 {t('myOrders')}
            {liveOrdersCount > 0 && (
              <span style={{ background:'rgba(255,255,255,0.3)', borderRadius:'100px', padding:'1px 7px', fontSize:'11px' }}>{liveOrdersCount}</span>
            )}
          </button>
        )}
      </div>

      {/* ===== الورقة البيضاء المنزلقة ===== */}
      <div style={{ position:'relative', marginTop:'-26px', background:'white', borderRadius:'26px 26px 0 0', boxShadow:'0 -10px 30px rgba(15,17,23,0.16)', paddingTop:'10px' }}>
        <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'100px', margin:'0 auto 12px' }}/>

        {/* الهوية: شعار + اسم + فرع مع زر تغيير */}
        <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'0 16px' }}>
          <div style={{ width:'56px', height:'56px', borderRadius:'16px', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px', flexShrink:0, overflow:'hidden', boxShadow:'0 5px 14px rgba(15,17,23,0.18)' }}>
            {restaurant.logo_url
              ? <img src={restaurant.logo_url} alt={restaurant.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : '🍕'}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <h1 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'19px', color:'#0F1117', margin:0 }}>{restaurant.name}</h1>
            <div style={{ display:'flex', alignItems:'center', gap:'7px', marginTop:'4px', flexWrap:'wrap' }}>
              {branch
                ? <span style={{ fontSize:'11.5px', fontWeight:'700', color:'#6B7280' }}>🏢 {isEn && branch.name_en ? branch.name_en : branch.name}</span>
                : (hasBranches && <span style={{ fontSize:'11.5px', fontWeight:'700', color:'#6B7280' }}>🏠 {isEn ? 'Main branch' : 'الفرع الرئيسي'}</span>)}
              {hasBranches && (
                <button onClick={onChangeBranch} style={{ border:'none', cursor:'pointer', fontSize:'10.5px', fontWeight:'800', color:brandColor, background:`${brandColor}14`, borderRadius:'100px', padding:'3px 10px', fontFamily:'Cairo,sans-serif' }}>
                  {isEn ? 'Change ‹' : 'تغيير ‹'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* وصف المطعم — يكتبه صاحب المطعم من الإعدادات (يدعم الترجمة) */}
        {tx(restaurant,'description') && (
          <p style={{ fontSize:'13px', color:descColor, lineHeight:'1.7', margin:'10px 16px 0' }}>{tx(restaurant,'description')}</p>
        )}

        {/* الموقع + رابط الخريطة */}
        {(() => {
          const addr = branch?.address || restaurant.address
          const mapsUrl = branch?.maps_url
          if (!addr && !mapsUrl) return null
          return (
            <div style={{ display:'flex', alignItems:'center', gap:'8px', margin:'8px 16px 0', flexWrap:'wrap' }}>
              {addr && (
                <span style={{ fontSize:'12px', color:'#6B7280', display:'inline-flex', alignItems:'center', gap:'4px' }}>📍 {addr}</span>
              )}
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:'11px', fontWeight:'700', color:brandColor, background:`${brandColor}14`, padding:'4px 10px', borderRadius:'100px', textDecoration:'none' }}>
                  {t('mapBtn')}
                </a>
              )}
            </div>
          )
        })()}

        {/* روابط التواصل + زر المسبّبات */}
        {((restaurant.social_links && Object.values(restaurant.social_links).some(v => v)) || (Array.isArray(restaurant.allergens) && restaurant.allergens.length > 0)) && (
          <div style={{ display:'flex', alignItems:'center', gap:'8px', margin:'10px 16px 0', flexWrap:'wrap' }}>
            {restaurant.social_links && ['instagram', 'whatsapp_social', 'snapchat', 'twitter', 'tiktok']
              .filter(key => restaurant.social_links[key])
              .map(key => {
                const Icon = SOCIAL_ICONS[key]
                return (
                  <a key={key} href={restaurant.social_links[key]} target="_blank" rel="noopener noreferrer"
                    style={{ width:'32px', height:'32px', borderRadius:'50%', background:'white', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', boxShadow:'0 2px 6px rgba(0,0,0,0.06)', overflow:'hidden' }}>
                    <Icon/>
                  </a>
                )
              })}
            {Array.isArray(restaurant.allergens) && restaurant.allergens.length > 0 && (
              <button onClick={onShowAllergens} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'6px 11px', borderRadius:'100px', border:'1.5px solid #FDE68A', background:'#FFFBEB', color:'#92400E', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'11px', cursor:'pointer' }}>
                ⚠️ {t('allergens')}
              </button>
            )}
          </div>
        )}

        {/* بطاقة الإحصائيات: الحالة · التجهيز · التوصيل */}
        <div style={{ display:'flex', margin:'13px 14px 0', background:'#F8F9FB', border:'1px solid #EEF0F4', borderRadius:'15px', padding:'11px 4px' }}>
          {statCells.map((c, i) => (
            <div key={i} style={{ flex:1, textAlign:'center', borderRight: i > 0 ? '1px solid #E9ECF1' : 'none', padding:'0 4px' }}>
              <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'12.5px', color:c.color, whiteSpace:'nowrap' }}>{c.value}</div>
              {c.sub && <div style={{ fontSize:'9.5px', color:'#9CA3AF', fontWeight:'700', marginTop:'3px', direction: i === 0 && openStatus.open ? 'ltr' : 'rtl' }}>{c.sub}</div>}
            </div>
          ))}
        </div>

        {/* البحث */}
        <div style={{ padding:'12px 14px 14px' }}>
          <div style={{ background:'#F8F9FB', borderRadius:'100px', border:'1.5px solid #EEF0F4', display:'flex', alignItems:'center', overflow:'hidden' }}>
            <span style={{ padding:'10px 14px', fontSize:'15px', color:'#9CA3AF' }}>🔍</span>
            <input
              type="text"
              placeholder={t('search')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ flex:1, padding:'10px 4px', border:'none', outline:'none', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'transparent', textAlign:'right' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ padding:'10px 14px', background:'none', border:'none', fontSize:'15px', cursor:'pointer', color:'#9CA3AF' }}>✕</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
