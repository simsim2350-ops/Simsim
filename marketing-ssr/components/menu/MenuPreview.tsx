import type { CSSProperties } from 'react'
import type { MenuCategory, MenuData, MenuLayout, MenuProduct } from '@/lib/menu/menu-types'
import { computeBranchOpenStatus, effectiveDeliverySettings, estimatedPrepTime, getCalorieBadge } from '@/lib/menu/menu-helpers'
import { TYPE } from './menu-typography'
import MenuImage from './MenuImage'

// ============================================================================
// منيو المعاينة (SSR) — عرض خادمي مطابق قدر الإمكان لتصميم منيو الإنتاج
// (src/pages/PublicMenu + features/menu). Server Component خالص، بلا "use client".
// المرحلة 1: المحتوى الأساسي فقط (هيدر/أقسام/أصناف/أسعار/صور/أوصاف). العناصر
// التفاعلية (سلة، مودال، بحث، تبديل لغة، Morph header) مؤجّلة كجُزر عميل (STEP 10/19).
// اللغة الافتراضية: العربية RTL (نفس افتراضي الإنتاج).
// ============================================================================

const RIYAL = '﷼'

const LAYOUT_IMAGE_CONFIG: Record<MenuLayout, { widths: number[]; sizes: string; quality: number; width: string; height: string }> = {
  circles: { widths: [128, 240, 320], sizes: '104px', quality: 72, width: '104', height: '104' },
  grid: { widths: [240, 480, 640], sizes: '(min-width: 1024px) 467px, calc((100vw - 42px) / 2)', quality: 72, width: '240', height: '240' },
  showcase: { widths: [480, 720, 960], sizes: '(min-width: 1024px) 467px, calc(100vw - 32px)', quality: 76, width: '480', height: '360' },
  list: { widths: [128, 240, 320], sizes: '108px', quality: 72, width: '108', height: '108' },
}

function Badges({ product }: { product: MenuProduct }) {
  const bestSeller = product.is_best_seller === true
  const restaurantPick = product.is_featured === true
  if (!bestSeller && !restaurantPick) return null
  return (
    <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', zIndex: 1 }}>
      {bestSeller && <span style={{ fontSize: '9px', fontWeight: 800, color: '#92400E', background: '#FEF3C7', padding: '2px 7px', borderRadius: '100px', whiteSpace: 'nowrap' }}>الأكثر مبيعًا 🔥</span>}
      {restaurantPick && <span style={{ fontSize: '9px', fontWeight: 800, color: '#1E5FBF', background: '#EAF3FF', padding: '2px 7px', borderRadius: '100px', whiteSpace: 'nowrap' }}>مختارات المطعم ⭐</span>}
    </div>
  )
}

function ProductCard({ product, layout, brandColor, priceColor, descColor, priority }: {
  product: MenuProduct
  layout: MenuLayout
  brandColor: string
  priceColor: string
  descColor: string
  priority: boolean
}) {
  const _priceColor = priceColor || brandColor
  const _descColor = descColor || '#9CA3AF'
  const pName = product.name
  const pDesc = product.description
  const cfg = LAYOUT_IMAGE_CONFIG[layout]
  const img = product.image_url
    ? <MenuImage src={product.image_url} alt={product.name} width={cfg.width} height={cfg.height} widths={cfg.widths} sizes={cfg.sizes} quality={cfg.quality} priority={priority} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    : (product.emoji || '🍽️')

  if (layout === 'circles') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '6px 4px' }}>
        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <div style={{ width: '104px', height: '104px', borderRadius: '50%', background: '#F8F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '44px', overflow: 'hidden', boxShadow: '0 6px 18px rgba(0,0,0,0.10)', border: '3px solid white' }}>{img}</div>
          <Badges product={product} />
        </div>
        <div style={{ ...TYPE.itemNameSm, color: '#0B0B0F', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{pName}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <span style={{ ...TYPE.priceSm, color: _priceColor }}>{product.price} {RIYAL}</span>
          {product.compare_price && <span style={{ ...TYPE.caption, color: '#9CA3AF', textDecoration: 'line-through' }}>{product.compare_price} {RIYAL}</span>}
        </div>
      </div>
    )
  }

  if (layout === 'grid') {
    return (
      <div style={{ background: 'white', borderRadius: '14px', overflow: 'hidden', border: '1px solid #F0F0F0' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ width: '100%', aspectRatio: '1/1', background: '#F8F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '46px', overflow: 'hidden' }}>{img}</div>
          <Badges product={product} />
        </div>
        <div style={{ padding: '10px 12px' }}>
          <div style={{ ...TYPE.itemNameSm, color: '#0B0B0F', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pName}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ ...TYPE.priceSm, color: _priceColor }}>{product.price} {RIYAL}</span>
            {product.compare_price && <span style={{ ...TYPE.caption, color: '#9CA3AF', textDecoration: 'line-through' }}>{product.compare_price} {RIYAL}</span>}
          </div>
        </div>
      </div>
    )
  }

  if (layout === 'showcase') {
    return (
      <div style={{ background: 'white', borderRadius: '14px', overflow: 'hidden', border: '1px solid #F0F0F0' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ width: '100%', aspectRatio: '4/3', background: '#F8F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '52px', overflow: 'hidden' }}>{img}</div>
          <Badges product={product} />
        </div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ ...TYPE.itemName, color: '#0B0B0F', marginBottom: '4px' }}>{pName}</div>
          {pDesc && <div style={{ ...TYPE.body, color: _descColor, marginBottom: '8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{pDesc}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ ...TYPE.price, color: _priceColor }}>{product.price} {RIYAL}</span>
            {product.compare_price && <span style={{ ...TYPE.caption, color: '#9CA3AF', textDecoration: 'line-through' }}>{product.compare_price} {RIYAL}</span>}
          </div>
        </div>
      </div>
    )
  }

  // list (default)
  return (
    <div style={{ background: 'white', padding: '12px 14px', display: 'flex', gap: '12px', alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYPE.itemName, color: '#0B0B0F', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pName}</div>
        {pDesc && <div style={{ ...TYPE.body, color: '#9CA3AF', marginBottom: '6px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{pDesc}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ ...TYPE.price, color: _priceColor, fontVariantNumeric: 'tabular-nums' }}>{product.price} {RIYAL}</span>
          {product.compare_price && <span style={{ ...TYPE.caption, color: '#9CA3AF', textDecoration: 'line-through' }}>{product.compare_price} {RIYAL}</span>}
          {product.calories && <span style={{ ...TYPE.meta, color: '#9CA3AF' }}>{getCalorieBadge(product.calories)} {product.calories}</span>}
        </div>
      </div>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ width: '108px', height: '108px', borderRadius: '14px', background: '#F8F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', border: '1px solid #E5E7EB', overflow: 'hidden' }}>{img}</div>
        <Badges product={product} />
      </div>
    </div>
  )
}

function CategoryCover({ category }: { category: MenuCategory }) {
  if (category.cover_url) {
    return (
      <div style={{ width: '36px', height: '36px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0 }}>
        <MenuImage src={category.cover_url} alt="" width="36" height="36" widths={[64, 128]} sizes="36px" quality={70} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    )
  }
  return <span style={{ fontSize: '20px' }}>{category.emoji}</span>
}

function productGridStyle(layout: MenuLayout): CSSProperties {
  if (layout === 'grid' || layout === 'circles') return { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '0 16px' }
  if (layout === 'showcase') return { display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 16px' }
  return { display: 'flex', flexDirection: 'column', gap: '1px', background: '#F3F4F6' }
}

export default function MenuPreview({ data }: { data: MenuData }) {
  const { restaurant, branch, categories, products } = data
  const layout: MenuLayout = restaurant.menu_layout || 'list'
  const brandColor = restaurant.brand_color || '#FF6A00'
  const priceColor = restaurant.price_color || brandColor
  const descColor = restaurant.description_color || '#9CA3AF'
  const openStatus = computeBranchOpenStatus(branch)
  const delivery = effectiveDeliverySettings(branch, restaurant)

  const manualBestSellers = products.filter((p) => p.is_best_seller === true).slice(0, 4)
  const featuredProducts = products.filter((p) => p.is_featured === true).slice(0, 4)
  const prioritySection = manualBestSellers.length ? 'manual' : featuredProducts.length ? 'featured' : 'categories'
  const firstCategoryProduct = categories.map((c) => products.find((p) => p.category_id === c.id)).find(Boolean)

  const addr = branch?.address || restaurant.address
  const mapsUrl = branch?.maps_url || restaurant.maps_url
  const hoursDetail = (restaurant.show_hours ?? true)
    ? (openStatus.open ? (!openStatus.unknown && openStatus.todayText ? openStatus.todayText : '') : (openStatus.nextText || ''))
    : ''
  const metaItems = [
    ...(addr ? [{ icon: '📍', text: addr, color: '#6B7280', grow: true }] : []),
    ...((restaurant.show_prep_time ?? true) ? [{ icon: '⏱️', text: `${estimatedPrepTime(0)} د`, color: '#374151', grow: false }] : []),
    ...(delivery.enabled ? [{ icon: '🚚', text: delivery.fee > 0 ? `${delivery.fee.toFixed(0)} ${RIYAL}` : 'مجاني', color: '#374151', grow: false }] : []),
    ...(hoursDetail ? [{ icon: '🕐', text: hoursDetail, color: openStatus.open ? '#10B981' : '#EF4444', grow: false }] : []),
  ]

  const showSocial = (restaurant.show_social_links ?? true) && restaurant.social_links
  const socialKeys = showSocial ? ['instagram', 'whatsapp_social', 'snapchat'].filter((k) => restaurant.social_links?.[k]) : []
  const fullDesc = restaurant.description

  const menuFrameStyle: CSSProperties = { minHeight: '100vh', background: '#F8F9FB', direction: 'rtl', textAlign: 'right', fontFamily: 'Tajawal,sans-serif', maxWidth: '480px', margin: '0 auto', position: 'relative' }

  return (
    <div className="sm-menu-frame" lang="ar" dir="rtl" style={menuFrameStyle}>
      <style>{`
        * { box-sizing: border-box; }
        html, body { background: #E4E7EE; }
        .sm-menu-frame {
          -webkit-text-size-adjust: 100%;
          text-size-adjust: 100%;
          --hero-image-h: clamp(96px, 26vw, 132px);
          --hero-overlap: calc(var(--hero-image-h) - 52px);
          --hero-radius: 22px;
          --hero-pad-x: 16px;
          --hero-pad-bottom: clamp(3px, 1.2vw, 6px);
          --hero-spacing: clamp(2px, 0.7vw, 5px);
          --hero-logo: clamp(44px, 12.5vw, 52px);
          --hero-social: clamp(26px, 7vw, 28px);
        }
        @media (min-width: 600px) and (max-width: 1023px) {
          .sm-menu-frame { box-shadow: 0 0 0 100vw #E4E7EE, 0 0 60px rgba(15,17,23,0.14); }
        }
        @media (min-width: 1024px) {
          .sm-menu-frame { max-width: 980px !important; box-shadow: 0 0 0 100vw #E4E7EE, 0 0 70px rgba(15,17,23,0.14); }
          .sm-products { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 14px !important; background: transparent !important; padding: 0 16px !important; }
        }
        .sm-tabs::-webkit-scrollbar { display: none; }
        .sm-tabs { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ===== الهيدر: هيرو + بطاقة عائمة (الحالة الأولية عند scroll=0) ===== */}
      <div style={{ height: 'var(--hero-image-h)' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'var(--hero-image-h)', overflow: 'hidden', background: `linear-gradient(160deg, ${brandColor}, ${brandColor}88)` }}>
        {restaurant.cover_url && (
          <MenuImage src={restaurant.cover_url} alt="" width="480" height="132" widths={[480, 960, 1080]} sizes="(min-width: 480px) 480px, 100vw" quality={76} priority style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.12), transparent 30%, transparent 70%, rgba(0,0,0,0.18))' }} />
      </div>

      {/* البطاقة العائمة */}
      <div style={{ position: 'relative', zIndex: 10, margin: 'calc(var(--hero-overlap) * -1) var(--hero-pad-x) 0', paddingBottom: 'var(--hero-pad-bottom)', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: 'var(--hero-radius)', boxShadow: '0 10px 30px rgba(15,17,23,0.16)' }}>
        <div style={{ paddingTop: '4px' }}>
          <div style={{ width: '40px', height: '4px', background: '#E5E7EB', borderRadius: '100px', margin: '0 auto 4px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '0 16px 5px' }}>
            <div style={{ width: 'var(--hero-logo)', height: 'var(--hero-logo)', borderRadius: '15px', background: `linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '25px', flexShrink: 0, overflow: 'hidden', boxShadow: '0 5px 14px rgba(15,17,23,0.18)' }}>
              {restaurant.logo_url
                ? <MenuImage src={restaurant.logo_url} alt={restaurant.name} width="52" height="52" widths={[64, 128, 192]} sizes="52px" quality={78} priority style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : '🍕'}
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
          {(metaItems.length > 0 || mapsUrl) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px 12px', flexWrap: 'wrap' }}>
              {metaItems.map((m, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0, ...(m.grow ? { flex: '1 1 auto' } : {}), fontSize: '12px', fontWeight: 700, color: m.color }}>
                  <span>{m.icon}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{m.text}</span>
                </span>
              ))}
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, fontSize: '11px', fontWeight: 700, color: brandColor, background: `${brandColor}14`, padding: '3px 10px', borderRadius: '100px', textDecoration: 'none' }}>الخريطة</a>
              )}
            </div>
          )}

          {(restaurant.show_description ?? true) && fullDesc && (
            <div>
              <p style={{ fontSize: '12.5px', color: descColor, lineHeight: '1.45', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{fullDesc}</p>
            </div>
          )}

          {(restaurant.phone || socialKeys.length > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', overflowX: 'auto' }}>
              {restaurant.phone && (
                <a href={`tel:${restaurant.phone}`} aria-label="اتصال" style={{ width: 'var(--hero-social)', height: 'var(--hero-social)', flexShrink: 0, borderRadius: '50%', background: 'white', border: '1.5px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', fontSize: '13px' }}>📞</a>
              )}
              {socialKeys.map((key) => (
                <a key={key} href={restaurant.social_links?.[key]} target="_blank" rel="noopener noreferrer" aria-label={key} style={{ width: 'var(--hero-social)', height: 'var(--hero-social)', flexShrink: 0, borderRadius: '50%', background: 'white', border: '1.5px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', overflow: 'hidden', fontSize: '13px' }}>🔗</a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== شريط الأقسام ===== */}
      <div className="sm-tabs" style={{ background: 'white', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', padding: '0 4px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
        {categories.map((cat, index) => (
          <div key={cat.id} style={{ padding: '11px 11px 9px', flexShrink: 0, whiteSpace: 'nowrap', ...TYPE.tab, fontWeight: index === 0 ? 800 : 700, borderBottom: index === 0 ? `2.5px solid ${brandColor}` : '2.5px solid transparent', color: index === 0 ? '#0B0B0F' : '#9CA3AF' }}>{cat.name}</div>
        ))}
      </div>

      {/* ===== المحتوى ===== */}
      <div style={{ padding: '0 0 40px' }}>
        {manualBestSellers.length > 0 && (
          <div style={{ marginBottom: '6px' }}>
            <div style={{ padding: '12px 16px 8px' }}><h2 style={{ ...TYPE.sectionTitle, color: '#0B0B0F', margin: 0 }}>الأكثر مبيعًا</h2></div>
            <div className="sm-products" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '0 16px' }}>
              {manualBestSellers.map((p, i) => <ProductCard key={p.id} product={p} layout="grid" brandColor={brandColor} priceColor={priceColor} descColor={descColor} priority={prioritySection === 'manual' && i === 0} />)}
            </div>
          </div>
        )}

        {featuredProducts.length > 0 && (
          <div style={{ marginBottom: '6px' }}>
            <div style={{ padding: '12px 16px 8px' }}><h2 style={{ ...TYPE.sectionTitle, color: '#0B0B0F', margin: 0 }}>مختارات المطعم</h2></div>
            <div className="sm-products" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '0 16px' }}>
              {featuredProducts.map((p, i) => <ProductCard key={p.id} product={p} layout="grid" brandColor={brandColor} priceColor={priceColor} descColor={descColor} priority={prioritySection === 'featured' && i === 0} />)}
            </div>
          </div>
        )}

        {categories.map((cat) => {
          const catProducts = products.filter((p) => p.category_id === cat.id)
          if (catProducts.length === 0) return null
          return (
            <div key={cat.id} id={`cat-${cat.id}`} style={{ marginBottom: '6px' }}>
              <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CategoryCover category={cat} />
                <h2 style={{ ...TYPE.sectionTitle, color: '#0B0B0F' }}>{cat.name}</h2>
                <span style={{ ...TYPE.meta, color: '#9CA3AF', background: '#F3F4F6', padding: '2px 8px', borderRadius: '100px' }}>{catProducts.length}</span>
              </div>
              <div className="sm-products" style={productGridStyle(layout)}>
                {catProducts.map((p, index) => (
                  <ProductCard key={p.id} product={p} layout={layout} brandColor={brandColor} priceColor={priceColor} descColor={descColor} priority={prioritySection === 'categories' && p.id === firstCategoryProduct?.id && index === 0} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
