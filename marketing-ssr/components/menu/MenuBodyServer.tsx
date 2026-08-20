import type { CSSProperties } from 'react'
import type { MenuCategory, MenuLayout, MenuProduct } from '@/lib/menu-types'
import MenuImage from './MenuImage'
import ProductCard from './ProductCard'

const HEADING = 'Tajawal,sans-serif'
const sectionTitle: CSSProperties = { fontFamily: HEADING, fontWeight: 800, fontSize: '16px' }
const metaType: CSSProperties = { fontWeight: 700, fontSize: '11px' }
const tabType: CSSProperties = { fontFamily: HEADING, fontSize: '13px' }

// جسم المنيو — نسخة Server Rendering (Phase 1): شريط أقسام + الأكثر مبيعًا + مختارات المطعم + الأقسام.
// التبويبات روابط ثابتة (#cat-id) بلا JavaScript؛ التمرير السلس عبر CSS scroll-behavior.
// المُؤجَّل (Phase 5 كـ Client Islands): scroll-spy، قائمة ☰، prefetch، إضافة للسلة.
export default function MenuBodyServer({
  categories,
  products,
  manualBestSellers,
  featuredProducts,
  brandColor,
  priceColor,
  descColor,
  layout,
}: {
  categories: MenuCategory[]
  products: MenuProduct[]
  manualBestSellers: MenuProduct[]
  featuredProducts: MenuProduct[]
  brandColor: string
  priceColor: string
  descColor: string
  layout: MenuLayout
}) {
  const filteredProducts = (catId: string) => products.filter((p) => p.category_id === catId)
  const activeCategory = categories[0]?.id || null
  const firstCategoryProduct = categories
    .map((category) => products.find((product) => product.category_id === category.id))
    .find(Boolean)
  const prioritySection = manualBestSellers.length ? 'manual' : featuredProducts.length ? 'featured' : 'categories'

  const gridContainer: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '0 16px' }
  const categoryContainer = (): CSSProperties =>
    ['grid', 'circles'].includes(layout)
      ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '0 16px' }
      : layout === 'showcase'
        ? { display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 16px' }
        : { display: 'flex', flexDirection: 'column', gap: '1px', background: '#F3F4F6' }

  return (
    <>
      {/* شريط الأقسام — روابط ثابتة، أول قسم نشط افتراضياً (مطابق لحالة SPA الأولية) */}
      <div style={{ background: 'white', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', padding: '0 4px', position: 'sticky', top: '56px', zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <span aria-hidden style={{ background: 'none', fontSize: '17px', color: '#374151', padding: '8px 10px', flexShrink: 0, lineHeight: 1 }}>☰</span>
        <div style={{ overflowX: 'auto', display: 'flex', flex: 1 }}>
          {categories.map((cat) => (
            <a
              key={cat.id}
              href={`#cat-${cat.id}`}
              style={{
                padding: '11px 11px 9px', flexShrink: 0, whiteSpace: 'nowrap', textDecoration: 'none', ...tabType,
                fontWeight: activeCategory === cat.id ? 800 : 700,
                borderBottom: activeCategory === cat.id ? `2.5px solid ${brandColor}` : '2.5px solid transparent',
                color: activeCategory === cat.id ? '#0B0B0F' : '#9CA3AF',
              }}
            >
              {cat.name}
            </a>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 0 100px' }}>
        {/* الأكثر مبيعًا — اختيار يدوي من مالك المطعم */}
        {manualBestSellers.length > 0 && (
          <div style={{ marginBottom: '6px' }}>
            <div style={{ padding: '12px 16px 8px' }}>
              <h2 style={{ ...sectionTitle, color: '#0B0B0F', margin: 0 }}>الأكثر مبيعًا 🔥</h2>
            </div>
            <div className="sm-products" style={gridContainer}>
              {manualBestSellers.map((prod, index) => (
                <ProductCard key={prod.id} product={prod} brandColor={brandColor} priceColor={priceColor} descColor={descColor} layout="grid" priority={prioritySection === 'manual' && index === 0} />
              ))}
            </div>
          </div>
        )}

        {/* مختارات المطعم */}
        {featuredProducts.length > 0 && (
          <div style={{ marginBottom: '6px' }}>
            <div style={{ padding: '12px 16px 8px' }}>
              <h2 style={{ ...sectionTitle, color: '#0B0B0F', margin: 0 }}>مختارات المطعم ⭐</h2>
            </div>
            <div className="sm-products" style={gridContainer}>
              {featuredProducts.map((prod, index) => (
                <ProductCard key={prod.id} product={prod} brandColor={brandColor} priceColor={priceColor} descColor={descColor} layout="grid" priority={prioritySection === 'featured' && index === 0} />
              ))}
            </div>
          </div>
        )}

        {/* الأقسام */}
        {categories.map((cat) => {
          const catProducts = filteredProducts(cat.id)
          if (catProducts.length === 0) return null
          return (
            <div key={cat.id} id={`cat-${cat.id}`} style={{ marginBottom: '6px', scrollMarginTop: '104px' }}>
              <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {cat.cover_url ? (
                  <div style={{ position: 'relative', width: '36px', height: '36px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0 }}>
                    <MenuImage src={cat.cover_url} alt="" sizes="36px" />
                  </div>
                ) : (
                  <span style={{ fontSize: '20px' }}>{cat.emoji}</span>
                )}
                <h2 style={{ ...sectionTitle, color: '#0B0B0F' }}>{cat.name}</h2>
                <span style={{ ...metaType, color: '#9CA3AF', background: '#F3F4F6', padding: '2px 8px', borderRadius: '100px' }}>{catProducts.length}</span>
              </div>
              <div className="sm-products" style={categoryContainer()}>
                {catProducts.map((prod, index) => (
                  <ProductCard key={prod.id} product={prod} brandColor={brandColor} priceColor={priceColor} descColor={descColor} layout={layout} priority={prioritySection === 'categories' && prod.id === firstCategoryProduct?.id && index === 0} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
