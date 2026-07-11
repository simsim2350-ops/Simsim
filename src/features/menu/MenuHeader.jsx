import { useEffect, useRef, useState } from 'react'
import { SOCIAL_ICONS } from './SocialIcons'
import { estimatedPrepTime } from './helpers'

// أقصى عدد أحرف يظهر من وصف المطعم (قرار المالك)
const DESC_MAX_CHARS = 105
const HERO_HEIGHT = 170

const clamp01 = v => Math.min(1, Math.max(0, v))

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

  // Sticky Morph (مبدأ 6): صفّ الهوية (شعار+اسم+تقييم+حالة) عنصر sticky واحد يبقى مرئياً 100% دائماً
  //   بلا opacity/transform عليه إطلاقاً — لا يمكن أن يختفي. بقية المحتوى (وصف/تواصل/إحصائيات/ولاء)
  //   ينزلق طبيعياً خلف صفّ الهوية ويختفي بالتمرير (بلا حسابات ارتفاع هشّة).
  // scrollY يُستخدم فقط لأمرين خفيفين: تلاشي صورة الهيرو تدريجياً، وإظهار ظل خفيف تحت الهوية عند الالتصاق.
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => { setScrollY(window.scrollY); ticking = false })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const heroOpacity = 1 - clamp01((scrollY - 130) / 130) // يبقى كاملاً حتى 130px ثم يتلاشى بالكامل عند 260px
  // الهيدر المصغّر الدائم: عنصر منفصل (fixed) يظهر بتلاشٍ تماماً عندما ينزلق اسم البطاقة الحقيقي تحت أعلى الشاشة
  // (نطاق 122→164 يطابق لحظة مرور اسم المطعم خلف شريط 56px العلوي، فلا يظهر الاسم مرّتين)
  const compactT = clamp01((scrollY - 122) / 42)

  // قصّ الوصف عند الحد الأقصى
  const fullDesc = tx(restaurant, 'description')
  const desc = fullDesc && fullDesc.length > DESC_MAX_CHARS ? fullDesc.slice(0, DESC_MAX_CHARS).trim() + '…' : fullDesc
  // خلية إحصائيات واحدة (حالة الفتح / وقت التجهيز / التوصيل)
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

  return (
    <>
      {/* لماذا Fragment لا <div>: البطاقة/الهوية sticky تبقى ملتصقة فقط بحدود أقرب حاوية أب لها —
          بالـ Fragment تصبح شقيقة مباشرة لـ MenuBody داخل نفس حاوية الصفحة الطويلة في PublicMenu،
          فتبقى الهوية ملتصقة طوال منطقة البطاقة بدل أن تنفلت وتختفي بعد مسافة قصيرة. */}

      {/* ===== الهيرو: مثبّت على الشاشة (fixed) فلا يتحرك، والبطاقة تنزلق فوقه، ثم يتلاشى تدريجياً ===== */}
      <div style={{ height:`${HERO_HEIGHT}px` }}/>
      <div style={{
        position:'fixed', top:0, left:'50%', transform:'translateX(-50%)',
        width:'100%', maxWidth:'480px', height:`${HERO_HEIGHT}px`, zIndex:5,
        overflow:'hidden', background:`linear-gradient(160deg, ${brandColor}, ${brandColor}88)`,
        opacity: heroOpacity,
        pointerEvents: heroOpacity < 0.5 ? 'none' : 'auto',
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

        {/* زر البحث — عائم بجانب زر اللغة (أفقياً)، يفتح/يغلق حقل البحث */}
        <button onClick={toggleSearch} style={{ position:'absolute', top:'18px', left:'62px', width:'40px', height:'40px', borderRadius:'50%', border:'none', background: searchOpen ? brandColor : 'rgba(255,255,255,0.95)', color: searchOpen ? 'white' : '#374151', boxShadow:'0 4px 14px rgba(0,0,0,0.28)', cursor:'pointer', fontSize:'16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
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

      {/* ===== البطاقة العائمة فوق الهيرو (هوامش جانبية + زوايا مدوّرة) — تدفّق طبيعي، تنزلق للأعلى ===== */}
      <div style={{ position:'relative', zIndex:10, margin:'-76px 16px 0', background:'white', borderRadius:'22px', boxShadow:'0 10px 30px rgba(15,17,23,0.16)' }}>

        {/* رأس البطاقة (شعار + اسم + تقييم + حالة الفتح) — تدفّق طبيعي ضمن البطاقة، ينزلق مع الصفحة.
            التثبيت الدائم يتكفّل به «الهيدر المصغّر» المنفصل أدناه (لتفادي التعارض مع شريط الأقسام). */}
        <div style={{ paddingTop:'6px' }}>
          {/* مقبض السحب */}
          <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'100px', margin:'0 auto 6px' }}/>

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

          {/* الهوية: شعار + اسم + تقييم + حالة الفتح */}
          <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'0 16px 7px' }}>
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
              {/* حالة الفتح/الإغلاق — تبقى ضمن الهوية الثابتة */}
              {(restaurant?.show_hours ?? true) && (
                <div style={{ display:'inline-flex', alignItems:'center', gap:'5px', marginTop:'2px', fontSize:'11px', fontWeight:'800', color: openStatus.open ? '#10B981' : '#EF4444' }}>
                  <span style={{ width:'6px', height:'6px', borderRadius:'50%', background: openStatus.open ? '#10B981' : '#EF4444', flexShrink:0 }}/>
                  {openStatus.open ? t('openNow') : t('closedNow')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== المحتوى الثانوي — تدفّق طبيعي، ينزلق للأعلى خلف صفّ الهوية ويختفي بالتمرير ===== */}
        {/* صفّ الفرع مع زر التغيير */}
        <div style={{ display:'flex', alignItems:'center', gap:'7px', padding:'0 16px', flexWrap:'wrap' }}>
          {branch
            ? <span style={{ fontSize:'11.5px', fontWeight:'700', color:'#6B7280' }}>🏢 {isEn && branch.name_en ? branch.name_en : branch.name}</span>
            : (hasBranches && <span style={{ fontSize:'11.5px', fontWeight:'700', color:'#6B7280' }}>🏠 {isEn ? 'Main branch' : 'الفرع الرئيسي'}</span>)}
          {hasBranches && (
            <button onClick={onChangeBranch} style={{ border:'none', cursor:'pointer', fontSize:'10.5px', fontWeight:'800', color:brandColor, background:`${brandColor}14`, borderRadius:'100px', padding:'3px 10px', fontFamily:'Cairo,sans-serif' }}>
              {isEn ? 'Change ‹' : 'تغيير ‹'}
            </button>
          )}
        </div>

        {/* وصف المطعم — يكتبه صاحب المطعم من الإعدادات (يدعم الترجمة)، ويُقص عند 105 أحرف */}
        {(restaurant.show_description ?? true) && desc && (
          <p style={{ fontSize:'12.5px', color:descColor, lineHeight:'1.45', margin:'4px 16px 0' }}>{desc}</p>
        )}

        {/* الموقع + رابط الخريطة */}
        {(() => {
          const addr = branch?.address || restaurant.address
          const mapsUrl = branch?.maps_url
          if (!addr && !mapsUrl) return null
          return (
            <div style={{ display:'flex', alignItems:'center', gap:'8px', margin:'1px 16px 0', flexWrap:'wrap' }}>
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
          <div style={{ display:'flex', alignItems:'center', gap:'8px', margin:'3px 16px 0', flexWrap:'wrap' }}>
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
        <div style={{ display:'flex', margin:'5px 14px 2px', background:'#F8F9FB', border:'1px solid #EEF0F4', borderRadius:'15px', padding:'6px 4px' }}>
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
            <div onClick={onShowOrders} style={{ margin:'0 14px 4px', background:`linear-gradient(120deg, ${brandColor}16, ${brandColor}08)`, border:`1px solid ${brandColor}30`, borderRadius:'13px', padding:'6px 12px', display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}>
              <span style={{ fontSize:'15px' }}>🎁</span>
              <span style={{ flex:1, fontSize:'11.5px', fontWeight:'800', color:'#0F1117', fontFamily:'Cairo,sans-serif' }}>{text}</span>
              <span style={{ fontSize:'10px', fontWeight:'800', color:brandColor, whiteSpace:'nowrap' }}>{isEn ? 'Details ›' : 'التفاصيل ›'}</span>
            </div>
          )
        })()}

      </div>

      {/* ===== الهيدر المصغّر الدائم — عنصر منفصل (fixed) دائم التركيب، يظهر بتلاشٍ عند نزول البطاقة =====
          يبقى ثابتاً أعلى الشاشة طوال تصفّح المنتجات (فوق شريط الأقسام)، بلا unmount/remount فلا وميض. */}
      <div style={{
        position:'fixed', top:0, left:'50%',
        transform:`translateX(-50%) translateY(${((1 - compactT) * -10).toFixed(1)}px)`,
        width:'100%', maxWidth:'480px', height:'56px', zIndex:40,
        background:'white', boxShadow:'0 4px 16px rgba(15,17,23,0.10)',
        display:'flex', alignItems:'center', gap:'10px', padding:'0 16px',
        opacity: compactT,
        pointerEvents: compactT > 0.5 ? 'auto' : 'none',
      }}>
        <div style={{ width:'36px', height:'36px', borderRadius:'10px', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'17px', flexShrink:0, overflow:'hidden', boxShadow:'0 3px 9px rgba(15,17,23,0.16)' }}>
          {restaurant.logo_url
            ? <img src={restaurant.logo_url} alt={restaurant.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : '🍕'}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px', color:'#0F1117', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{restaurant.name}</div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginTop:'1px' }}>
            {rating && (
              <span style={{ fontSize:'10.5px', fontWeight:'800', color:'#B08A2E', whiteSpace:'nowrap' }}>★ {rating.avg}</span>
            )}
            {(restaurant?.show_hours ?? true) && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'10.5px', fontWeight:'800', color: openStatus.open ? '#10B981' : '#EF4444', whiteSpace:'nowrap' }}>
                <span style={{ width:'6px', height:'6px', borderRadius:'50%', background: openStatus.open ? '#10B981' : '#EF4444', flexShrink:0 }}/>
                {openStatus.open ? t('openNow') : t('closedNow')}
              </span>
            )}
          </div>
        </div>
        {hasOrders && (
          <button onClick={onShowOrders} aria-label={t('myOrders')} style={{ flexShrink:0, width:'38px', height:'38px', borderRadius:'50%', border:'none', background:`${brandColor}14`, color:brandColor, cursor:'pointer', fontSize:'16px', display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
            📋
            {liveOrdersCount > 0 && (
              <span style={{ position:'absolute', top:'-2px', right:'-2px', background:brandColor, color:'white', borderRadius:'100px', minWidth:'16px', height:'16px', fontSize:'10px', fontWeight:'800', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>{liveOrdersCount}</span>
            )}
          </button>
        )}
      </div>
    </>
  )
}
