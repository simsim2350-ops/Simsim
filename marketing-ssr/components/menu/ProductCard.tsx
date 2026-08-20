import type { CSSProperties } from 'react'
import type { MenuLayout, MenuProduct } from '@/lib/menu-types'
import { getCalorieBadge } from '@/lib/menu-helpers'
import MenuImage from './MenuImage'

// نظام Typography المطابق لـ src/features/menu/typography.js
const HEADING = 'Tajawal,sans-serif'
const TYPE = {
  itemName: { fontFamily: HEADING, fontWeight: 700, fontSize: '15px' } as CSSProperties,
  itemNameSm: { fontFamily: HEADING, fontWeight: 700, fontSize: '13px' } as CSSProperties,
  price: { fontFamily: HEADING, fontWeight: 800, fontSize: '16px' } as CSSProperties,
  priceSm: { fontFamily: HEADING, fontWeight: 800, fontSize: '13px' } as CSSProperties,
  body: { fontWeight: 400, fontSize: '12px', lineHeight: '1.4' } as CSSProperties,
  meta: { fontWeight: 700, fontSize: '11px' } as CSSProperties,
  caption: { fontWeight: 700, fontSize: '10px' } as CSSProperties,
}

// بطاقة صنف — عرض فقط (Phase 1، بلا سلة/إضافة). تدعم 4 تخطيطات مطابقة لـ ProductItem.jsx.
export default function ProductCard({
  product,
  brandColor,
  priceColor,
  descColor,
  layout = 'list',
  priority = false,
}: {
  product: MenuProduct
  brandColor: string
  priceColor: string
  descColor: string
  layout?: MenuLayout
  priority?: boolean
}) {
  const _priceColor = priceColor || brandColor
  const _descColor = descColor || '#9CA3AF'
  const pName = product.name
  const pDesc = product.description

  const badges = { bestSeller: product.is_best_seller === true, restaurantPick: product.is_featured === true }
  const renderTags = (position: CSSProperties = {}) => {
    if (!badges.restaurantPick && !badges.bestSeller) return null
    return (
      <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', zIndex: 1, ...position }}>
        {badges.bestSeller && <span style={{ fontSize: '9px', fontWeight: 800, color: '#92400E', background: '#FEF3C7', padding: '2px 7px', borderRadius: '100px', whiteSpace: 'nowrap' }}>الأكثر مبيعًا 🔥</span>}
        {badges.restaurantPick && <span style={{ fontSize: '9px', fontWeight: 800, color: '#1E5FBF', background: '#EAF3FF', padding: '2px 7px', borderRadius: '100px', whiteSpace: 'nowrap' }}>مختارات المطعم ⭐</span>}
      </div>
    )
  }

  if (layout === 'circles') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '6px 4px' }}>
        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <div style={{ position: 'relative', width: '104px', height: '104px', borderRadius: '50%', background: '#F8F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '44px', overflow: 'hidden', boxShadow: '0 6px 18px rgba(0,0,0,0.10)', border: '3px solid white' }}>
            {product.image_url ? <MenuImage src={product.image_url} alt={product.name} sizes="104px" priority={priority} /> : product.emoji}
          </div>
          {renderTags({ top: '-2px', right: '-2px', transform: 'scale(.82)', transformOrigin: 'top right' })}
        </div>
        <div style={{ ...TYPE.itemNameSm, color: '#0B0B0F', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{pName}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <span style={{ ...TYPE.priceSm, color: _priceColor }}>{product.price} ﷼</span>
          {product.compare_price && <span style={{ ...TYPE.caption, color: '#9CA3AF', textDecoration: 'line-through' }}>{product.compare_price} ﷼</span>}
        </div>
      </div>
    )
  }

  if (layout === 'grid') {
    return (
      <div style={{ background: 'white', borderRadius: '14px', overflow: 'hidden', border: '1px solid #F0F0F0' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', background: '#F8F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '46px', overflow: 'hidden' }}>
            {product.image_url ? <MenuImage src={product.image_url} alt={product.name} sizes="(min-width: 1024px) 467px, calc((100vw - 42px) / 2)" priority={priority} /> : product.emoji}
          </div>
          {renderTags()}
        </div>
        <div style={{ padding: '10px 12px' }}>
          <div style={{ ...TYPE.itemNameSm, color: '#0B0B0F', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pName}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ ...TYPE.priceSm, color: _priceColor }}>{product.price} ﷼</span>
            {product.compare_price && <span style={{ ...TYPE.caption, color: '#9CA3AF', textDecoration: 'line-through' }}>{product.compare_price} ﷼</span>}
          </div>
        </div>
      </div>
    )
  }

  if (layout === 'showcase') {
    return (
      <div style={{ background: 'white', borderRadius: '14px', overflow: 'hidden', border: '1px solid #F0F0F0' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: '#F8F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '52px', overflow: 'hidden' }}>
            {product.image_url ? <MenuImage src={product.image_url} alt={product.name} sizes="(min-width: 1024px) 467px, calc(100vw - 32px)" priority={priority} /> : product.emoji}
          </div>
          {renderTags()}
        </div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ ...TYPE.itemName, color: '#0B0B0F', marginBottom: '4px' }}>{pName}</div>
          {pDesc && <div style={{ ...TYPE.body, color: _descColor, marginBottom: '8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{pDesc}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ ...TYPE.price, color: _priceColor }}>{product.price} ﷼</span>
            {product.compare_price && <span style={{ ...TYPE.caption, color: '#9CA3AF', textDecoration: 'line-through' }}>{product.compare_price} ﷼</span>}
          </div>
        </div>
      </div>
    )
  }

  // list (افتراضي)
  return (
    <div style={{ background: 'white', padding: '12px 14px', display: 'flex', gap: '12px', alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYPE.itemName, color: '#0B0B0F', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pName}</div>
        {pDesc && <div style={{ ...TYPE.body, color: '#9CA3AF', marginBottom: '6px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{pDesc}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ ...TYPE.price, color: _priceColor, fontVariantNumeric: 'tabular-nums' }}>{product.price} ﷼</span>
          {product.compare_price && <span style={{ ...TYPE.caption, color: '#9CA3AF', textDecoration: 'line-through' }}>{product.compare_price} ﷼</span>}
          {product.calories && <span style={{ ...TYPE.meta, color: '#9CA3AF' }}>{getCalorieBadge(product.calories)} {product.calories}</span>}
        </div>
      </div>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'relative', width: '108px', height: '108px', borderRadius: '14px', background: '#F8F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          {product.image_url ? <MenuImage src={product.image_url} alt={product.name} sizes="108px" priority={priority} /> : product.emoji}
        </div>
        {renderTags()}
      </div>
    </div>
  )
}
