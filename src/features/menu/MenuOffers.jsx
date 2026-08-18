import { useState } from 'react'

function OfferCard({ banner, coupon, brandColor, isEn, carousel }) {
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
  return <article style={{ ...(carousel ? { minWidth:'min(86vw, 360px)', flex:'0 0 min(86vw, 360px)', scrollSnapAlign:'start' } : { width:'100%' }), overflow:'hidden', border:`1px solid ${brandColor}2B`, borderRadius:'13px', background:`linear-gradient(130deg, ${brandColor}0C, #FFFFFF 60%)`, boxShadow:'0 2px 8px rgba(15,17,23,.035)' }}>
    <div style={{ display:'grid', gap:'6px', padding:'8px' }}>
      {banner && <div style={{ minWidth:0, display:'flex', alignItems:'center', gap:'8px', padding:'7px', borderRadius:'10px', background:'white', border:'1px solid #F2F4F7' }}>
        <div style={{ width:'42px', height:'38px', display:'grid', placeItems:'center', flexShrink:0, overflow:'hidden', borderRadius:'8px', background:`${brandColor}12`, color:brandColor, fontSize:'17px' }}>{banner.image_url ? <img src={banner.image_url} alt={banner.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : '🖼️'}</div>
        <div style={{ minWidth:0, flex:1 }}><div style={{ color:'#101828', fontFamily:'Tajawal,sans-serif', fontSize:'11.5px', fontWeight:'900', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{banner.title}</div>{banner.subtitle && <div style={{ marginTop:'2px', color:'#667085', fontSize:'10px', lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{banner.subtitle}</div>}{coupon && <div style={{ marginTop:'2px', color:brandColor, fontSize:'9.5px', fontWeight:'800' }}>{isEn ? 'Offer with discount code below' : 'استخدم كود الخصم المرفق مع العرض'}</div>}</div>
      </div>}
      {coupon && <div style={{ minWidth:0, display:'flex', alignItems:'center', gap:'8px', padding:'7px', borderRadius:'10px', background:'#FFFCF8', border:`1px dashed ${brandColor}55` }}>
        <span aria-hidden="true" style={{ width:'30px', height:'30px', display:'grid', placeItems:'center', flexShrink:0, borderRadius:'8px', background:`${brandColor}14`, color:brandColor, fontSize:'15px' }}>🎟️</span>
        <div style={{ minWidth:0, flex:1 }}><div style={{ color:'#101828', fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', direction:'ltr', textAlign:'right', fontSize:'12px', fontWeight:'900', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{coupon.code}</div><div style={{ marginTop:'2px', color:'#667085', fontSize:'9.5px', fontWeight:'800' }}>{isEn ? `${discount} off` : `خصم ${discount}`}</div></div>
        <button type="button" onClick={copyCoupon} aria-label={isEn ? `Copy code ${coupon.code}` : `نسخ كود ${coupon.code}`} style={{ flexShrink:0, minHeight:'34px', padding:'6px 8px', border:'none', borderRadius:'8px', background:brandColor, color:'white', fontFamily:'Tajawal,sans-serif', fontSize:'10.5px', fontWeight:'900', cursor:'pointer' }}>{copied ? (isEn ? 'Copied ✓' : 'تم النسخ ✓') : (isEn ? 'Copy code' : 'نسخ الكود')}</button>
      </div>}
    </div>
  </article>
}

export default function MenuOffers({ banners = [], coupons = [], brandColor, isEn }) {
  const offerCount = Math.max(banners.length, coupons.length)
  if (offerCount === 0) return null
  const offers = Array.from({ length:offerCount }, (_, index) => ({ banner:banners[index] || null, coupon:coupons[index] || null }))

  return <section aria-label={isEn ? 'Offers' : 'العروض'} style={{ margin:'8px 16px 2px' }}>
    <div style={{ display:'flex', alignItems:'center', gap:'6px', padding:'0 2px 6px', color:'#344054', fontFamily:'Tajawal,sans-serif', fontSize:'12px', fontWeight:'900' }}><span aria-hidden="true" style={{ color:brandColor, fontSize:'15px' }}>🎟️</span>{isEn ? 'Offers' : 'العروض'}{offerCount > 1 && <span style={{ marginInlineStart:'auto', color:'#98A2B3', fontSize:'10px', fontWeight:'800' }}>{isEn ? 'Swipe to browse' : 'اسحب لتصفح العروض'}</span>}</div>
    <div style={{ display:'flex', gap:'8px', overflowX:offerCount > 1 ? 'auto' : 'visible', scrollSnapType:offerCount > 1 ? 'x mandatory' : 'none', scrollbarWidth:'none', paddingBottom:offerCount > 1 ? '2px' : 0 }}>
      {offers.map((offer, index) => <OfferCard key={`${offer.banner?.id || 'banner'}-${offer.coupon?.id || 'coupon'}-${index}`} banner={offer.banner} coupon={offer.coupon} brandColor={brandColor} isEn={isEn} carousel={offerCount > 1} />)}
    </div>
  </section>
}
