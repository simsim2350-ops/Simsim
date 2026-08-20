import type { CSSProperties } from 'react'
import type { MenuBranch, MenuRestaurant } from '@/lib/menu-types'
import { computeBranchOpenStatus, effectiveDeliverySettings, estimatedPrepTime } from '@/lib/menu-helpers'
import MenuImage from './MenuImage'

// هيدر المنيو — نسخة Server Rendering لحالة السكون (scroll = 0): هيرو مصوّر + بطاقة الهوية.
// المُؤجَّل (Phase 5 كـ Client Islands): Sticky-Morph، الهيدر المصغّر عند التمرير، تبديل اللغة،
// شاشة البحث، «عرض المزيد» للوصف، توسيع روابط التواصل. الأزرار العائمة تُعرض كأيقونات ثابتة للمطابقة البصرية.
export default function MenuHeaderServer({
  restaurant,
  branch,
}: {
  restaurant: MenuRestaurant
  branch: MenuBranch
}) {
  const brandColor = restaurant.brand_color || '#FF6A00'
  const descColor = restaurant.description_color || '#9CA3AF'
  const openStatus = computeBranchOpenStatus(branch)
  const delivery = effectiveDeliverySettings(branch, restaurant)

  const addr = branch?.address || restaurant.address
  const mapsUrl = branch?.maps_url || restaurant.maps_url
  const hoursDetail = (restaurant.show_hours ?? true)
    ? openStatus.open
      ? (!openStatus.unknown && openStatus.todayText ? openStatus.todayText : '')
      : openStatus.nextText || ''
    : ''

  const metaItems: { icon: string; text: string; color: string; grow?: boolean; ltr?: boolean }[] = [
    ...(addr ? [{ icon: '📍', text: addr, color: '#6B7280', grow: true }] : []),
    ...((restaurant.show_prep_time ?? true) ? [{ icon: '⏱️', text: `${estimatedPrepTime(0)} د`, color: '#374151' }] : []),
    ...(delivery.enabled ? [{ icon: '🚚', text: Number(delivery.fee) > 0 ? `${Number(delivery.fee).toFixed(0)} ﷼` : 'مجاني', color: '#374151' }] : []),
    ...(hoursDetail ? [{ icon: '🕐', text: hoursDetail, color: openStatus.open ? '#10B981' : '#EF4444', ltr: openStatus.open }] : []),
  ]

  const showSocial = (restaurant.show_social_links ?? true) && !!restaurant.social_links
  const socialKeys = showSocial
    ? ['instagram', 'whatsapp_social', 'snapchat'].filter((key) => restaurant.social_links![key])
    : []
  const shownSocialKeys = socialKeys.slice(0, 3)
  const hasAllergens = (restaurant.show_allergens ?? true) && Array.isArray(restaurant.allergens) && restaurant.allergens.length > 0

  const floatBtn: CSSProperties = { position: 'absolute', top: '12px', width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.95)', boxShadow: '0 4px 14px rgba(0,0,0,0.28)', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const socialCircle: CSSProperties = { width: 'var(--hero-social)', height: 'var(--hero-social)', flexShrink: 0, borderRadius: '50%', background: 'white', border: '1.5px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', fontSize: '13px' }

  return (
    <>
      {/* الهيرو المثبّت + البطاقة العائمة فوقه — نفس هندسة MenuHeader.jsx في حالة السكون */}
      <div style={{ height: 'var(--hero-image-h)' }} />
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '480px', height: 'var(--hero-image-h)', zIndex: 5, overflow: 'hidden', background: `linear-gradient(160deg, ${brandColor}, ${brandColor}88)` }}>
        {restaurant.cover_url && <MenuImage src={restaurant.cover_url} alt="" sizes="(min-width: 480px) 480px, 100vw" priority />}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.12), transparent 30%, transparent 70%, rgba(0,0,0,0.18))', pointerEvents: 'none' }} />
        {/* أزرار عائمة ثابتة (غير تفاعلية في Phase 1) للمطابقة البصرية */}
        <div aria-hidden style={{ ...floatBtn, left: '14px', fontFamily: 'Tajawal,sans-serif', fontWeight: 800, fontSize: '12px' }}>EN</div>
        <div aria-hidden style={{ ...floatBtn, left: '62px', fontSize: '16px' }}>🔍</div>
      </div>

      {/* البطاقة العائمة */}
      <div style={{ position: 'relative', zIndex: 10, margin: 'calc(var(--hero-overlap) * -1) var(--hero-pad-x) 0', paddingBottom: 'var(--hero-pad-bottom)', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: 'var(--hero-radius)', boxShadow: '0 10px 30px rgba(15,17,23,0.16)' }}>
        <div style={{ paddingTop: '4px' }}>
          <div style={{ width: '40px', height: '4px', background: '#E5E7EB', borderRadius: '100px', margin: '0 auto 4px' }} />
          {/* الهوية: شعار + اسم + حالة الفتح */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '0 16px 5px' }}>
            <div style={{ position: 'relative', width: 'var(--hero-logo)', height: 'var(--hero-logo)', borderRadius: '15px', background: `linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '25px', flexShrink: 0, overflow: 'hidden', boxShadow: '0 5px 14px rgba(15,17,23,0.18)' }}>
              {restaurant.logo_url ? <MenuImage src={restaurant.logo_url} alt={restaurant.name} sizes="52px" priority /> : '🍕'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontFamily: 'Tajawal,sans-serif', fontWeight: 900, fontSize: '19px', color: '#0B0B0F', margin: 0 }}>{restaurant.name}</h1>
              {(restaurant.show_hours ?? true) && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '2px', fontSize: '11px', fontWeight: 800, color: openStatus.open ? '#10B981' : '#EF4444' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: openStatus.open ? '#10B981' : '#EF4444', flexShrink: 0 }} />
                  {openStatus.open ? 'مفتوح الآن' : 'مغلق الآن'}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hero-spacing)', padding: '0 var(--hero-pad-x)', marginTop: 'var(--hero-spacing)' }}>
          {/* META: الموقع · التجهيز · التوصيل · الساعات */}
          {(metaItems.length > 0 || mapsUrl) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px 12px', flexWrap: 'wrap' }}>
              {metaItems.map((m, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0, ...(m.grow ? { flex: '1 1 auto' } : {}), fontSize: '12px', fontWeight: 700, color: m.color, ...(m.ltr ? { direction: 'ltr' } : {}) }}>
                  <span>{m.icon}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{m.text}</span>
                </span>
              ))}
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, fontSize: '11px', fontWeight: 700, color: brandColor, background: `${brandColor}14`, padding: '3px 10px', borderRadius: '100px', textDecoration: 'none' }}>🗺️ الخريطة</a>
              )}
            </div>
          )}

          {/* الوصف — سطران (line-clamp). زر «عرض المزيد» مؤجَّل (Phase 5). */}
          {(restaurant.show_description ?? true) && restaurant.description && (
            <div>
              <p style={{ fontSize: '12.5px', color: descColor, lineHeight: '1.45', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{restaurant.description}</p>
            </div>
          )}

          {/* التواصل: هاتف + روابط (روابط حقيقية) + شارة المسبّبات (ثابتة) */}
          {(restaurant.phone || shownSocialKeys.length > 0 || hasAllergens) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', overflowX: 'auto' }}>
              {restaurant.phone && <a href={`tel:${restaurant.phone}`} aria-label="اتصال" style={socialCircle}>📞</a>}
              {shownSocialKeys.map((key) => (
                <a key={key} href={restaurant.social_links![key]} target="_blank" rel="noopener noreferrer" style={socialCircle}>🔗</a>
              ))}
              {hasAllergens && (
                <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, whiteSpace: 'nowrap', padding: '5px 9px', borderRadius: '100px', border: '1.5px solid #FDE68A', background: '#FFFBEB', color: '#92400E', fontFamily: 'Tajawal,sans-serif', fontWeight: 700, fontSize: '10.5px' }}>⚠️ مسبّبات الحساسية</div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
