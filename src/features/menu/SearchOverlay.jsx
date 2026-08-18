import { useEffect, useRef, useState } from 'react'
import ProductItem from './ProductItem'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { rankProducts } from './searchUtils'

const RECENT_KEY = 'sm_recent_searches'
const RECENT_MAX = 5

const loadRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || [] } catch { return [] } }
const saveRecent = (list) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))) } catch {} }

const chipStyle = {
  fontSize: '12.5px', fontWeight: '700', padding: '7px 13px', borderRadius: '100px',
  border: '1px solid #E5E7EB', background: '#F8F9FB', color: '#0B0B0F', cursor: 'pointer',
}

// شاشة بحث مستقلة (Overlay) — تفتح من زر البحث في الهيرو أو الهيدر المصغّر الدائم، بغضّ النظر عن موضع التمرير.
// قبل الكتابة: اقتراحات «الأكثر طلبًا» من المنتجات المميزة / عمليات بحث سابقة / الأقسام. أثناء الكتابة: نتائج حيّة مرتّبة بالأهمية.
export default function SearchOverlay({
  open, onClose, products, categories, bestSellers,
  cart, addToCart, removeFromCart, onOpenProduct,
  brandColor, priceColor, descColor, isEn, t, tx, layout, ordering = true,
}) {
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState([])
  const inputRef = useRef(null)
  useBodyScrollLock(open)

  useEffect(() => {
    if (open) {
      setRecent(loadRecent())
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
    }
  }, [open])

  if (!open) return null

  const commitSearch = (q) => {
    const trimmed = q.trim()
    if (!trimmed) return
    const next = [trimmed, ...recent.filter(r => r !== trimmed)].slice(0, RECENT_MAX)
    setRecent(next)
    saveRecent(next)
  }

  const mostOrdered = products.filter(p => p.is_featured).slice(0, 6)
  const bestSellerIds = new Set(bestSellers.map(p => p.id))
  const results = query.trim() ? rankProducts(query, products, { bestSellerIds }) : []

  const itemProps = (prod) => ({
    product: prod,
    cart,
    onAdd: () => { commitSearch(query); onOpenProduct(prod) },
    onQtyChange: (delta) => delta > 0 ? addToCart(prod, 1) : removeFromCart(`${prod.id}____`),
    brandColor, priceColor, descColor, isEn, layout, ordering,
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'white', display: 'flex', flexDirection: 'column', maxWidth: '480px', margin: '0 auto' }}>
      {/* شريط البحث */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 16px', borderBottom: '1px solid #F0F0F0', flexShrink: 0 }}>
        <button onClick={onClose} aria-label={isEn ? 'Back' : 'رجوع'} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#374151', cursor: 'pointer', padding: '4px', flexShrink: 0, lineHeight: 1 }}>
          {isEn ? '←' : '→'}
        </button>
        <div style={{ flex: 1, background: '#F8F9FB', borderRadius: '100px', border: `1.5px solid ${brandColor}55`, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
          <span style={{ padding: '9px 12px', fontSize: '15px', color: '#9CA3AF' }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitSearch(query) }}
            placeholder={t('search')}
            style={{ flex: 1, padding: '9px 4px', border: 'none', outline: 'none', fontFamily: 'Tajawal,sans-serif', fontSize: '14px', color: '#0B0B0F', background: 'transparent', textAlign: 'right' }}
          />
          {query && (
            <button onClick={() => { setQuery(''); inputRef.current?.focus() }} style={{ padding: '9px 12px', background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', color: '#9CA3AF' }}>✕</button>
          )}
        </div>
      </div>

      {/* المحتوى */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 40px', WebkitOverflowScrolling: 'touch' }}>
        {!query.trim() ? (
          <div style={{ padding: '12px 16px' }}>
            {mostOrdered.length > 0 && (
              <div style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '12px', fontWeight: '800', color: '#9CA3AF', marginBottom: '8px' }}>{t('mostOrdered')}</div>
                <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                  {mostOrdered.map(p => (
                    <button key={p.id} onClick={() => setQuery(isEn && p.name_en ? p.name_en : p.name)} style={chipStyle}>{isEn && p.name_en ? p.name_en : p.name}</button>
                  ))}
                </div>
              </div>
            )}
            {recent.length > 0 && (
              <div style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '12px', fontWeight: '800', color: '#9CA3AF', marginBottom: '8px' }}>🕓 {t('recentSearches')}</div>
                <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                  {recent.map(r => (
                    <button key={r} onClick={() => setQuery(r)} style={chipStyle}>{r}</button>
                  ))}
                </div>
              </div>
            )}
            {categories.length > 0 && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: '800', color: '#9CA3AF', marginBottom: '8px' }}>📂 {t('allCats')}</div>
                <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                  {categories.map(c => (
                    <button key={c.id} onClick={() => setQuery(tx(c, 'name'))} style={chipStyle}>{tx(c, 'name')}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : results.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px' }}>
            <div style={{ fontSize: '40px', opacity: 0.3, marginBottom: '10px' }}>🔍</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#374151', marginBottom: '4px' }}>{t('noResults')}</div>
            {categories.length > 0 && (
              <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '14px' }}>
                {categories.slice(0, 4).map(c => (
                  <button key={c.id} onClick={() => setQuery(tx(c, 'name'))} style={chipStyle}>{tx(c, 'name')}</button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize: '12.5px', color: '#9CA3AF', padding: '0 16px 10px' }}>
              {results.length} {isEn ? 'results' : 'نتيجة'}
            </div>
            <div className="sm-products" style={
              ['grid', 'circles'].includes(layout) ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '0 16px' }
              : layout === 'showcase' ? { display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 16px' }
              : { display: 'flex', flexDirection: 'column', gap: '1px', background: '#E5E7EB', borderRadius: '16px', overflow: 'hidden', margin: '0 16px' }
            }>
              {results.map(prod => <ProductItem key={prod.id} {...itemProps(prod)} />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
