import { useEffect, useRef } from 'react'
import ProductItem from './ProductItem'

// جسم المنيو: شريط الأقسام (مع scroll-spy) + نتائج البحث + الأكثر مبيعاً + الأقسام وأصنافها
export default function MenuBody({
  categories, products, bestSellers, searchQuery,
  activeCategory, setActiveCategory,
  cart, addToCart, removeFromCart, onOpenProduct,
  brandColor, priceColor, descColor, isEn, t, tx, layout,
}) {
  const categoryObserverRef = useRef(null)

  // Scroll-spy: رصد القسم الظاهر حالياً أثناء التمرير، وتمييزه تلقائياً في شريط التبويبات + تمرير الشريط لإظهاره
  useEffect(() => {
    if (searchQuery || categories.length === 0) return

    if (categoryObserverRef.current) categoryObserverRef.current.disconnect()

    const observer = new IntersectionObserver(
      (entries) => {
        // من بين الأقسام المتقاطعة مع منطقة الرصد، نختار الأقرب لأعلى الشاشة
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length === 0) return
        const topMost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b
        )
        const catId = topMost.target.id.replace('cat-', '')
        setActiveCategory(prev => {
          if (prev === catId) return prev
          document.getElementById(`tab-${catId}`)?.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' })
          return catId
        })
      },
      { rootMargin: '-120px 0px -65% 0px', threshold: 0 }
    )

    // تأخير بسيط لضمان اكتمال رندرة React الفعلية للعناصر في DOM قبل محاولة ربطها بالـ Observer
    const timer = setTimeout(() => {
      categories.forEach(cat => {
        const el = document.getElementById(`cat-${cat.id}`)
        if (el) observer.observe(el)
      })
    }, 100)

    categoryObserverRef.current = observer
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [categories, searchQuery, bestSellers])

  // Filter products
  const filteredProducts = (catId) => {
    let prods = products.filter(p => p.category_id === catId)
    if (searchQuery) prods = products.filter(p => p.name.includes(searchQuery) || (p.description || '').includes(searchQuery))
    return prods
  }

  const allFiltered = searchQuery ? products.filter(p => p.name.includes(searchQuery)) : []

  const itemProps = (prod) => ({
    product: prod,
    cart,
    onAdd: () => onOpenProduct(prod),
    onQtyChange: (delta) => delta > 0 ? addToCart(prod, 1) : removeFromCart(`${prod.id}____`),
    brandColor, priceColor, descColor, isEn, layout,
  })

  return (
    <>
      {/* Category tabs */}
      {!searchQuery && (
        <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', overflowX:'auto', display:'flex', padding:'0 8px', position:'sticky', top:0, zIndex:10, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          {categories.map(cat => (
            <div
              key={cat.id}
              id={`tab-${cat.id}`}
              onClick={() => {
                setActiveCategory(cat.id)
                document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior:'smooth', block:'start' })
              }}
              style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:'3px',
                padding:'10px 14px', cursor:'pointer', flexShrink:0,
                borderBottom: activeCategory === cat.id ? `2.5px solid ${brandColor}` : '2.5px solid transparent',
                color: activeCategory === cat.id ? brandColor : '#6B7280',
                transition:'all 0.2s',
              }}
            >
              {cat.cover_url ? (
                <div style={{ width:'48px', height:'48px', borderRadius:'50%', overflow:'hidden', flexShrink:0 }}>
                  <img src={cat.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                </div>
              ) : (
                <span style={{ fontSize:'18px' }}>{cat.emoji}</span>
              )}
              <span style={{ fontSize:'12px', fontWeight:'700', whiteSpace:'nowrap' }}>{tx(cat,'name')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Menu content */}
      <div style={{ padding:'0 0 100px' }}>

        {/* Search results */}
        {searchQuery && (
          <div style={{ padding:'16px' }}>
            <div style={{ fontSize:'13px', color:'#9CA3AF', marginBottom:'12px' }}>
              {allFiltered.length} نتيجة لـ "{searchQuery}"
            </div>
            {allFiltered.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px', color:'#9CA3AF' }}>
                <div style={{ fontSize:'40px', opacity:0.3, marginBottom:'10px' }}>🔍</div>
                <div style={{ fontSize:'14px', fontWeight:'700', color:'#374151' }}>{t('noResults')}</div>
              </div>
            ) : (
              <div className="sm-products" style={['grid','circles'].includes(layout)
                ? { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', padding:'0 16px' }
                : { display:'flex', flexDirection:'column', gap:'1px', background:'#E5E7EB', borderRadius:'16px', overflow:'hidden' }
              }>
                {allFiltered.map(prod => <ProductItem key={prod.id} {...itemProps(prod)} />)}
              </div>
            )}
          </div>
        )}

        {/* Best sellers */}
        {!searchQuery && bestSellers.length > 0 && (
          <div style={{ marginBottom:'8px' }}>
            <div style={{ padding:'16px 16px 10px', display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ fontSize:'20px' }}>🔥</span>
              <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'17px', color:'#0F1117' }}>{t('bestSellers')}</h2>
            </div>
            <div className="sm-products" style={['grid','circles'].includes(layout)
              ? { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', padding:'0 16px' }
              : { display:'flex', flexDirection:'column', gap:'1px', background:'#F3F4F6' }
            }>
              {bestSellers.map(prod => (
                <ProductItem key={prod.id} {...itemProps(prod)} />
              ))}
            </div>
          </div>
        )}

        {/* Categories */}
        {!searchQuery && categories.map(cat => {
          const catProducts = filteredProducts(cat.id)
          if (catProducts.length === 0) return null
          return (
            <div key={cat.id} id={`cat-${cat.id}`} style={{ marginBottom:'8px' }}>
              <div style={{ padding:'16px 16px 10px', display:'flex', alignItems:'center', gap:'10px' }}>
                {cat.cover_url ? (
                  <div style={{ width:'36px', height:'36px', borderRadius:'10px', overflow:'hidden', flexShrink:0 }}>
                    <img src={cat.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  </div>
                ) : (
                  <span style={{ fontSize:'20px' }}>{cat.emoji}</span>
                )}
                <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'17px', color:'#0F1117' }}>{tx(cat,'name')}</h2>
                <span style={{ fontSize:'12px', color:'#9CA3AF', background:'#F3F4F6', padding:'2px 8px', borderRadius:'100px' }}>{catProducts.length}</span>
              </div>
              <div className="sm-products" style={['grid','circles'].includes(layout)
                ? { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', padding:'0 16px' }
                : { display:'flex', flexDirection:'column', gap:'1px', background:'#F3F4F6' }
              }>
                {catProducts.map(prod => (
                  <ProductItem key={prod.id} {...itemProps(prod)} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
