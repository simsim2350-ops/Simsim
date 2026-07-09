import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import ErrBoundary from '../features/menu/ErrBoundary'
import { computeOpenStatus, makeItemName, estimatedPrepTime } from '../features/menu/helpers'
import { sendWhatsAppConfirmation, openWhatsAppContact, openWhatsAppAboutOrder } from '../features/menu/whatsapp'
import { useLang } from '../features/menu/hooks/useLang'
import { useMenuData } from '../features/menu/hooks/useMenuData'
import { useActiveOrders } from '../features/menu/hooks/useActiveOrders'
import { useCart } from '../features/menu/hooks/useCart'
import { useCheckout } from '../features/menu/hooks/useCheckout'
import { useLoyalty } from '../features/menu/hooks/useLoyalty'
import { useReviews } from '../features/menu/hooks/useReviews'
import MenuSkeleton from '../features/menu/MenuSkeleton'
import MenuHeader from '../features/menu/MenuHeader'
import MenuBody from '../features/menu/MenuBody'
import ProductModal from '../features/menu/ProductModal'
import CartDrawer from '../features/menu/CartDrawer'
import AllergensModal from '../features/menu/AllergensModal'
import BranchPickerScreen from '../features/menu/BranchPickerScreen'
import OrdersScreen from '../features/menu/OrdersScreen'

function PublicMenuInner() {
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const branchId = searchParams.get('branch')

  // ===== الحالة عبر الـ hooks (features/menu/hooks) =====
  const { isEn, toggleLang, t, tx } = useLang()
  const {
    restaurant, branch, setBranch, branchList, branchPicked, setBranchPicked,
    categories, products, bestSellers, loading, notFound,
    activeCategory, setActiveCategory, restaurantActiveOrdersCount, rating,
  } = useMenuData(slug, branchId)
  const { activeOrders, setActiveOrders, orderPlaced, setOrderPlaced, liveOrdersCount, cancelOrderByCustomer } = useActiveOrders(slug, t)
  const { cart, setCart, cartOpen, setCartOpen, addToCart, removeFromCart, incrementCartItem, cartTotal, cartCount } = useCart(t)
  const {
    tableNumber, setTableNumber, orderType, setOrderType,
    deliveryAddress, setDeliveryAddress, customerName, setCustomerName,
    customerPhone, setCustomerPhone, lastOrderSummary, placeOrder, submitting,
  } = useCheckout({ slug, restaurant, branch, cart, cartTotal, setCart, setCartOpen, setActiveOrders, setOrderPlaced, t })
  const loyalty = useLoyalty({ slug, restaurant, orderPlaced, activeOrders, customerPhone })
  const { reviewedIds, reviewDraft, setDraft, submitReview, submittingReview } = useReviews({ slug, restaurant, branch, t })

  // حالة عرض محلية للصفحة فقط
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAllergensModal, setShowAllergensModal] = useState(false)

  // ===== مشتقات =====
  const itemName = makeItemName(isEn, products)
  const brandColor = restaurant?.brand_color || '#FF6B35'
  const priceColor = restaurant?.price_color || brandColor
  const descColor = restaurant?.description_color || '#9CA3AF'

  // إعادة الطلب: يعيد أصناف طلب سابق للسلة مطابقاً كلاً منها بالصنف الحالي (سعر/توفّر محدّثان)،
  // يتجاهل ما لم يعد على المنيو، ثم يفتح المنيو مع ملخّص توست واحد.
  const reorderToCart = (order) => {
    const items = Array.isArray(order?.items) ? order.items : []
    let added = 0, skipped = 0
    items.forEach(it => {
      const product = products.find(p => p.id === it.id)
      if (!product) { skipped++; return }
      addToCart(product, it.qty || 1, it.notes || '', it.selectedOptions || [], true) // silent
      added++
    })
    if (added === 0) { toast.error(t('reorderNone')); return }
    setOrderPlaced(false)
    setCartOpen(true)
    toast.success(t('reorderAdded'))
    if (skipped > 0) setTimeout(() => toast(t('reorderSkipped'), { icon: '⚠️' }), 400)
  }

  // حالة فتح المحل (حسب الفرع لو محدد، وإلا المطعم) — تُستخدم لمنع الطلب وقت الإغلاق
  const openStatus = restaurant
    ? computeOpenStatus(branch?.opening_hours || restaurant.opening_hours)
    : { open: true, unknown: true, nextText: '', todayText: '' }

  // اقتراحات السلة: من أصناف «الأكثر طلباً» التي اختارها صاحب المطعم (is_featured)،
  // غير موجودة في السلة، وبلا خيارات إجبارية (حتى تكون الإضافة بضغطة واحدة)
  const cartSuggestions = products
    .filter(p => p.is_featured)
    .filter(p => !cart.some(i => i.id === p.id))
    .filter(p => !(Array.isArray(p.options) && p.options.some(g => g.required)))
    .slice(0, 3)

  // Loading — هيكل يحاكي شكل المنيو بدل شاشة فارغة
  if (loading) return <MenuSkeleton />

  // Not found
  if (notFound) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F8F9FB', flexDirection:'column', gap:'16px', fontFamily:'Cairo,sans-serif', direction:'rtl', textAlign:'center', padding:'24px' }}>
      <div style={{ fontSize:'64px' }}>🔍</div>
      <h2 style={{ fontSize:'22px', fontWeight:'900', color:'#0F1117' }}>{t('notFound')}</h2>
      <p style={{ color:'#9CA3AF', fontSize:'14px' }}>{t('notFoundSub')}</p>
    </div>
  )

  // ===== صفحة "اختر فرعك" — تظهر لو فيه فروع نشطة ولم يُحدَّد فرع في الرابط =====
  const chooseBranch = (b) => {
    if (b) {
      setBranch(b)
      setSearchParams({ branch: b.id })
    } else {
      setBranch(null)
      setSearchParams({})
    }
    setBranchPicked(true)
    window.scrollTo(0, 0)
  }

  if (!branchPicked && branchList.length > 0) {
    return (
      <BranchPickerScreen
        restaurant={restaurant}
        branchList={branchList}
        brandColor={brandColor}
        isEn={isEn}
        t={t}
        onChoose={chooseBranch}
      />
    )
  }

  // Order placed / tracking screen — يعرض كل الطلبات النشطة، الأحدث أولاً
  if (orderPlaced) return (
    <OrdersScreen
      restaurant={restaurant}
      brandColor={brandColor}
      isEn={isEn}
      t={t}
      itemName={itemName}
      activeOrders={activeOrders}
      liveOrdersCount={liveOrdersCount}
      loyalty={loyalty}
      prepTime={estimatedPrepTime(restaurantActiveOrdersCount)}
      reviewedIds={reviewedIds}
      reviewDraft={reviewDraft}
      setDraft={setDraft}
      submitReview={(order) => submitReview(order, { customerName, customerPhone })}
      submittingReview={submittingReview}
      cancelOrderByCustomer={cancelOrderByCustomer}
      lastOrderSummary={lastOrderSummary}
      sendWhatsAppConfirmation={() => sendWhatsAppConfirmation({ restaurant, lastOrderSummary, isEn, t })}
      onBack={() => setOrderPlaced(false)}
      onReorder={reorderToCart}
      onMessage={(order) => openWhatsAppAboutOrder({ restaurant, order, t })}
    />
  )

  return (
    <div className="sm-menu-frame" style={{ minHeight:'100vh', background:'#F8F9FB', direction:'rtl', fontFamily:'Tajawal,sans-serif', maxWidth:'480px', margin:'0 auto', position:'relative' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        * { box-sizing: border-box; }
        html, body { background: #E4E7EE; }
        /* تابلت: إطار متمركز أنيق (اتجاه أ) */
        @media (min-width: 600px) and (max-width: 1023px) {
          .sm-menu-frame { box-shadow: 0 0 0 100vw #E4E7EE, 0 0 60px rgba(15,17,23,0.14); }
          .sm-wa-btn { left: calc(50% - 240px + 16px) !important; }
        }
        /* لابتوب: تخطيط عريض + الأصناف عمودين (اتجاه ب) */
        @media (min-width: 1024px) {
          .sm-menu-frame { max-width: 980px !important; box-shadow: 0 0 0 100vw #E4E7EE, 0 0 70px rgba(15,17,23,0.14); }
          .sm-products { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 14px !important; background: transparent !important; padding: 0 16px !important; }
          .sm-wa-btn { left: calc(50% - 490px + 16px) !important; }
        }
      `}</style>

      {/* Restaurant Header */}
      <MenuHeader
        restaurant={restaurant}
        branch={branch}
        brandColor={brandColor}
        descColor={descColor}
        openStatus={openStatus}
        activeOrdersCount={restaurantActiveOrdersCount}
        isEn={isEn}
        t={t}
        tx={tx}
        toggleLang={toggleLang}
        hasOrders={activeOrders.length > 0}
        liveOrdersCount={liveOrdersCount}
        onShowOrders={() => setOrderPlaced(true)}
        onShowAllergens={() => setShowAllergensModal(true)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        hasBranches={branchList.length > 0}
        onChangeBranch={() => { setBranchPicked(false); window.scrollTo(0, 0) }}
        rating={rating}
        loyalty={loyalty}
      />

      {/* Category tabs + menu content */}
      <MenuBody
        categories={categories}
        products={products}
        bestSellers={bestSellers}
        searchQuery={searchQuery}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        cart={cart}
        addToCart={addToCart}
        removeFromCart={removeFromCart}
        onOpenProduct={setSelectedProduct}
        brandColor={brandColor}
        priceColor={priceColor}
        descColor={descColor}
        isEn={isEn}
        t={t}
        tx={tx}
        layout={restaurant.menu_layout}
      />

      {/* Floating cart button */}
      {cartCount > 0 && !cartOpen && (
        <div style={{ position:'fixed', bottom:'20px', right:'50%', transform:'translateX(50%)', width:'calc(100% - 32px)', maxWidth:'448px', zIndex:50 }}>
          <button
            onClick={() => setCartOpen(true)}
            style={{ width:'100%', padding:'0 16px', height:'58px', borderRadius:'16px', border:'none', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, color:'white', cursor:'pointer', display:'flex', alignItems:'center', boxShadow:`0 8px 32px ${brandColor}55`, transition:'all 0.2s' }}
          >
            <div style={{ width:'28px', height:'28px', background:'rgba(0,0,0,0.15)', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px' }}>{cartCount}</div>
            <span style={{ flex:1, textAlign:'center', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px' }}>{t('viewCart')}</span>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px' }}>{cartTotal} ﷼</span>
          </button>
        </div>
      )}

      {/* Floating WhatsApp contact button — للاستفسارات العامة بمعزل عن طلب فعلي */}
      {restaurant?.phone && !cartOpen && (
        <button
          onClick={() => openWhatsAppContact({ restaurant, t })}
          className="sm-wa-btn"
          style={{
            position:'fixed', bottom: cartCount > 0 ? '90px' : '20px', left:'16px',
            width:'52px', height:'52px', borderRadius:'50%', border:'none',
            background:'#25D366', color:'white', fontSize:'26px',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 6px 20px rgba(37,211,102,0.45)', cursor:'pointer', zIndex:49,
            transition:'bottom 0.2s',
          }}
          aria-label="تواصل عبر واتساب"
        >
          💬
        </button>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <CartDrawer
          cart={cart}
          cartCount={cartCount}
          cartTotal={cartTotal}
          restaurant={restaurant}
          brandColor={brandColor}
          isEn={isEn}
          t={t}
          itemName={itemName}
          orderType={orderType}
          setOrderType={setOrderType}
          customerName={customerName}
          setCustomerName={setCustomerName}
          customerPhone={customerPhone}
          setCustomerPhone={setCustomerPhone}
          tableNumber={tableNumber}
          setTableNumber={setTableNumber}
          deliveryAddress={deliveryAddress}
          setDeliveryAddress={setDeliveryAddress}
          openStatus={openStatus}
          placeOrder={placeOrder}
          submitting={submitting}
          removeFromCart={removeFromCart}
          incrementCartItem={incrementCartItem}
          onClose={() => setCartOpen(false)}
          suggestions={cartSuggestions}
          onAddSuggestion={(p) => addToCart(p, 1)}
        />
      )}

      {/* Product modal */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          brandColor={brandColor}
          priceColor={priceColor}
          isEn={isEn}
          t={t}
          onAdd={addToCart}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Allergens Modal */}
      {showAllergensModal && (
        <AllergensModal
          restaurant={restaurant}
          isEn={isEn}
          t={t}
          onClose={() => setShowAllergensModal(false)}
        />
      )}
    </div>
  )
}

// الغلاف: يلفّ المنيو كله بمصيدة الأخطاء (أي خطأ في أي مكان يظهر كنص بدل شاشة بيضاء)
export default function PublicMenu() {
  return (
    <ErrBoundary>
      <PublicMenuInner />
    </ErrBoundary>
  )
}
