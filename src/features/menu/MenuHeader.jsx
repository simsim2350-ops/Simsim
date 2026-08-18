import { useEffect, useRef, useState } from 'react'
import { SOCIAL_ICONS } from './SocialIcons'
import { estimatedPrepTime } from './helpers'
import { OffersIcon } from './MenuOffersDrawer'

// أبعاد الهيرو تُدار الآن عبر Hero Design Tokens في PublicMenu (متغيّرات CSS --hero-*).
const clamp01 = v => Math.min(1, Math.max(0, v))

// هيدر المنيو — الهندسة الجديدة (مستلهمة من تطبيقات التوصيل):
// هيرو مصوّر بكامل العرض + أزرار عائمة، ثم ورقة بيضاء بزوايا دائرية تحوي:
// الهوية (شعار/اسم/فرع مع تغيير) + الوصف + الموقع + التواصل + بطاقة الإحصائيات + البحث
export default function MenuHeader({
  restaurant, branch, brandColor, descColor, openStatus, deliveryEnabled, deliveryFee, activeOrdersCount,
  isEn, t, tx, toggleLang,
  hasOrders, liveOrdersCount, onShowOrders, onShowAllergens,
  onToggleSearch, hasOffers = false, offersCount = 0, onShowOffers,
  rating, loyalty,
}) {
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
    ? ['instagram', 'whatsapp_social', 'snapchat'].filter(key => restaurant.social_links[key])
    : []
  const shownSocialKeys = socialExpanded ? socialKeys : socialKeys.slice(0, 3)
  const hiddenSocialCount = socialKeys.length - shownSocialKeys.length
  // [META · المستوى 2] الموقع · التجهيز · التوصيل · الساعات — صف واحد مضغوط بدل بطاقة الإحصائيات
  const addr = branch?.address || restaurant.address
  const mapsUrl = branch?.maps_url || restaurant.maps_url
  const hoursDetail = (restaurant?.show_hours ?? true)
    ? (openStatus.open ? (!openStatus.unknown && openStatus.todayText ? openStatus.todayText : '') : (openStatus.nextText || ''))
    : ''
  const metaItems = [
    ...(addr ? [{ icon: '📍', text: addr, color: '#6B7280', grow: true }] : []),
    ...((restaurant?.show_prep_time ?? true) ? [{ icon: '⏱️', text: `${estimatedPrepTime(activeOrdersCount)} ${t('minShort')}`, color: '#374151' }] : []),
    ...(deliveryEnabled ? [{ icon: '🚚', text: Number(deliveryFee) > 0 ? `${Number(deliveryFee).toFixed(0)} ﷼` : (isEn ? 'Free' : 'مجاني'), color: '#374151' }] : []),
    ...(hoursDetail ? [{ icon: '🕐', text: hoursDetail, color: openStatus.open ? '#10B981' : '#EF4444', ltr: openStatus.open }] : []),
  ]
  // [المستوى 3] تظهر مكافأة الولاء والعروض الحقيقية كمعلومات مستقلة ومضغوطة.
  const showLoyalty = !!loyalty
  const utilitySide = isEn ? 'right' : 'left'
  const ordersSide = isEn ? 'left' : 'right'

  return (
    <>
      {/* لماذا Fragment لا <div>: البطاقة/الهوية sticky تبقى ملتصقة فقط بحدود أقرب حاوية أب لها —
          بالـ Fragment تصبح شقيقة مباشرة لـ MenuBody داخل نفس حاوية الصفحة الطويلة في PublicMenu،
          فتبقى الهوية ملتصقة طوال منطقة البطاقة بدل أن تنفلت وتختفي بعد مسافة قصيرة. */}

      {/* ===== الهيرو: مثبّت على الشاشة (fixed) فلا يتحرك، والبطاقة تنزلق فوقه، ثم يتلاشى تدريجياً ===== */}
      <div style={{ height:'var(--hero-image-h)' }}/>
      <div style={{
        position:'fixed', top:0, left:'50%', transform:'translateX(-50%)',
        width:'100%', maxWidth:'480px', height:'var(--hero-image-h)', zIndex:5,
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
        <button onClick={toggleLang} style={{ position:'absolute', top:'12px', [utilitySide]:'14px', width:'40px', height:'40px', borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.95)', boxShadow:'0 4px 14px rgba(0,0,0,0.28)', cursor:'pointer', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'12px', color:'#374151', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {isEn ? 'ع' : 'EN'}
        </button>

        {/* زر البحث — عائم بجانب زر اللغة (أفقياً)، يفتح شاشة البحث المستقلة */}
        <button onClick={onToggleSearch} aria-label={isEn ? 'Search' : 'بحث'} style={{ position:'absolute', top:'12px', [utilitySide]:'62px', width:'40px', height:'40px', borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.95)', color:'#374151', boxShadow:'0 4px 14px rgba(0,0,0,0.28)', cursor:'pointer', fontSize:'16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
          🔍
        </button>

        {/* زر العروض — لا يظهر إلا عند وجود بانر أو كوبون نشط */}
        {hasOffers && <button type="button" onClick={onShowOffers} aria-label={isEn ? 'Open offers and coupons' : 'فتح العروض والكوبونات'} style={{ position:'absolute', top:'12px', [utilitySide]:'110px', width:'40px', height:'40px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.95)', color:brandColor, boxShadow:'0 4px 14px rgba(0,0,0,0.28)', cursor:'pointer' }}><OffersIcon size={18} />{offersCount > 0 && <span aria-label={`${offersCount}`} style={{ position:'absolute', top:'-3px', [isEn ? 'left' : 'right']:'-3px', minWidth:'16px', height:'16px', display:'grid', placeItems:'center', borderRadius:'999px', padding:'0 3px', background:brandColor, color:'white', border:'2px solid white', fontSize:'9px', fontFamily:'Tajawal,sans-serif', fontWeight:'900' }}>{offersCount > 9 ? '9+' : offersCount}</span>}</button>}

        {/* زر طلباتي — عائم بعداد حي */}
        {hasOrders && (
          <button onClick={onShowOrders} style={{ position:'absolute', top:'12px', [ordersSide]:'14px', padding:'10px 15px', borderRadius:'100px', border:'none', background:brandColor, color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', boxShadow:`0 6px 18px ${brandColor}66` }}>
            📋 {t('myOrders')}
            {liveOrdersCount > 0 && (
              <span style={{ background:'rgba(255,255,255,0.3)', borderRadius:'100px', padding:'1px 7px', fontSize:'11px' }}>{liveOrdersCount}</span>
            )}
          </button>
        )}
      </div>

      {/* ===== البطاقة العائمة فوق الهيرو (هوامش جانبية + زوايا مدوّرة) — تدفّق طبيعي، تنزلق للأعلى ===== */}
      <div style={{ position:'relative', zIndex:10, margin:'calc(var(--hero-overlap) * -1) var(--hero-pad-x) 0', paddingBottom:'var(--hero-pad-bottom)', background:'rgba(255,255,255,0.72)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderRadius:'var(--hero-radius)', boxShadow:'0 10px 30px rgba(15,17,23,0.16)' }}>

        {/* ===== [HEADER] الشعار + الاسم + التقييم + الحالة — هندسته ثابتة (تُبقي عتبات الـMorph صحيحة) ===== */}
        {/* التثبيت الدائم يتكفّل به «الهيدر المصغّر» المنفصل أدناه (لتفادي التعارض مع شريط الأقسام). */}
        <div style={{ paddingTop:'4px' }}>
          {/* مقبض السحب */}
          <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'100px', margin:'0 auto 4px' }}/>

          {/* الهوية: شعار + اسم + تقييم + حالة الفتح */}
          <div style={{ display:'flex', alignItems:'center', gap:'11px', padding:'0 16px 5px' }}>
            <div style={{ width:'var(--hero-logo)', height:'var(--hero-logo)', borderRadius:'15px', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'25px', flexShrink:0, overflow:'hidden', boxShadow:'0 5px 14px rgba(15,17,23,0.18)' }}>
              {restaurant.logo_url
                ? <img src={restaurant.logo_url} alt={restaurant.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : '🍕'}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <h1 style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'19px', color:'#0B0B0F', margin:0 }}>{restaurant.name}</h1>
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

        {/* ===== [CONTENT + FOOTER] محتوى مرن (Dynamic) — كل قسم يظهر بمحتواه فقط؛ المسافات عبر gap تنطوي بلا فراغات ===== */}
        <div style={{ display:'flex', flexDirection:'column', gap:'var(--hero-spacing)', padding:'0 var(--hero-pad-x)', marginTop:'var(--hero-spacing)' }}>

          {/* [META · المستوى 2] الموقع · التجهيز · التوصيل · الساعات — صف واحد مضغوط */}
          {(metaItems.length > 0 || mapsUrl) && (
            <div style={{ display:'flex', alignItems:'center', gap:'4px 12px', flexWrap:'wrap' }}>
              {metaItems.map((m, i) => (
                <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:'4px', minWidth:0, ...(m.grow ? { flex:'1 1 auto' } : {}), fontSize:'12px', fontWeight:'700', color:m.color, ...(m.ltr ? { direction:'ltr' } : {}) }}>
                  <span>{m.icon}</span>
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%' }}>{m.text}</span>
                </span>
              ))}
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ flexShrink:0, fontSize:'11px', fontWeight:'700', color:brandColor, background:`${brandColor}14`, padding:'3px 10px', borderRadius:'100px', textDecoration:'none' }}>
                  {t('mapBtn')}
                </a>
              )}
            </div>
          )}

          {/* [DESC · المستوى 2] وصف المطعم — سطران مع «عرض المزيد» */}
          {(restaurant.show_description ?? true) && fullDesc && (
            <div>
              <p ref={descRef} style={{
                fontSize:'12.5px', color:descColor, lineHeight:'1.45', margin:0,
                ...(descExpanded ? {} : { display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }),
              }}>{fullDesc}</p>
              {(descOverflows || descExpanded) && (
                <button onClick={() => setDescExpanded(v => !v)} style={{ border:'none', background:'none', padding:'2px 0 0', color:brandColor, fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'11.5px', cursor:'pointer' }}>
                  {descExpanded ? (isEn ? 'Show less' : 'عرض أقل') : (isEn ? 'Show more' : 'عرض المزيد')}
                </button>
              )}
            </div>
          )}

          {/* [ACTIONS · المستوى 3] اتصال + تواصل + مسبّبات — صف أفقي واحد قابل للتمرير */}
          {(restaurant.phone || socialKeys.length > 0 || ((restaurant.show_allergens ?? true) && Array.isArray(restaurant.allergens) && restaurant.allergens.length > 0)) && (
            <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'nowrap', overflowX:'auto' }}>
              {restaurant.phone && (
                <a href={`tel:${restaurant.phone}`} aria-label={isEn ? 'Call' : 'اتصال'}
                  style={{ width:'var(--hero-social)', height:'var(--hero-social)', flexShrink:0, borderRadius:'50%', background:'white', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', boxShadow:'0 2px 6px rgba(0,0,0,0.06)', fontSize:'13px' }}>📞</a>
              )}
              {shownSocialKeys.map(key => {
                const Icon = SOCIAL_ICONS[key]
                return (
                  <a key={key} href={restaurant.social_links[key]} target="_blank" rel="noopener noreferrer"
                    style={{ width:'var(--hero-social)', height:'var(--hero-social)', flexShrink:0, borderRadius:'50%', background:'white', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', boxShadow:'0 2px 6px rgba(0,0,0,0.06)', overflow:'hidden' }}>
                    <Icon/>
                  </a>
                )
              })}
              {(hiddenSocialCount > 0 || socialExpanded) && socialKeys.length > 3 && (
                <button onClick={() => setSocialExpanded(v => !v)} aria-label={isEn ? 'More links' : 'روابط أكثر'}
                  style={{ width:'var(--hero-social)', height:'var(--hero-social)', flexShrink:0, borderRadius:'50%', background:'#F3F4F6', border:'1.5px solid #E5E7EB', color:'#374151', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'11px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {socialExpanded ? '−' : `+${hiddenSocialCount}`}
                </button>
              )}
              {/* المسبّبات — في نفس صف التواصل */}
              {(restaurant.show_allergens ?? true) && Array.isArray(restaurant.allergens) && restaurant.allergens.length > 0 && (
                <button onClick={onShowAllergens} style={{ display:'flex', alignItems:'center', gap:'4px', flexShrink:0, whiteSpace:'nowrap', padding:'5px 9px', borderRadius:'100px', border:'1.5px solid #FDE68A', background:'#FFFBEB', color:'#92400E', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'10.5px', cursor:'pointer' }}>
                  ⚠️ {t('allergens')}
                </button>
              )}
            </div>
          )}

          {/* [LOYALTY · المستوى 3] معلومات الولاء تبقى مستقلة عن العروض */}
          {showLoyalty && (() => {
            const threshold = loyalty.reward_threshold || 0
            const balance = loyalty.balance || 0
            const ready = threshold > 0 && balance >= threshold
            const text = ready
              ? (isEn ? `Your reward is ready: ${loyalty.reward_description || t('rewardDefault')} 🎉` : `مكافأتك جاهزة: ${loyalty.reward_description || t('rewardDefault')} 🎉`)
              : threshold > 0
                ? (isEn ? `Your points: ${balance} — ${Math.max(0, threshold - balance)} pts to your reward` : `نقاطك: ${balance} — باقي ${Math.max(0, threshold - balance)} نقطة على مكافأتك`)
                : (isEn ? `Your points: ${balance}` : `نقاطك: ${balance}`)
            return <div onClick={onShowOrders} style={{ background:`linear-gradient(120deg, ${brandColor}16, ${brandColor}08)`, border:`1px solid ${brandColor}30`, borderRadius:'12px', padding:'6px 10px', display:'flex', alignItems:'center', gap:'7px', cursor:'pointer' }}><span style={{ fontSize:'13px' }}>🎁</span><span style={{ flex:1, fontSize:'11px', fontWeight:'800', color:'#0B0B0F', fontFamily:'Tajawal,sans-serif' }}>{text}</span><span style={{ fontSize:'9.5px', fontWeight:'800', color:brandColor, whiteSpace:'nowrap' }}>{isEn ? 'Details ›' : 'التفاصيل ›'}</span></div>
          })()}
        </div>

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
          <div style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'15px', color:'#0B0B0F', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{restaurant.name}</div>
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
        {hasOffers && <button type="button" onClick={onShowOffers} aria-label={isEn ? 'Open offers and coupons' : 'فتح العروض والكوبونات'} style={{ flexShrink:0, width:'38px', height:'38px', display:'grid', placeItems:'center', borderRadius:'50%', border:'none', background:`${brandColor}14`, color:brandColor, cursor:'pointer', position:'relative' }}><OffersIcon size={17} />{offersCount > 0 && <span aria-label={`${offersCount}`} style={{ position:'absolute', top:'-2px', right:'-2px', minWidth:'15px', height:'15px', display:'grid', placeItems:'center', borderRadius:'999px', padding:'0 2px', background:brandColor, color:'white', border:'1.5px solid white', fontSize:'8.5px', fontFamily:'Tajawal,sans-serif', fontWeight:'900' }}>{offersCount > 9 ? '9+' : offersCount}</span>}</button>}
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
