import { useEffect, useRef, useState } from 'react'
import { SOCIAL_ICONS } from './SocialIcons'
import { estimatedPrepTime } from './helpers'

const HERO_HEIGHT = 128

const clamp01 = v => Math.min(1, Math.max(0, v))

// هيدر المنيو — الهندسة الجديدة (مستلهمة من تطبيقات التوصيل):
// هيرو مصوّر بكامل العرض + أزرار عائمة، ثم ورقة بيضاء بزوايا دائرية تحوي:
// الهوية (شعار/اسم/فرع مع تغيير) + الوصف + الموقع + التواصل + بطاقة الإحصائيات + البحث
export default function MenuHeader({
  restaurant, branch, brandColor, descColor, openStatus, deliveryEnabled, deliveryFee, activeOrdersCount,
  isEn, t, tx, toggleLang,
  hasOrders, liveOrdersCount, onShowOrders, onShowAllergens,
  onToggleSearch,
  rating, loyalty,
  banners = [], coupons = [],
}) {
  // شريط ترويجي مضغوط (خانة واحدة فقط) — أهم بانر/كوبون نشط
  const [promoDismissed, setPromoDismissed] = useState(false)
  const activePromo = banners.length > 0
    ? { type: 'banner', data: banners[0] }
    : coupons.length > 0
      ? { type: 'coupon', data: coupons[0] }
      : null

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
  const heroOpacity = 1 - clamp01((scrollY - 86) / 130) // يبقى كاملاً حتى 86px ثم يتلاشى بالكامل عند 216px (عُوير بعد تقصير الهيرو)
  // الهيدر المصغّر الدائم: عنصر منفصل (fixed) يظهر بتلاشٍ تماماً عندما ينزلق اسم البطاقة الحقيقي تحت أعلى الشاشة
  // (نطاق 78→120 يطابق لحظة مرور اسم المطعم خلف شريط 56px العلوي بعد ارتفاع البطاقة ~44px، فلا يظهر الاسم مرّتين)
  const compactT = clamp01((scrollY - 78) / 42)

  // وصف المطعم — يُعرض بسطرين فقط (line-clamp) مع زر «عرض المزيد» يوسّعه بالكامل ثم «عرض أقل»
  const fullDesc = tx(restaurant, 'description')
  const descRef = useRef(null)
  const [descExpanded, setDescExpanded] = useState(false)
  const [descOverflows, setDescOverflows] = useState(false)
  useEffect(() => {
    if (descExpanded) return // نقيس فقط في حالة الطيّ (سطرين) لتحديد إن كان النص يتجاوزهما
    const el = descRef.current
    if (el) setDescOverflows(el.scrollHeight > el.clientHeight + 2)
  }, [fullDesc, isEn, descExpanded])

  // روابط التواصل — تُعرض 3 فقط ثم زر «+N» يوسّع الباقي (وضغطة أخرى تطويه)
  const [socialExpanded, setSocialExpanded] = useState(false)
  const showSocial = (restaurant.show_social_links ?? true) && restaurant.social_links
  const socialKeys = showSocial
    ? ['instagram', 'whatsapp_social', 'snapchat', 'twitter', 'tiktok'].filter(key => restaurant.social_links[key])
    : []
  const shownSocialKeys = socialExpanded ? socialKeys : socialKeys.slice(0, 3)
  const hiddenSocialCount = socialKeys.length - shownSocialKeys.length
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
    ...(deliveryEnabled ? [{
      value: Number(deliveryFee) > 0 ? `${Number(deliveryFee).toFixed(0)} ﷼` : (isEn ? 'Free' : 'مجاني'),
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
        <button onClick={toggleLang} style={{ position:'absolute', top:'12px', left:'14px', width:'40px', height:'40px', borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.95)', boxShadow:'0 4px 14px rgba(0,0,0,0.28)', cursor:'pointer', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', color:'#374151', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {isEn ? 'ع' : 'EN'}
        </button>

        {/* زر البحث — عائم بجانب زر اللغة (أفقياً)، يفتح شاشة البحث المستقلة */}
        <button onClick={onToggleSearch} aria-label={isEn ? 'Search' : 'بحث'} style={{ position:'absolute', top:'12px', left:'62px', width:'40px', height:'40px', borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.95)', color:'#374151', boxShadow:'0 4px 14px rgba(0,0,0,0.28)', cursor:'pointer', fontSize:'16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
          🔍
        </button>

        {/* زر طلباتي — عائم بعداد حي */}
        {hasOrders && (
          <button onClick={onShowOrders} style={{ position:'absolute', top:'12px', right:'14px', padding:'10px 15px', borderRadius:'100px', border:'none', background:brandColor, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', boxShadow:`0 6px 18px ${brandColor}66` }}>
            📋 {t('myOrders')}
            {liveOrdersCount > 0 && (
              <span style={{ background:'rgba(255,255,255,0.3)', borderRadius:'100px', padding:'1px 7px', fontSize:'11px' }}>{liveOrdersCount}</span>
            )}
          </button>
        )}
      </div>

      {/* ===== البطاقة العائمة فوق الهيرو (هوامش جانبية + زوايا مدوّرة) — تدفّق طبيعي، تنزلق للأعلى ===== */}
      <div style={{ position:'relative', zIndex:10, margin:'-76px 16px 0', background:'rgba(255,255,255,0.82)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderRadius:'22px', boxShadow:'0 10px 30px rgba(15,17,23,0.16)' }}>

        {/* رأس البطاقة (شعار + اسم + تقييم + حالة الفتح) — تدفّق طبيعي ضمن البطاقة، ينزلق مع الصفحة.
            التثبيت الدائم يتكفّل به «الهيدر المصغّر» المنفصل أدناه (لتفادي التعارض مع شريط الأقسام). */}
        <div style={{ paddingTop:'4px' }}>
          {/* مقبض السحب */}
          <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'100px', margin:'0 auto 4px' }}/>

          {/* الهوية: شعار + اسم + تقييم + حالة الفتح */}
          <div style={{ display:'flex', alignItems:'center', gap:'11px', padding:'0 16px 5px' }}>
            <div style={{ width:'52px', height:'52px', borderRadius:'15px', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'25px', flexShrink:0, overflow:'hidden', boxShadow:'0 5px 14px rgba(15,17,23,0.18)' }}>
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
        {/* وصف المطعم — يكتبه صاحب المطعم من الإعدادات (يدعم الترجمة)، يُعرض بسطرين مع «عرض المزيد» */}
        {(restaurant.show_description ?? true) && fullDesc && (
          <div style={{ margin:'2px 16px 0' }}>
            <p ref={descRef} style={{
              fontSize:'12.5px', color:descColor, lineHeight:'1.45', margin:0,
              ...(descExpanded ? {} : { display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }),
            }}>{fullDesc}</p>
            {(descOverflows || descExpanded) && (
              <button onClick={() => setDescExpanded(v => !v)} style={{ border:'none', background:'none', padding:'2px 0 0', color:brandColor, fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'11.5px', cursor:'pointer' }}>
                {descExpanded ? (isEn ? 'Show less' : 'عرض أقل') : (isEn ? 'Show more' : 'عرض المزيد')}
              </button>
            )}
          </div>
        )}

        {/* الموقع + رابط الخريطة */}
        {(() => {
          const addr = branch?.address || restaurant.address
          const mapsUrl = branch?.maps_url || restaurant.maps_url
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
        {(socialKeys.length > 0 || ((restaurant.show_allergens ?? true) && Array.isArray(restaurant.allergens) && restaurant.allergens.length > 0)) && (
          <div style={{ display:'flex', alignItems:'center', gap:'6px', margin:'2px 16px 0', flexWrap:'nowrap', overflowX:'auto' }}>
            {shownSocialKeys.map(key => {
              const Icon = SOCIAL_ICONS[key]
              return (
                <a key={key} href={restaurant.social_links[key]} target="_blank" rel="noopener noreferrer"
                  style={{ width:'28px', height:'28px', flexShrink:0, borderRadius:'50%', background:'white', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', boxShadow:'0 2px 6px rgba(0,0,0,0.06)', overflow:'hidden' }}>
                  <Icon/>
                </a>
              )
            })}
            {(hiddenSocialCount > 0 || socialExpanded) && socialKeys.length > 3 && (
              <button onClick={() => setSocialExpanded(v => !v)} aria-label={isEn ? 'More links' : 'روابط أكثر'}
                style={{ width:'28px', height:'28px', flexShrink:0, borderRadius:'50%', background:'#F3F4F6', border:'1.5px solid #E5E7EB', color:'#374151', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'11px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {socialExpanded ? '−' : `+${hiddenSocialCount}`}
              </button>
            )}
            {(restaurant.show_allergens ?? true) && Array.isArray(restaurant.allergens) && restaurant.allergens.length > 0 && (
              <button onClick={onShowAllergens} style={{ display:'flex', alignItems:'center', gap:'4px', flexShrink:0, whiteSpace:'nowrap', padding:'5px 9px', borderRadius:'100px', border:'1.5px solid #FDE68A', background:'#FFFBEB', color:'#92400E', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'10.5px', cursor:'pointer' }}>
                ⚠️ {t('allergens')}
              </button>
            )}
          </div>
        )}

        {/* بطاقة الإحصائيات: الحالة · التجهيز · التوصيل */}
        <div style={{ display:'flex', margin:'2px 14px 2px', background:'#F8F9FB', border:'1px solid #EEF0F4', borderRadius:'13px', padding:'3px 4px' }}>
          {statCells.map((c, i) => (
            <div key={i} style={{ flex:1, textAlign:'center', borderRight: i > 0 ? '1px solid #E9ECF1' : 'none', padding:'0 4px' }}>
              <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'12px', color:c.color, whiteSpace:'nowrap' }}>{c.value}</div>
              {c.sub && <div style={{ fontSize:'9px', color:'#9CA3AF', fontWeight:'700', marginTop:'2px', direction: c.ltr ? 'ltr' : 'rtl' }}>{c.sub}</div>}
            </div>
          ))}
        </div>

        {/* شريط ترويجي مضغوط — خانة واحدة فقط، بلا ازدحام، قابل للإغلاق لهذه الجلسة */}
        {!promoDismissed && activePromo && (
          <div style={{ margin:'0 14px 4px' }}>
            {activePromo.type === 'banner' ? (
              <div style={{ display:'flex', alignItems:'center', gap:'8px', background:`linear-gradient(120deg, ${brandColor}, ${brandColor}CC)`, borderRadius:'13px', padding:'10px 10px 10px 12px', color:'white' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12.5px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{activePromo.data.title}</div>
                  {activePromo.data.subtitle && <div style={{ fontSize:'11px', opacity:0.9, marginTop:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{activePromo.data.subtitle}</div>}
                </div>
                <button onClick={() => setPromoDismissed(true)} aria-label={isEn ? 'Dismiss' : 'إغلاق'} style={{ flexShrink:0, width:'22px', height:'22px', borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.25)', color:'white', fontSize:'12px', cursor:'pointer' }}>✕</button>
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'center', gap:'8px', background:`${brandColor}12`, border:`1.5px dashed ${brandColor}`, borderRadius:'13px', padding:'9px 10px 9px 12px' }}>
                <span style={{ fontSize:'16px', flexShrink:0 }}>🎟️</span>
                <span style={{ flex:1, fontSize:'12px', fontWeight:'700', color:'#0F1117', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {isEn
                    ? `Code ${activePromo.data.code}: ${activePromo.data.discount_type === 'percent' ? activePromo.data.discount_value + '% off' : activePromo.data.discount_value + ' SAR off'}`
                    : `كود ${activePromo.data.code}: خصم ${activePromo.data.discount_type === 'percent' ? activePromo.data.discount_value + '%' : activePromo.data.discount_value + ' ﷼'}`}
                </span>
                <button onClick={() => setPromoDismissed(true)} aria-label={isEn ? 'Dismiss' : 'إغلاق'} style={{ flexShrink:0, width:'22px', height:'22px', borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.06)', color:'#6B7280', fontSize:'12px', cursor:'pointer' }}>✕</button>
              </div>
            )}
          </div>
        )}

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
            <div onClick={onShowOrders} style={{ margin:'0 14px 3px', background:`linear-gradient(120deg, ${brandColor}16, ${brandColor}08)`, border:`1px solid ${brandColor}30`, borderRadius:'12px', padding:'4px 10px', display:'flex', alignItems:'center', gap:'7px', cursor:'pointer' }}>
              <span style={{ fontSize:'13px' }}>🎁</span>
              <span style={{ flex:1, fontSize:'11px', fontWeight:'800', color:'#0F1117', fontFamily:'Cairo,sans-serif' }}>{text}</span>
              <span style={{ fontSize:'9.5px', fontWeight:'800', color:brandColor, whiteSpace:'nowrap' }}>{isEn ? 'Details ›' : 'التفاصيل ›'}</span>
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
        {/* زر البحث — متاح دائماً من الهيدر المصغّر الدائم، بغضّ النظر عن موضع التمرير */}
        <button onClick={onToggleSearch} aria-label={isEn ? 'Search' : 'بحث'} style={{ flexShrink:0, width:'38px', height:'38px', borderRadius:'50%', border:'none', background:'#F3F4F6', color:'#374151', cursor:'pointer', fontSize:'15px', display:'flex', alignItems:'center', justifyContent:'center' }}>
          🔍
        </button>
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
