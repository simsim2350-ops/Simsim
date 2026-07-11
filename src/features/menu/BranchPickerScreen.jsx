import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { computeOpenStatus, copyToClipboard } from './helpers'
import { SOCIAL_ICONS } from './SocialIcons'

// شاشة "اختر فرعك" — تظهر لو فيه فروع نشطة ولم يُحدَّد فرع في الرابط.
// صفحة تسويقية على مراحل: المرحلة 0 (Hero + الأكثر طلباً + بطاقات فروع + لماذا
// تختارنا + تشويق الولاء + التواصل، بلا أي جدول جديد) + المرحلة 1 (بانرات العروض
// وكوبونات حقيقية). القرار المعماري (الخيار 3): هذه الشاشة تعرض فقط العروض
// "العامة" (بلا فرع محدد) — أي بانر/كوبون مخصَّص لفرع بعينه يظهر حصرياً في
// شريط المنيو نفسه (MenuHeader) حيث سياق الفرع محسوم فعلياً، بلا تعارض.
export default function BranchPickerScreen({ restaurant, branchList, brandColor, isEn, t, tx, onChoose, products, rating, loyaltyEnabled, banners = [], coupons = [] }) {
  const restaurantStatus = computeOpenStatus(restaurant.opening_hours)
  const totalBranches = branchList.length + 1 // +1 للفرع الرئيسي
  const featuredProducts = (products || []).filter(p => p.is_featured).slice(0, 4)
  const hasSocial = restaurant.social_links && Object.values(restaurant.social_links).some(v => v)
  const generalBanners = banners.filter(b => !b.branch_id)
  const generalCoupons = coupons.filter(c => !c.branch_id)

  const scrollToBranches = () => document.getElementById('sm-branch-section')?.scrollIntoView({ behavior:'smooth', block:'start' })

  const copyCoupon = async (code) => {
    try {
      await copyToClipboard(code)
      toast.success(isEn ? 'Code copied 📋' : 'تم نسخ الكود 📋')
    } catch {
      toast.error(isEn ? 'Could not copy' : 'تعذّر النسخ')
    }
  }

  // بانر العروض — Carousel بسيط يتقدّم تلقائياً كل 4.5 ثانية لو فيه أكثر من بانر
  const BannerCarousel = () => {
    const [idx, setIdx] = useState(0)
    useEffect(() => {
      if (generalBanners.length <= 1) return
      const timer = setInterval(() => setIdx(i => (i + 1) % generalBanners.length), 4500)
      return () => clearInterval(timer)
    }, [])
    if (generalBanners.length === 0) return null
    const b = generalBanners[idx]
    return (
      <div>
        <div style={{ borderRadius:'16px', overflow:'hidden', position:'relative', background: b.image_url ? '#0F1117' : 'linear-gradient(120deg,#1F2430,#0F1117)' }}>
          {b.image_url && (
            <img src={b.image_url} alt="" style={{ width:'100%', height:'140px', objectFit:'cover', display:'block', opacity:0.75 }} />
          )}
          <div style={{ position: b.image_url ? 'absolute' : 'static', inset:0, padding:'14px 16px', display:'flex', flexDirection:'column', justifyContent:'flex-end', color:'white', minHeight: b.image_url ? undefined : '110px' }}>
            <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', marginBottom:'3px' }}>{b.title}</div>
            {b.subtitle && <div style={{ fontSize:'12px', opacity:0.85, marginBottom:'10px' }}>{b.subtitle}</div>}
            <button onClick={scrollToBranches} style={{ alignSelf:'flex-start', padding:'7px 16px', borderRadius:'100px', border:'none', background:'white', color:'#0F1117', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer' }}>
              {b.cta_text || (isEn ? 'Order now' : 'اطلب الآن')}
            </button>
          </div>
        </div>
        {generalBanners.length > 1 && (
          <div style={{ display:'flex', gap:'5px', justifyContent:'center', marginTop:'8px' }}>
            {generalBanners.map((_, i) => (
              <span key={i} style={{ width: i === idx ? '16px' : '6px', height:'6px', borderRadius:'100px', background: i === idx ? brandColor : '#E5E7EB', transition:'all 0.2s' }}/>
            ))}
          </div>
        )}
      </div>
    )
  }

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
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginTop:'10px', flexWrap:'wrap' }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'11px', fontWeight:'700', color:c, background:bg, padding:'3px 9px', borderRadius:'100px' }}>
            <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:c, display:'inline-block' }}/>
            {st.open ? t('openNow') : t('closedNow')}
          </span>
          {!st.open && st.nextText && <span style={{ fontSize:'11px', color:'#EF4444' }}>{st.nextText}</span>}
          {rating && (
            <span style={{ fontSize:'11px', fontWeight:'800', color:'#B08A2E' }}>★ {rating.avg}</span>
          )}
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
        <button
          onClick={onPick}
          style={{ width:'100%', marginTop:'12px', padding:'10px', borderRadius:'11px', border:'none', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', cursor:'pointer' }}
        >
          {isEn ? 'Choose this branch ›' : 'اختيار هذا الفرع ›'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', background:'#F8F9FB', direction:'rtl', fontFamily:'Tajawal,sans-serif', maxWidth:'480px', margin:'0 auto', position:'relative', boxShadow:'0 0 60px rgba(15,17,23,0.12)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} * { box-sizing: border-box; } @media(min-width:600px){body{background:#E9ECF2}}`}</style>

      {/* Hero */}
      <div style={{ background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, padding:'28px 20px 22px', textAlign:'center', color:'white' }}>
        <div style={{ width:'64px', height:'64px', borderRadius:'16px', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'30px', margin:'0 auto 12px', overflow:'hidden' }}>
          {restaurant.logo_url
            ? <img src={restaurant.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : '🍕'}
        </div>
        <h1 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', marginBottom:'4px' }}>{restaurant.name}</h1>
        {(restaurant.show_description ?? true) && tx(restaurant, 'description') && (
          <p style={{ fontSize:'12.5px', opacity:0.9, marginBottom:'10px', maxWidth:'320px', marginInline:'auto' }}>{tx(restaurant, 'description')}</p>
        )}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'11px', fontWeight:'800', background:'rgba(255,255,255,0.2)', padding:'4px 11px', borderRadius:'100px' }}>
            {restaurantStatus.open ? `🟢 ${t('openNow')}` : `🔴 ${t('closedNow')}`}
          </span>
          {rating && (
            <span style={{ fontSize:'11px', fontWeight:'800', background:'rgba(255,255,255,0.2)', padding:'4px 11px', borderRadius:'100px' }}>★ {rating.avg} ({rating.count})</span>
          )}
          <span style={{ fontSize:'11px', fontWeight:'800', background:'rgba(255,255,255,0.2)', padding:'4px 11px', borderRadius:'100px' }}>
            📍 {totalBranches} {isEn ? (totalBranches === 1 ? 'branch' : 'branches') : 'فروع'}
          </span>
        </div>
      </div>

      <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:'20px', maxWidth:'520px', margin:'0 auto' }}>

        {/* بانر العروض — عام فقط (بلا فرع محدد) */}
        {generalBanners.length > 0 && <BannerCarousel/>}

        {/* الكوبونات — عامة فقط (بلا فرع محدد) */}
        {generalCoupons.length > 0 && (
          <div>
            <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px', color:'#0F1117', margin:'0 0 10px' }}>🎟️ {isEn ? 'Available coupons' : 'الكوبونات المتاحة'}</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {generalCoupons.map(c => (
                <div key={c.id} style={{ display:'flex', alignItems:'center', gap:'10px', background:'white', border:`1.5px dashed ${brandColor}`, borderRadius:'13px', padding:'10px 12px' }}>
                  <span style={{ fontWeight:'900', fontSize:'15px', color:brandColor, flexShrink:0 }}>
                    {c.discount_type === 'percent' ? `${c.discount_value}%` : `${c.discount_value} ﷼`}
                  </span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'12px', fontWeight:'800', direction:'ltr', textAlign:'right' }}>{c.code}</div>
                    <div style={{ fontSize:'10.5px', color:'#9CA3AF' }}>
                      {c.min_order_amount > 0 && (isEn ? `Orders over ${c.min_order_amount} ﷼` : `للطلبات فوق ${c.min_order_amount} ﷼`)}
                      {c.min_order_amount > 0 && c.expires_at && ' · '}
                      {c.expires_at && (isEn ? `Until ${new Date(c.expires_at).toLocaleDateString()}` : `صالح حتى ${new Date(c.expires_at).toLocaleDateString('ar-SA')}`)}
                    </div>
                  </div>
                  <button onClick={() => copyCoupon(c.code)} style={{ flexShrink:0, padding:'6px 12px', borderRadius:'100px', border:`1px solid ${brandColor}`, background:'none', color:brandColor, fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'11px', cursor:'pointer' }}>
                    {isEn ? 'Copy' : 'نسخ'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* الأكثر طلباً */}
        {featuredProducts.length > 0 && (
          <div>
            <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px', color:'#0F1117', margin:'0 0 10px' }}>{t('mostOrdered')}</h2>
            <div style={{ display:'flex', gap:'10px', overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
              {featuredProducts.map(p => (
                <div key={p.id} style={{ flexShrink:0, width:'96px' }}>
                  <div style={{ width:'96px', height:'80px', borderRadius:'12px', background:'#F0ECE4', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'30px', overflow:'hidden', marginBottom:'5px' }}>
                    {p.image_url
                      ? <img loading="lazy" decoding="async" src={p.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      : p.emoji}
                  </div>
                  <div style={{ fontSize:'11px', fontWeight:'700', color:'#0F1117', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{isEn && p.name_en ? p.name_en : p.name}</div>
                  <div style={{ fontSize:'11px', fontWeight:'900', color:brandColor }}>{p.price} ﷼</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* اختر الفرع */}
        <div id="sm-branch-section">
          <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px', color:'#0F1117', margin:'0 0 10px' }}>{t('pickBranch')}</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            {/* الفرع الرئيسي (المطعم نفسه) */}
            <BranchCard
              isMain
              name={isEn ? 'Main branch' : 'الفرع الرئيسي'}
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

        {/* لماذا تختارنا */}
        <div>
          <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px', color:'#0F1117', margin:'0 0 10px' }}>{isEn ? 'Why choose us' : 'لماذا تختارنا'}</h2>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
            {[
              { icon:'🥩', label: isEn ? 'Fresh ingredients daily' : 'مكوّنات طازجة يومياً' },
              { icon:'⚡', label: isEn ? 'Fast preparation' : 'سرعة التحضير' },
              { icon:'✨', label: isEn ? 'Strict cleanliness' : 'معايير نظافة صارمة' },
              { icon:'🏆', label: isEn ? 'Trusted quality' : 'جودة موثوقة' },
            ].map((item, i) => (
              <div key={i} style={{ background:'white', border:'1px solid #F0F0F0', borderRadius:'12px', padding:'12px', textAlign:'center' }}>
                <div style={{ fontSize:'20px', marginBottom:'4px' }}>{item.icon}</div>
                <div style={{ fontSize:'11px', fontWeight:'700', color:'#374151' }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* تشويق برنامج الولاء */}
        {loyaltyEnabled && (
          <div style={{ display:'flex', alignItems:'center', gap:'10px', background:`linear-gradient(120deg, ${brandColor}16, ${brandColor}08)`, border:`1px solid ${brandColor}30`, borderRadius:'14px', padding:'13px 14px' }}>
            <span style={{ fontSize:'20px' }}>🎁</span>
            <span style={{ fontSize:'12.5px', fontWeight:'800', color:'#0F1117', fontFamily:'Cairo,sans-serif' }}>
              {isEn ? 'Collect points with every order and unlock exclusive rewards' : 'اجمع نقاطاً مع كل طلب واحصل على مكافآت حصرية'}
            </span>
          </div>
        )}

        {/* وسائل التواصل */}
        {(restaurant.show_social_links ?? true) && hasSocial && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'10px' }}>
            {['instagram', 'whatsapp_social', 'snapchat', 'twitter', 'tiktok']
              .filter(key => restaurant.social_links[key])
              .map(key => {
                const Icon = SOCIAL_ICONS[key]
                return (
                  <a key={key} href={restaurant.social_links[key]} target="_blank" rel="noopener noreferrer"
                    style={{ width:'36px', height:'36px', borderRadius:'50%', background:'white', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', boxShadow:'0 2px 6px rgba(0,0,0,0.06)', overflow:'hidden' }}>
                    <Icon/>
                  </a>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
