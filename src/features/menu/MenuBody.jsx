import { useEffect, useRef, useState } from 'react'
import ProductItem from './ProductItem'
import HProductCard from './HProductCard'

// جسم المنيو: شريط الأقسام (مع scroll-spy) + يعجب زبائننا (أفقي) + الأكثر طلباً (عمودي) + الأقسام
export default function MenuBody({
  categories, products, bestSellers, searchQuery,
  activeCategory, setActiveCategory,
  cart, addToCart, removeFromCart, onOpenProduct,
  brandColor, priceColor, descColor, isEn, t, tx, layout,
}) {
  // «الأكثر طلباً» = الأصناف التي علّمها صاحب المطعم (is_featured) — يُعرض منها 4 في القسم
  const mostOrdered = products.filter(p => p.is_featured).slice(0, 4)
  const categoryObserverRef = useRef(null)
  const [catsOpen, setCatsOpen] = useState(false) // قائمة كل الأقسام (زر ☰)

  // الانتقال لقسم: من التبويب مباشرة أو من قائمة ☰ (مع مهلة قصيرة لإغلاقها أولاً)
  const goToCategory = (catId, fromSheet = false) => {
    setActiveCategory(catId)
    const scroll = () => document.getElementById(`cat-${catId}`)?.scrollIntoView({ behavior:'smooth', block:'start' })
    if (fromSheet) { setCatsOpen(false); setTimeout(scroll, 60) } else scroll()
  }

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
      {/* Category tabs — نصية رفيعة بخط سفلي + زر ☰ لكل الأقسام */}
      {!searchQuery && (
        <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', padding:'0 4px', position:'sticky', top:'56px'/* =ارتفاع الهيدر المصغّر الدائم، ليلتصق أسفله لا خلفه */, zIndex:10, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          <button onClick={() => setCatsOpen(true)} aria-label="كل الأقسام" style={{ border:'none', background:'none', fontSize:'17px', color:'#374151', padding:'8px 10px', cursor:'pointer', flexShrink:0, lineHeight:1 }}>☰</button>
          <div style={{ overflowX:'auto', display:'flex', flex:1 }}>
            {categories.map(cat => (
              <div
                key={cat.id}
                id={`tab-${cat.id}`}
                onClick={() => goToCategory(cat.id)}
                style={{
                  padding:'11px 11px 9px', cursor:'pointer', flexShrink:0, whiteSpace:'nowrap',
                  fontSize:'13px', fontFamily:'Cairo,sans-serif',
                  fontWeight: activeCategory === cat.id ? '900' : '700',
                  borderBottom: activeCategory === cat.id ? `2.5px solid ${brandColor}` : '2.5px solid transparent',
                  color: activeCategory === cat.id ? '#0F1117' : '#9CA3AF',
                  transition:'all 0.2s',
                }}
              >
                {tx(cat,'name')}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* قائمة كل الأقسام — تفتح من زر ☰ */}
      {catsOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={() => setCatsOpen(false)}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', animation:'fadeIn 0.2s ease' }}/>
          <div onClick={e => e.stopPropagation()} style={{ position:'relative', background:'white', width:'100%', maxWidth:'480px', borderRadius:'24px 24px 0 0', padding:'12px 16px 24px', maxHeight:'70vh', overflowY:'auto', animation:'slideUp 0.25s ease' }}>
            <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'100px', margin:'0 auto 14px' }}/>
            <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', margin:'0 0 12px', textAlign:'center' }}>{t('allCats')}</h3>
            {categories.map(cat => {
              const count = products.filter(p => p.category_id === cat.id).length
              const isActive = activeCategory === cat.id
              return (
                <div key={cat.id} onClick={() => goToCategory(cat.id, true)} style={{ display:'flex', alignItems:'center', gap:'11px', padding:'11px 10px', borderRadius:'12px', cursor:'pointer', background: isActive ? `${brandColor}0D` : 'transparent', marginBottom:'2px' }}>
                  {cat.cover_url ? (
                    <div style={{ width:'36px', height:'36px', borderRadius:'10px', overflow:'hidden', flexShrink:0 }}>
                      <img loading="lazy" decoding="async" src={cat.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    </div>
                  ) : (
                    <span style={{ fontSize:'20px', width:'36px', textAlign:'center' }}>{cat.emoji}</span>
                  )}
                  <span style={{ flex:1, fontSize:'14px', fontWeight: isActive ? '900' : '700', fontFamily:'Cairo,sans-serif', color: isActive ? brandColor : '#0F1117' }}>{tx(cat,'name')}</span>
                  <span style={{ fontSize:'11px', color:'#9CA3AF', background:'#F3F4F6', padding:'2px 9px', borderRadius:'100px' }}>{count}</span>
                </div>
              )
            })}
          </div>
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

        {/* يعجب زبائننا — تلقائية من المبيعات، شريط أفقي منزلق بـ4 أصناف */}
        {!searchQuery && bestSellers.length > 0 && (
          <div style={{ marginBottom:'10px' }}>
            <div style={{ padding:'16px 16px 10px' }}>
              <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'17px', color:'#0F1117', margin:0 }}>{t('bestSellers')}</h2>
            </div>
            <div style={{ display:'flex', gap:'10px', overflowX:'auto', padding:'0 16px 4px', WebkitOverflowScrolling:'touch' }}>
              {bestSellers.map(prod => (
                <HProductCard
                  key={prod.id}
                  product={prod}
                  onOpen={() => onOpenProduct(prod)}
                  onQuickAdd={() => addToCart(prod, 1)}
                  brandColor={brandColor}
                  priceColor={priceColor}
                  isEn={isEn}
                />
              ))}
            </div>
          </div>
        )}

        {/* الأكثر طلباً — اختيار صاحب المطعم (is_featured)، بطاقات مربعة دائماً (شبكة) بغضّ النظر عن تخطيط المطعم */}
        {!searchQuery && mostOrdered.length > 0 && (
          <div style={{ marginBottom:'8px' }}>
            <div style={{ padding:'16px 16px 10px' }}>
              <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'17px', color:'#0F1117', margin:0 }}>{t('mostOrdered')}</h2>
            </div>
            <div className="sm-products" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', padding:'0 16px' }}>
              {mostOrdered.map(prod => (
                <ProductItem key={prod.id} {...itemProps(prod)} layout="grid" />
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
                    <img loading="lazy" decoding="async" src={cat.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
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
