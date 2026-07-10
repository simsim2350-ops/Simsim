import { useEffect, useRef, useState } from 'react'
import { SOCIAL_ICONS } from './SocialIcons'
import { estimatedPrepTime } from './helpers'

// أقصى عدد أحرف يظهر من وصف المطعم (قرار المالك)
const DESC_MAX_CHARS = 105

// Sticky Morph: طول مسافة التمرير (px) حتى اكتمال تحوّل البطاقة لنسخة مصغّرة لاصقة
const HERO_HEIGHT = 170
const RANGE_END = 260

const clamp01 = v => Math.min(1, Math.max(0, v))
const lerp = (a, b, t) => a + (b - a) * t
// تلاشي opacity فقط لعنصر ثانوي ضمن نطاق فرعي من التقدّم العام (0..1) — بدون أي CSS transition
// (التحديث مستمر كل إطار عبر JS، فإضافة transition تجعل العنصر "يلاحق" القيمة بتأخير)
// عناصر ثانوية فقط (الوصف/التواصل/الولاء/الإحصائيات...) — الهوية (شعار/اسم/تقييم) لا تُخفى أبداً، تتحرك بترانسفورم منفصل
const fadeStyle = (progress, start, end) => {
  const t = clamp01((progress - start) / (end - start))
  return {
    opacity: 1 - t,
    pointerEvents: t > 0.6 ? 'none' : 'auto',
  }
}

// هيدر المنيو — الهندسة الجديدة (مستلهمة من تطبيقات التوصيل):
// هيرو مصوّر بكامل العرض + أزرار عائمة، ثم ورقة بيضاء بزوايا دائرية تحوي:
// الهوية (شعار/اسم/فرع مع تغيير) + الوصف + الموقع + التواصل + بطاقة الإحصائيات + البحث
export default function MenuHeader({
  restaurant, branch, brandColor, descColor, openStatus, activeOrdersCount,
  isEn, t, tx, toggleLang,
  hasOrders, liveOrdersCount, onShowOrders, onShowAllergens,
  searchQuery, setSearchQuery,
  hasBranches, onChangeBranch,
  rating, loyalty,
}) {
  // البحث مخفي افتراضياً — يفتح بزر عائم على الهيرو (يوفّر مساحة عمودية)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef(null)
  useEffect(() => { if (searchOpen) searchInputRef.current?.focus() }, [searchOpen])
  const toggleSearch = () => {
    if (searchOpen) { setSearchOpen(false); setSearchQuery('') }
    else setSearchOpen(true)
  }

  // Sticky Morph: نفس البطاقة تتحوّل تدريجياً (لا اختفاء/ظهور مفاجئ) حسب موضع التمرير الفعلي
  // (مبدأ 6 من فلسفة تصميم البطاقة) — تقدّم مستمر 0..1 بدل تبديل ثنائي، لتفريغ العناصر حسب الأولوية
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setProgress(clamp01(window.scrollY / RANGE_END))
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // طيّ المساحة النهائي (بعد أن يكون كل المحتوى الثانوي شفافاً بالفعل) — قيمة مستمرة أيضاً، لا قفزة منفردة
  const collapseT = clamp01((progress - 0.85) / 0.15)

  // قصّ الوصف عند الحد الأقصى
  const fullDesc = tx(restaurant, 'description')
  const desc = fullDesc && fullDesc.length > DESC_MAX_CHARS ? fullDesc.slice(0, DESC_MAX_CHARS).trim() + '…' : fullDesc
  // خلية إحصائيات واحدة (حالة الفتح / وقت التجهيز / التوصيل) — تتلاشى بالكامل ضمن أولوية "الوقت/الساعات"
  const statCells = [
    ...((restaurant?.show_hours ?? true) ? [{
      value: openStatus.open ? t('openNow') : t('closedNow'),
      color: openStatus.open ? '#10B981' : '#EF4444',
      sub: openStatus.open
        ? (!openStatus.unknown && openStatus.todayText ? openStatus.todayText : '')
        : (openStatus.nextText || ''),
      ltr: openStatus.open,
    }] : []),
    ...((restaurant?.show_prep_time ?? true) ? [{
      value: `${estimatedPrepTime(activeOrdersCount)} ${t('minShort')}`,
      color: '#0F1117',
      sub: isEn ? 'Prep time' : 'وقت التجهيز',
    }] : []),
    ...(restaurant?.delivery_enabled ? [{
      value: Number(restaurant.delivery_fee) > 0 ? `${Number(restaurant.delivery_fee).toFixed(0)} ﷼` : (isEn ? 'Free' : 'مجاني'),
      color: '#0F1117',
      sub: isEn ? 'Delivery' : 'رسوم التوصيل',
    }] : []),
  ]

  // ترتيب أولوية الاختفاء أثناء الصعود: الولاء أولاً ← الوقت/الساعات + الفرع ← التواصل/الحساسية ← الوصف/الموقع
  const fadeUtility = fadeStyle(progress, 0.00, 0.12)   // مقبض السحب + البحث
  const fadeLoyalty = fadeStyle(progress, 0.00, 0.15)   // بطاقة الولاء
  const fadeStats = fadeStyle(progress, 0.12, 0.32)     // خلية الإحصائيات (وقت التجهيز/ساعات العمل) + صفّ الفرع
  const fadeSocial = fadeStyle(progress, 0.28, 0.48)    // التواصل + المسبّبات
  const fadeDesc = fadeStyle(progress, 0.44, 0.64)      // الوصف + الموقع

  // الهوية (شعار + اسم + تقييم): لا تختفي أبداً — نفس العناصر، تتحرك بترانسفورم مستمر فقط (بلا opacity)
  const identityT = clamp01(progress / 0.9)
  const identityStyle = {
    transform: `translateY(${lerp(0, -3, identityT).toFixed(2)}px) scale(${lerp(1, 0.9, identityT).toFixed(3)})`,
    transformOrigin: 'top right',
  }

  return (
    <div>
      {/* ===== فاصل يحافظ على ارتفاع الصفحة مكان الهيرو (الهيرو نفسه fixed، خارج تدفّق المستند) ===== */}
      <div style={{ height:`${HERO_HEIGHT}px` }}/>

      {/* ===== الهيرو: مثبّت على الشاشة (fixed) طوال مدة التحوّل فلا يتحرك إطلاقاً، ثم يتلاشى تدريجياً عند اكتمال الانكماش =====
          (fixed بدل sticky+حاوية أطول: يمنع أي مسافة فارغة بين الهيرو والبطاقة، لأن البطاقة تبدأ متداخلة معه دائماً وتتقدّم فوقه فقط) */}
      <div style={{
        position:'fixed', top:0, left:'50%', transform:'translateX(-50%)',
        width:'100%', maxWidth:'480px', height:`${HERO_HEIGHT}px`, zIndex:5,
        overflow:'hidden', background:`linear-gradient(160deg, ${brandColor}, ${brandColor}88)`,
        opacity: 1 - clamp01((progress - 0.6) / 0.4),
        pointerEvents: progress > 0.55 ? 'none' : 'auto',
      }}>
        {restaurant.cover_url && (
          <img src={restaurant.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
        )}
        {/* تظليل خفيف أسفل الهيرو ليبرز انزلاق الورقة */}
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(0,0,0,0.12), transparent 30%, transparent 70%, rgba(0,0,0,0.18))', pointerEvents:'none' }}/>

        {/* زر اللغة — عائم */}
        <button onClick={toggleLang} style={{ position:'absolute', top:'18px', left:'14px', width:'40px', height:'40px', borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.95)', boxShadow:'0 4px 14px rgba(0,0,0,0.28)', cursor:'pointer', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', color:'#374151', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {isEn ? 'ع' : 'EN'}
        </button>

        {/* زر البحث — عائم تحت زر اللغة، يفتح/يغلق حقل البحث */}
        <button onClick={toggleSearch} style={{ position:'absolute', top:'64px', left:'14px', width:'40px', height:'40px', borderRadius:'50%', border:'none', background: searchOpen ? brandColor : 'rgba(255,255,255,0.95)', color: searchOpen ? 'white' : '#374151', boxShadow:'0 4px 14px rgba(0,0,0,0.28)', cursor:'pointer', fontSize:'16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {searchOpen ? '✕' : '🔍'}
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

      {/* ===== البطاقة العائمة — نفس العنصر يتحوّل تدريجياً (Morph) لنسخة مصغّرة لاصقة عند التمرير =====
          هوية البطاقة (هوامش/زوايا/ظل) تبقى ثابتة طوال الحركة — الانكماش يأتي فقط من تلاشي المحتوى الثانوي
          وطيّه في النهاية، لا من قفزة في شكل الحاوية نفسها (هذا ما كان يسبّب اختفاء الهوية للحظة) */}
      <div style={{
        position:'sticky', top:0, zIndex:30,
        margin:'-26px 16px 14px',
        background:'white',
        borderRadius:'22px',
        boxShadow:'0 10px 30px rgba(15,17,23,0.16)',
        paddingTop:'8px',
      }}>
        {/* انتقال ناعم بين البطاقة ومنطقة المنتجات (ظل متدرّج ثابت) */}
        <div style={{ position:'absolute', left:0, right:0, bottom:'-14px', height:'14px', background:'linear-gradient(180deg, rgba(15,17,23,0.07), rgba(15,17,23,0))', pointerEvents:'none' }}/>

        {/* مقبض السحب + حقل البحث — يتلاشيان أولاً، ثم تُطوى مساحتهما نهائياً بعد اكتمال التلاشي (لا قفزة مرئية لأنها شفافة بالفعل) */}
        <div style={{ maxHeight: lerp(160, 0, collapseT), overflow:'hidden' }}>
          <div style={fadeUtility}>
            <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'100px', margin:'0 auto 8px' }}/>

            {/* حقل البحث — يظهر فقط عند فتحه من الزر العائم */}
            {searchOpen && (
              <div style={{ padding:'0 14px 10px' }}>
                <div style={{ background:'#F8F9FB', borderRadius:'100px', border:`1.5px solid ${brandColor}55`, display:'flex', alignItems:'center', overflow:'hidden' }}>
                  <span style={{ padding:'9px 14px', fontSize:'15px', color:'#9CA3AF' }}>🔍</span>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder={t('search')}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ flex:1, padding:'9px 4px', border:'none', outline:'none', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'transparent', textAlign:'right' }}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} style={{ padding:'9px 14px', background:'none', border:'none', fontSize:'15px', cursor:'pointer', color:'#9CA3AF' }}>✕</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* الهوية: شعار + اسم + تقييم + حالة الفتح — نفس العناصر دائماً بلا opacity، تتحرك بترانسفورم مستمر فقط */}
        <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'0 16px', ...identityStyle }}>
          <div style={{ width:'56px', height:'56px', borderRadius:'16px', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px', flexShrink:0, overflow:'hidden', boxShadow:'0 5px 14px rgba(15,17,23,0.18)' }}>
            {restaurant.logo_url
              ? <img src={restaurant.logo_url} alt={restaurant.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : '🍕'}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <h1 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'19px', color:'#0F1117', margin:0 }}>{restaurant.name}</h1>
            {rating && (
              <div style={{ fontSize:'11.5px', fontWeight:'800', color:'#B08A2E', marginTop:'2px' }}>
                ★ {rating.avg} <span style={{ color:'#9CA3AF', fontWeight:'700' }}>({rating.count} {isEn ? 'reviews' : 'تقييم'})</span>
              </div>
            )}
            {/* حالة الفتح/الإغلاق — عنصر مستقل صغير يبقى ظاهراً دائماً (لا يتلاشى مع بقية خلية الإحصائيات) */}
            {(restaurant?.show_hours ?? true) && (
              <div style={{ display:'inline-flex', alignItems:'center', gap:'5px', marginTop:'2px', fontSize:'11px', fontWeight:'800', color: openStatus.open ? '#10B981' : '#EF4444' }}>
                <span style={{ width:'6px', height:'6px', borderRadius:'50%', background: openStatus.open ? '#10B981' : '#EF4444', flexShrink:0 }}/>
                {openStatus.open ? t('openNow') : t('closedNow')}
              </div>
            )}
            <div style={{ maxHeight: lerp(40, 0, collapseT), overflow:'hidden' }}>
              <div style={{ ...fadeStats, display:'flex', alignItems:'center', gap:'7px', marginTop:'2px', flexWrap:'wrap' }}>
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
        </div>

        {/* بقية أقسام البطاقة (الوصف/الموقع/التواصل/الإحصائيات/الولاء) — تتلاشى بالأولوية، ثم تُطوى مساحتها نهائياً */}
        <div style={{ maxHeight: lerp(800, 0, collapseT), overflow:'hidden' }}>
          {/* وصف المطعم — يكتبه صاحب المطعم من الإعدادات (يدعم الترجمة)، ويُقص عند 105 أحرف */}
          {(restaurant.show_description ?? true) && desc && (
            <p style={{ ...fadeDesc, fontSize:'12.5px', color:descColor, lineHeight:'1.45', margin:'3px 16px 0' }}>{desc}</p>
          )}

          {/* الموقع + رابط الخريطة */}
          {(() => {
            const addr = branch?.address || restaurant.address
            const mapsUrl = branch?.maps_url
            if (!addr && !mapsUrl) return null
            return (
              <div style={{ ...fadeDesc, display:'flex', alignItems:'center', gap:'8px', margin:'2px 16px 0', flexWrap:'wrap' }}>
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
          {(((restaurant.show_social_links ?? true) && restaurant.social_links && Object.values(restaurant.social_links).some(v => v)) || ((restaurant.show_allergens ?? true) && Array.isArray(restaurant.allergens) && restaurant.allergens.length > 0)) && (
            <div style={{ ...fadeSocial, display:'flex', alignItems:'center', gap:'8px', margin:'4px 16px 0', flexWrap:'wrap' }}>
              {(restaurant.show_social_links ?? true) && restaurant.social_links && ['instagram', 'whatsapp_social', 'snapchat', 'twitter', 'tiktok']
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
              {(restaurant.show_allergens ?? true) && Array.isArray(restaurant.allergens) && restaurant.allergens.length > 0 && (
                <button onClick={onShowAllergens} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'6px 11px', borderRadius:'100px', border:'1.5px solid #FDE68A', background:'#FFFBEB', color:'#92400E', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'11px', cursor:'pointer' }}>
                  ⚠️ {t('allergens')}
                </button>
              )}
            </div>
          )}

          {/* بطاقة الإحصائيات: الحالة · التجهيز · التوصيل */}
          <div style={{ ...fadeStats, display:'flex', margin:'6px 14px 6px', background:'#F8F9FB', border:'1px solid #EEF0F4', borderRadius:'15px', padding:'7px 4px' }}>
            {statCells.map((c, i) => (
              <div key={i} style={{ flex:1, textAlign:'center', borderRight: i > 0 ? '1px solid #E9ECF1' : 'none', padding:'0 4px' }}>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'12.5px', color:c.color, whiteSpace:'nowrap' }}>{c.value}</div>
                {c.sub && <div style={{ fontSize:'9.5px', color:'#9CA3AF', fontWeight:'700', marginTop:'3px', direction: c.ltr ? 'ltr' : 'rtl' }}>{c.sub}</div>}
              </div>
            ))}
          </div>

          {/* بانر نقاط الولاء — للزبون المعروف فقط ولو البرنامج مفعّل (الضغط يفتح التفاصيل في شاشة طلباتي) */}
          {loyalty && (() => {
            const threshold = loyalty.reward_threshold || 0
            const balance = loyalty.balance || 0
            const ready = threshold > 0 && balance >= threshold
            const text = ready
              ? (isEn ? `Your reward is ready: ${loyalty.reward_description || t('rewardDefault')} 🎉` : `مكافأتك جاهزة: ${loyalty.reward_description || t('rewardDefault')} 🎉`)
              : threshold > 0
                ? (isEn ? `Your points: ${balance} — ${Math.max(0, threshold - balance)} pts to your reward` : `نقاطك: ${balance} — باقي ${Math.max(0, threshold - balance)} نقطة على مكافأتك`)
                : (isEn ? `Your points: ${balance}` : `نقاطك: ${balance}`)
            return (
              <div onClick={onShowOrders} style={{ ...fadeLoyalty, margin:'0 14px 10px', background:`linear-gradient(120deg, ${brandColor}16, ${brandColor}08)`, border:`1px solid ${brandColor}30`, borderRadius:'13px', padding:'8px 12px', display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}>
                <span style={{ fontSize:'15px' }}>🎁</span>
                <span style={{ flex:1, fontSize:'11.5px', fontWeight:'800', color:'#0F1117', fontFamily:'Cairo,sans-serif' }}>{text}</span>
                <span style={{ fontSize:'10px', fontWeight:'800', color:brandColor, whiteSpace:'nowrap' }}>{isEn ? 'Details ›' : 'التفاصيل ›'}</span>
              </div>
            )
          })()}
        </div>

      </div>
    </div>
  )
}
