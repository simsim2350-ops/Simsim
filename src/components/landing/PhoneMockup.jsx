import { useMemo } from 'react'
import { useMenuData } from '../../features/menu/hooks/useMenuData'
import { computeBranchOpenStatus } from '../../features/menu/helpers'
import { LANDING_DEMO_RESTAURANT_SLUG } from '../../config/landingContent'

const localized = (ar, en) => en || ar || ''

// نموذج الهاتف في البطل يعرض نفس بيانات المنيو الحية؛ لا يحتوي على مطعم أو منتجات ثابتة.
export default function PhoneMockup() {
  const { restaurant, branch, categories, products, rating, loading, notFound } = useMenuData(LANDING_DEMO_RESTAURANT_SLUG)
  const openStatus = useMemo(() => branch ? computeBranchOpenStatus(branch) : null, [branch])
  const mostOrderedProducts = products.filter((product) => product.is_featured)
  const visibleProducts = (mostOrderedProducts.length > 0 ? mostOrderedProducts : products).slice(0, 4)
  const categoryTabs = [
    ...(mostOrderedProducts.length > 0 ? [{ id: 'most-ordered', name: 'الأكثر طلبًا 🔥' }] : []),
    ...categories.map((category) => ({ id: category.id, name: category.name })),
  ].slice(0, 4)

  if (loading) {
    return <div className="ss-phone" role="status" aria-label="جارٍ تحميل منيو سمسم"><div className="ss-phone__notch" /><div className="ss-phone__screen"><div className="ss-menuUI__loading">جارٍ تحميل منيو سمسم...</div></div></div>
  }

  if (notFound || !restaurant) return null

  return (
    <div className="ss-phone" role="img" aria-label={`معاينة منيو ${restaurant.name} على الجوال`}>
      <div className="ss-phone__notch" />
      <div className="ss-phone__screen">
        <div className="ss-menuUI">
          <div className="ss-menuUI__top" style={restaurant.cover_url ? { backgroundImage: `linear-gradient(135deg, rgba(139,92,246,.92), rgba(91,33,182,.94)), url("${restaurant.cover_url}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
            <div className="ss-menuUI__rest">{restaurant.name}</div>
            <div className="ss-menuUI__meta">
              {rating?.avg != null && <><span>⭐ {rating.avg.toFixed(1)}</span><span>•</span></>}
              <span>{openStatus?.open ? 'مفتوح الآن' : 'مغلق الآن'}</span>
              {branch?.name && <><span>•</span><span>{branch.name}</span></>}
            </div>
          </div>
          <div className="ss-menuUI__tabs">
            {categoryTabs.map((category, index) => <span className={`ss-menuUI__tab ${index === 0 ? 'is-active' : ''}`} key={category.id}>{category.name}</span>)}
          </div>
          <div className="ss-menuUI__list">
            {visibleProducts.map((product) => (
              <div className="ss-menuUI__item" key={product.id}>
                <div className="ss-menuUI__thumb">
                  {product.image_url ? <img src={product.image_url} alt="" /> : <span aria-hidden="true">{product.emoji || '🍽️'}</span>}
                </div>
                <div className="ss-menuUI__info">
                  <div className="ss-menuUI__name">{localized(product.name, product.name_en)}</div>
                  {product.description && <div className="ss-menuUI__desc">{localized(product.description, product.description_en)}</div>}
                  {product.is_featured && <span className="ss-menuUI__badge">الأكثر طلبًا 🔥</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                  <span className="ss-menuUI__price">{Number(product.price || 0)} ﷼</span>
                  <span className="ss-menuUI__add" aria-hidden="true">+</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
