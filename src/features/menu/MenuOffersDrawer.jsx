import { useEffect, useState } from 'react'

import ResponsiveMenuImage from './ResponsiveMenuImage'

export function OffersIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M3 12h18M12 7v10M7.5 7a2.25 2.25 0 1 1 4.5 0M12 7a2.25 2.25 0 1 1 4.5 0"/></svg>
}

function CloseIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
}

function OfferCard({ banner, coupon, brandColor, isEn }) {
  const [copied, setCopied] = useState(false)

  const copyCoupon = async () => {
    if (!coupon?.code) return
    try {
      await navigator.clipboard.writeText(coupon.code)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = coupon.code
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const discount = coupon && (coupon.discount_type === 'percent' ? `${coupon.discount_value}%` : `${coupon.discount_value} ﷼`)
  return <article style={{ overflow:'hidden', border:`1px solid ${brandColor}2B`, borderRadius:'14px', background:`linear-gradient(130deg, ${brandColor}0C, #FFFFFF 60%)`, boxShadow:'0 2px 8px rgba(15,17,23,.035)' }}>
    <div style={{ display:'grid', gap:'7px', padding:'9px' }}>
      {banner && <div style={{ minWidth:0, display:'flex', alignItems:'center', gap:'9px', padding:'8px', borderRadius:'11px', background:'white', border:'1px solid #F2F4F7' }}>
        <div style={{ width:'52px', height:'46px', display:'grid', placeItems:'center', flexShrink:0, overflow:'hidden', borderRadius:'9px', background:`${brandColor}12`, color:brandColor }}>
          {banner.image_url ? <ResponsiveMenuImage src={banner.image_url} alt={banner.title} width="52" height="46" widths={[64, 128]} sizes="52px" quality={74} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} /> : <OffersIcon size={21} />}
        </div>
        <div style={{ minWidth:0, flex:1 }}><div style={{ color:'#101828', fontFamily:'Tajawal,sans-serif', fontSize:'13px', fontWeight:'900', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{banner.title}</div>{banner.subtitle && <div style={{ marginTop:'3px', color:'#667085', fontSize:'11px', lineHeight:1.45 }}>{banner.subtitle}</div>}{coupon && <div style={{ marginTop:'4px', color:brandColor, fontSize:'10px', fontWeight:'800' }}>{isEn ? 'Discount code available with this offer' : 'يتوفر كود خصم مع هذا العرض'}</div>}</div>
      </div>}
      {coupon && <div style={{ minWidth:0, display:'flex', alignItems:'center', gap:'9px', padding:'8px', borderRadius:'11px', background:'#FFFCF8', border:`1px dashed ${brandColor}55` }}>
        <span aria-hidden="true" style={{ width:'34px', height:'34px', display:'grid', placeItems:'center', flexShrink:0, borderRadius:'9px', background:`${brandColor}14`, color:brandColor }}><OffersIcon size={17} /></span>
        <div style={{ minWidth:0, flex:1 }}><div style={{ color:'#101828', fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', direction:'ltr', textAlign:'right', fontSize:'13px', fontWeight:'900', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{coupon.code}</div><div style={{ marginTop:'2px', color:'#667085', fontSize:'10px', fontWeight:'800' }}>{isEn ? `${discount} off` : `خصم ${discount}`}</div></div>
        <button type="button" onClick={copyCoupon} aria-label={isEn ? `Copy code ${coupon.code}` : `نسخ كود ${coupon.code}`} style={{ flexShrink:0, minHeight:'38px', padding:'7px 10px', border:'none', borderRadius:'9px', background:brandColor, color:'white', fontFamily:'Tajawal,sans-serif', fontSize:'11px', fontWeight:'900', cursor:'pointer' }}>{copied ? (isEn ? 'Copied ✓' : 'تم النسخ ✓') : (isEn ? 'Copy code' : 'نسخ الكود')}</button>
      </div>}
    </div>
  </article>
}

export default function MenuOffersDrawer({ open, onClose, banners = [], coupons = [], brandColor, isEn }) {
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null
  const offerCount = Math.max(banners.length, coupons.length)
  const offers = Array.from({ length:offerCount }, (_, index) => ({ banner:banners[index] || null, coupon:coupons[index] || null }))

  return <div role="presentation" onClick={onClose} style={{ position:'fixed', inset:0, zIndex:125, display:'flex', alignItems:'flex-end', justifyContent:'center', direction:'rtl', background:'rgba(16,24,40,.48)', padding:'0' }}>
    <section role="dialog" aria-modal="true" aria-label={isEn ? 'Active offers and coupons' : 'العروض والكوبونات النشطة'} onClick={event => event.stopPropagation()} style={{ width:'100%', maxWidth:'480px', maxHeight:'78vh', overflowY:'auto', borderRadius:'22px 22px 0 0', background:'white', boxShadow:'0 -14px 40px rgba(16,24,40,.22)', padding:'10px 16px calc(18px + env(safe-area-inset-bottom))' }}>
      <div style={{ width:'40px', height:'4px', margin:'0 auto 10px', borderRadius:'999px', background:'#D0D5DD' }} />
      <div style={{ display:'flex', alignItems:'center', gap:'9px', paddingBottom:'12px', borderBottom:'1px solid #F2F4F7' }}><span style={{ width:'34px', height:'34px', display:'grid', placeItems:'center', flexShrink:0, borderRadius:'10px', background:`${brandColor}14`, color:brandColor }}><OffersIcon size={18} /></span><div style={{ minWidth:0, flex:1 }}><div style={{ color:'#101828', fontFamily:'Tajawal,sans-serif', fontSize:'15px', fontWeight:'900' }}>{isEn ? 'Offers & coupons' : 'العروض والكوبونات'}</div><div style={{ marginTop:'2px', color:'#667085', fontSize:'10.5px', fontWeight:'700' }}>{isEn ? `${offerCount} active offer${offerCount === 1 ? '' : 's'}` : `${offerCount} عرض نشط`}</div></div><button type="button" onClick={onClose} aria-label={isEn ? 'Close offers' : 'إغلاق العروض'} style={{ width:'36px', height:'36px', display:'grid', placeItems:'center', flexShrink:0, borderRadius:'10px', border:'1px solid #E4E7EC', background:'white', color:'#667085', cursor:'pointer' }}><CloseIcon size={17} /></button></div>
      <div style={{ display:'grid', gap:'9px', paddingTop:'12px' }}>{offers.map((offer, index) => <OfferCard key={`${offer.banner?.id || 'banner'}-${offer.coupon?.id || 'coupon'}-${index}`} banner={offer.banner} coupon={offer.coupon} brandColor={brandColor} isEn={isEn} />)}</div>
    </section>
  </div>
}
