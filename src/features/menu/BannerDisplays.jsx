import { useEffect, useMemo, useRef, useState } from 'react'

const DISPLAY_MODES = ['fullscreen', 'popup', 'top', 'inline', 'floating']

function BannerIcon({ type = 'spark', size = 18 }) {
  const paths = {
    close: 'm18 6-12 12M6 6l12 12',
    spark: 'm12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2z',
    arrow: 'm9 18 6-6-6-6',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[type]} /></svg>
}

const normalizeMode = banner => DISPLAY_MODES.includes(banner?.display_mode) ? banner.display_mode : 'top'
const normalizeFrequency = banner => ['every_visit', 'once_per_visitor', 'delayed'].includes(banner?.display_frequency) ? banner.display_frequency : 'every_visit'
const safeNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback

function useBannerDisplayState({ banners, restaurantId, branchId }) {
  const [visibleIds, setVisibleIds] = useState(() => new Set())
  const [fullscreenBanner, setFullscreenBanner] = useState(null)
  const [popupBanner, setPopupBanner] = useState(null)
  const presentedRef = useRef(new Set())

  useEffect(() => {
    setVisibleIds(new Set())
    setFullscreenBanner(null)
    setPopupBanner(null)
    presentedRef.current = new Set()
  }, [restaurantId, branchId])

  useEffect(() => {
    if (!restaurantId || !banners.length) return undefined
    const timers = []
    const modesAlreadyScheduled = new Set()
    const sorted = [...banners].sort((a, b) => safeNumber(b.display_priority) - safeNumber(a.display_priority) || safeNumber(a.sort_order) - safeNumber(b.sort_order))

    const seenKey = banner => `simsim_banner_seen_${restaurantId}_${banner.id}`
    const shouldSkipForVisitor = (banner) => {
      if (normalizeFrequency(banner) !== 'once_per_visitor') return false
      try {
        const seenAt = Number(localStorage.getItem(seenKey(banner)) || 0)
        const cooldownMs = Math.max(1, safeNumber(banner.visitor_cooldown_hours, 24)) * 60 * 60 * 1000
        return seenAt > 0 && Date.now() - seenAt < cooldownMs
      } catch {
        return false
      }
    }
    const markSeen = (banner) => {
      if (normalizeFrequency(banner) !== 'once_per_visitor') return
      try { localStorage.setItem(seenKey(banner), String(Date.now())) } catch { /* التخزين المحلي اختياري */ }
    }
    const present = (banner) => {
      const key = `${restaurantId}:${branchId || 'all'}:${banner.id}`
      if (presentedRef.current.has(key)) return
      presentedRef.current.add(key)
      markSeen(banner)
      setVisibleIds(previous => new Set([...previous, banner.id]))
      const mode = normalizeMode(banner)
      if (mode === 'fullscreen') setFullscreenBanner(banner)
      if (mode === 'popup') setPopupBanner(banner)
    }

    sorted.forEach(banner => {
      const mode = normalizeMode(banner)
      if (modesAlreadyScheduled.has(mode) || shouldSkipForVisitor(banner)) return
      modesAlreadyScheduled.add(mode)
      const delay = normalizeFrequency(banner) === 'delayed' ? Math.min(300, Math.max(0, safeNumber(banner.display_delay_seconds))) * 1000 : 0
      if (delay > 0) timers.push(window.setTimeout(() => present(banner), delay))
      else present(banner)
    })

    return () => timers.forEach(timer => window.clearTimeout(timer))
  }, [banners, restaurantId, branchId])

  const visibleByMode = useMemo(() => {
    const values = {}
    banners.forEach(banner => {
      if (!visibleIds.has(banner.id)) return
      const mode = normalizeMode(banner)
      if (!values[mode]) values[mode] = banner
    })
    return values
  }, [banners, visibleIds])

  return {
    topBanner: visibleByMode.top || null,
    inlineBanner: visibleByMode.inline || null,
    floatingBanner: visibleByMode.floating || null,
    fullscreenBanner,
    popupBanner,
    dismissFullscreen: () => setFullscreenBanner(null),
    dismissPopup: () => setPopupBanner(null),
  }
}

function BannerImage({ banner, compact = false }) {
  return banner.image_url
    ? <img src={banner.image_url} alt={banner.title} style={{ width:compact ? '54px' : '100%', height:compact ? '44px' : '100%', borderRadius:compact ? '10px' : 'inherit', objectFit:'cover', display:'block', flexShrink:0 }} />
    : <span style={{ width:compact ? '54px' : '100%', height:compact ? '44px' : '100%', display:'grid', placeItems:'center', color:'#FF6A00', background:'#FFF0EB', borderRadius:compact ? '10px' : 'inherit', flexShrink:0 }}><BannerIcon size={compact ? 19 : 32} /></span>
}

function OfferCopy({ banner, color = '#101828' }) {
  return <div style={{ minWidth:0, flex:1 }}>
    <div style={{ color, fontSize:'14px', fontWeight:'900', fontFamily:'Tajawal,sans-serif', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{banner.title}</div>
    {banner.subtitle && <div style={{ color:color === 'white' ? 'rgba(255,255,255,.78)' : '#667085', marginTop:'3px', fontSize:'11px', lineHeight:1.45, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{banner.subtitle}</div>}
  </div>
}

function FullscreenOffer({ banner, brandColor, onDismiss }) {
  return <div role="dialog" aria-modal="true" aria-label={`عرض ${banner.title}`} style={{ position:'fixed', inset:0, zIndex:140, display:'flex', alignItems:'center', justifyContent:'center', direction:'rtl', background:'rgba(11,11,15,.94)', padding:'20px' }}>
    <section style={{ width:'100%', maxWidth:'420px', overflow:'hidden', borderRadius:'24px', background:'white', boxShadow:'0 24px 70px rgba(0,0,0,.42)' }}>
      <div style={{ position:'relative', minHeight:'190px', background:`linear-gradient(145deg, ${brandColor}, ${brandColor}BB)` }}>
        {banner.image_url && <img src={banner.image_url} alt={banner.title} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />}
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(0,0,0,.03), rgba(0,0,0,.44))' }} />
        <button type="button" onClick={onDismiss} aria-label="الدخول إلى المينيو" style={{ position:'absolute', top:'12px', left:'12px', width:'38px', height:'38px', display:'grid', placeItems:'center', borderRadius:'50%', border:'1px solid rgba(255,255,255,.34)', background:'rgba(0,0,0,.2)', color:'white', cursor:'pointer' }}><BannerIcon type="close" size={18} /></button>
        <div style={{ position:'absolute', right:'18px', left:'18px', bottom:'18px', color:'white' }}><div style={{ fontFamily:'Tajawal,sans-serif', fontSize:'23px', lineHeight:1.25, fontWeight:'900' }}>{banner.title}</div>{banner.subtitle && <div style={{ marginTop:'5px', fontSize:'13px', lineHeight:1.55, opacity:.9 }}>{banner.subtitle}</div>}</div>
      </div>
      <div style={{ display:'grid', gap:'8px', padding:'14px' }}>
        <button type="button" onClick={onDismiss} style={{ minHeight:'46px', border:'none', borderRadius:'12px', background:brandColor, color:'white', fontFamily:'Tajawal,sans-serif', fontSize:'14px', fontWeight:'900', cursor:'pointer' }}>{banner.cta_text || 'اطلب الآن'}</button>
        <button type="button" onClick={onDismiss} style={{ minHeight:'44px', border:'1px solid #D0D5DD', borderRadius:'12px', background:'white', color:'#344054', fontFamily:'Tajawal,sans-serif', fontSize:'13px', fontWeight:'900', cursor:'pointer' }}>الدخول إلى المينيو</button>
      </div>
    </section>
  </div>
}

function PopupOffer({ banner, brandColor, onDismiss }) {
  return <div role="dialog" aria-modal="true" aria-label={`عرض ${banner.title}`} onClick={onDismiss} style={{ position:'fixed', inset:0, zIndex:130, display:'flex', alignItems:'center', justifyContent:'center', direction:'rtl', background:'rgba(16,24,40,.48)', padding:'20px' }}>
    <section onClick={event => event.stopPropagation()} style={{ width:'100%', maxWidth:'380px', overflow:'hidden', borderRadius:'20px', background:'white', boxShadow:'0 20px 50px rgba(16,24,40,.24)' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'14px 14px 10px' }}><BannerImage banner={banner} compact /><OfferCopy banner={banner} /><button type="button" onClick={onDismiss} aria-label="إغلاق العرض" style={{ width:'32px', height:'32px', display:'grid', placeItems:'center', flexShrink:0, borderRadius:'9px', border:'1px solid #E4E7EC', background:'white', color:'#667085', cursor:'pointer' }}><BannerIcon type="close" size={15} /></button></div>
      <div style={{ padding:'0 14px 14px' }}><button type="button" onClick={onDismiss} style={{ width:'100%', minHeight:'42px', border:'none', borderRadius:'10px', background:brandColor, color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'13px', cursor:'pointer' }}>{banner.cta_text || 'اطلب الآن'}</button></div>
    </section>
  </div>
}

function DetailOffer({ banner, brandColor, onClose }) {
  return <div role="dialog" aria-modal="true" aria-label={`تفاصيل ${banner.title}`} onClick={onClose} style={{ position:'fixed', inset:0, zIndex:130, display:'flex', alignItems:'flex-end', justifyContent:'center', direction:'rtl', background:'rgba(16,24,40,.48)' }}>
    <section onClick={event => event.stopPropagation()} style={{ width:'100%', maxWidth:'480px', overflow:'hidden', borderRadius:'22px 22px 0 0', background:'white', padding:'14px 16px calc(18px + env(safe-area-inset-bottom))' }}>
      <div style={{ width:'40px', height:'4px', margin:'0 auto 12px', borderRadius:'999px', background:'#D0D5DD' }} />
      <div style={{ display:'flex', gap:'11px', alignItems:'flex-start' }}><BannerImage banner={banner} compact /><OfferCopy banner={banner} /><button type="button" onClick={onClose} aria-label="إغلاق" style={{ width:'34px', height:'34px', display:'grid', placeItems:'center', flexShrink:0, borderRadius:'9px', border:'1px solid #E4E7EC', background:'white', color:'#667085', cursor:'pointer' }}><BannerIcon type="close" size={16} /></button></div>
      <button type="button" onClick={onClose} style={{ width:'100%', minHeight:'44px', marginTop:'14px', border:'none', borderRadius:'11px', background:brandColor, color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'13px', cursor:'pointer' }}>{banner.cta_text || 'اطلب الآن'}</button>
    </section>
  </div>
}

export function useMenuBannerDisplay(banners, restaurantId, branchId) {
  return useBannerDisplayState({ banners, restaurantId, branchId })
}

export function TopMenuBanner({ banner, brandColor }) {
  const [expanded, setExpanded] = useState(false)
  if (!banner) return null
  return <section style={{ margin:'10px 16px 2px', padding:'10px', display:'flex', alignItems:'center', gap:'9px', borderRadius:'13px', background:`linear-gradient(120deg, ${brandColor}18, ${brandColor}0A)`, border:`1px solid ${brandColor}35` }}><span style={{ width:'32px', height:'32px', display:'grid', placeItems:'center', flexShrink:0, borderRadius:'9px', background:brandColor, color:'white' }}><BannerIcon size={16} /></span><OfferCopy banner={banner} /><button type="button" onClick={() => setExpanded(true)} style={{ minHeight:'34px', padding:'6px 8px', flexShrink:0, border:'none', borderRadius:'9px', background:'white', color:brandColor, fontFamily:'Tajawal,sans-serif', fontSize:'11px', fontWeight:'900', cursor:'pointer' }}>عرض</button>{expanded && <DetailOffer banner={banner} brandColor={brandColor} onClose={() => setExpanded(false)} />}</section>
}

export function InlineMenuBanner({ banner, brandColor }) {
  const [expanded, setExpanded] = useState(false)
  if (!banner) return null
  return <><section style={{ margin:'12px 16px 4px', overflow:'hidden', borderRadius:'15px', background:'white', border:`1px solid ${brandColor}35`, boxShadow:'0 4px 12px rgba(16,24,40,.04)' }}><div style={{ display:'flex', gap:'10px', alignItems:'center', padding:'10px' }}><BannerImage banner={banner} compact /><OfferCopy banner={banner} /><button type="button" onClick={() => setExpanded(true)} aria-label={`عرض ${banner.title}`} style={{ width:'36px', height:'36px', display:'grid', placeItems:'center', flexShrink:0, border:'none', borderRadius:'10px', background:brandColor, color:'white', cursor:'pointer' }}><BannerIcon type="arrow" size={16} /></button></div></section>{expanded && <DetailOffer banner={banner} brandColor={brandColor} onClose={() => setExpanded(false)} />}</>
}

export function FloatingMenuBanner({ banner, brandColor }) {
  const [expanded, setExpanded] = useState(false)
  if (!banner) return null
  return <>{expanded && <DetailOffer banner={banner} brandColor={brandColor} onClose={() => setExpanded(false)} />}<button type="button" onClick={() => setExpanded(true)} aria-label={`عرض ${banner.title}`} style={{ position:'fixed', left:'max(16px, calc(50% - 224px))', bottom:'92px', zIndex:45, maxWidth:'180px', minHeight:'42px', display:'flex', alignItems:'center', gap:'6px', padding:'8px 10px', border:'none', borderRadius:'999px', background:brandColor, color:'white', boxShadow:`0 8px 22px ${brandColor}66`, fontFamily:'Tajawal,sans-serif', fontSize:'11px', fontWeight:'900', cursor:'pointer' }}><span style={{ width:'24px', height:'24px', display:'grid', placeItems:'center', flexShrink:0, borderRadius:'50%', background:'rgba(255,255,255,.2)' }}><BannerIcon size={13} /></span><span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{banner.title}</span></button></>
}

export function MenuBannerOverlays({ fullscreenBanner, popupBanner, brandColor, onDismissFullscreen, onDismissPopup }) {
  return <>{fullscreenBanner && <FullscreenOffer banner={fullscreenBanner} brandColor={brandColor} onDismiss={onDismissFullscreen} />}{popupBanner && <PopupOffer banner={popupBanner} brandColor={brandColor} onDismiss={onDismissPopup} />}</>
}
