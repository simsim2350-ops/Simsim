import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { track } from '../lib/analytics'
import ErrBoundary from '../features/menu/ErrBoundary'
import { computeBranchOpenStatus, effectiveDeliverySettings, makeItemName, estimatedPrepTime } from '../features/menu/helpers'
import { openWhatsAppAboutOrder } from '../features/menu/whatsapp'
import { useLang } from '../features/menu/hooks/useLang'
import { useMenuData } from '../features/menu/hooks/useMenuData'
import { useActiveOrders } from '../features/menu/hooks/useActiveOrders'
import { useCart } from '../features/menu/hooks/useCart'
import { useCheckout } from '../features/menu/hooks/useCheckout'
import { useCoupon } from '../features/menu/hooks/useCoupon'
import { useLoyalty } from '../features/menu/hooks/useLoyalty'
import { useTables } from '../features/menu/hooks/useTables'
import { useRecommendationRules } from '../features/menu/hooks/useRecommendationRules'
import { useSmartSuggestions } from '../features/menu/hooks/useSmartSuggestions'
import { useCartWideIds } from '../features/menu/hooks/useCartWideIds'
import { useReviews } from '../features/menu/hooks/useReviews'
import MenuSkeleton from '../features/menu/MenuSkeleton'
import MenuHeader from '../features/menu/MenuHeader'
import MenuBody from '../features/menu/MenuBody'
import SearchOverlay from '../features/menu/SearchOverlay'
import ProductModal from '../features/menu/ProductModal'
import CartDrawer from '../features/menu/CartDrawer'
import AllergensModal from '../features/menu/AllergensModal'
import OrdersScreen from '../features/menu/OrdersScreen'

function PublicMenuInner() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const branchId = searchParams.get('branch')

  // ===== الحالة عبر الـ hooks (features/menu/hooks) =====
  const { isEn, toggleLang, t, tx } = useLang()
  const {
    restaurant, branch,
    categories, products, bestSellers, loading, notFound,
    activeCategory, setActiveCategory, restaurantActiveOrdersCount, rating, loyaltyEnabled,
    banners, coupons, capabilities,
  } = useMenuData(slug, branchId)
  // قدرات منيو الزبون (PCR — ADR-40): الطلبات أونلاين والتقييمات. إخفاء تام عند الإطفاء.
  const ordering = capabilities?.online_orders !== false
  const reviewsEnabled = capabilities?.reviews !== false
  // تفاصيل المنتج (PCR): عند التعطيل لا تُفتح نافذة المنتج عند الضغط (منيو عرض بلا تفاصيل).
  const productDetails = capabilities?.product_details !== false
  const { activeOrders, setActiveOrders, orderPlaced, setOrderPlaced, liveOrdersCount, cancelOrderByCustomer } = useActiveOrders(slug, t)
  const { cart, setCart, cartOpen, setCartOpen, addToCart: addToCartRaw, removeFromCart, incrementCartItem, deleteCartItem, updateCartItem, cartTotal, cartCount } = useCart(slug, t)
  // تغليف الإضافة للسلة لبثّ حدث تحليلات مركزياً (ADR-42/M2) — إطلاق-وانسَ، لا يغيّر السلوك.
  const addToCart = (...args) => {
    track('cart.item_added', { restaurantId: restaurant?.id, branchId: branch?.id, entityType: 'product', entityId: args?.[0]?.id, props: { qty: args?.[1] ?? 1 } })
    return addToCartRaw(...args)
  }
  const { couponInput, setCouponInput, appliedCoupon, applyCoupon, removeCoupon, applying: applyingCoupon, discountAmount } = useCoupon({ restaurant, branch, cartTotal })
  const {
    tableNumber, setTableNumber, orderType, setOrderType,
    deliveryAddress, setDeliveryAddress, customerName, setCustomerName,
    customerPhone, setCustomerPhone, orderNote, setOrderNote, placeOrder, submitting,
  } = useCheckout({ slug, restaurant, branch, cart, cartTotal, setCart, setCartOpen, setActiveOrders, setOrderPlaced, t, appliedCoupon, discountAmount, removeCoupon })
  const loyalty = useLoyalty({ slug, restaurant, orderPlaced, activeOrders, customerPhone })
  const { tables } = useTables(restaurant)
  const recommendationsMap = useRecommendationRules(restaurant)
  const cartWideIds = useCartWideIds(restaurant, branch)
  const { reviewedIds, reviewDraft, setDraft, submitReview, submittingReview } = useReviews({ slug, restaurant, branch, t })

  // حالة عرض محلية للصفحة فقط
  const [selectedProduct, setSelectedProduct] = useState(null)
  // فتح نافذة المنتج — مُعطَّل تماماً لو قدرة «تفاصيل المنتج» مطفأة (الضغط لا يفتح شيئاً).
  // يبثّ حدث تحليلات عند الفتح الفعلي فقط (ADR-42/M2).
  const openProduct = (p) => {
    if (!productDetails) return
    track('menu.product_viewed', { restaurantId: restaurant?.id, branchId: branch?.id, entityType: 'product', entityId: p?.id })
    setSelectedProduct(p)
  }
  const [editingCartItem, setEditingCartItem] = useState(null) // { item, product, initialOptions } — تعديل صنف من السلة (✎)
  const [searchOpen, setSearchOpen] = useState(false)

  // بثّ أحداث القمع مركزياً (ADR-42/M2) — إطلاق-وانسَ، fail-open، لا يغيّر السلوك.
  const viewedRef = useRef(null)
  useEffect(() => {
    if (restaurant?.id && branch?.id && viewedRef.current !== branch.id) {
      viewedRef.current = branch.id
      track('menu.viewed', { restaurantId: restaurant.id, branchId: branch.id })
    }
  }, [restaurant?.id, branch?.id])
  const orderTrackedRef = useRef(false)
  useEffect(() => {
    if (orderPlaced && !orderTrackedRef.current) {
      orderTrackedRef.current = true
      track('order.placed', { restaurantId: restaurant?.id, branchId: branch?.id })
    }
  }, [orderPlaced])
  const [showAllergensModal, setShowAllergensModal] = useState(false)

  // ===== مشتقات =====
  const itemName = makeItemName(isEn, products)
  const brandColor = restaurant?.brand_color || '#FF6B35'
  const priceColor = restaurant?.price_color || brandColor
  const descColor = restaurant?.description_color || '#9CA3AF'

  // تعديل صنف من السلة (✎): يفتح المودال معبّأً بالكمية/الملاحظة/الخيارات المحفوظة
  const startEditCartItem = (item) => {
    const product = products.find(p => p.id === item.id)
    if (!product) return // الصنف لم يعد على المنيو — نتجاهل
    // تحويل الخيارات المحفوظة {groupName, choiceName} إلى مؤشرات المودال { groupIdx: choiceIdx | [..] }
    const initialOptions = {}
    const groups = Array.isArray(product.options) ? product.options : []
    groups.forEach((group, gi) => {
      const sel = (item.selectedOptions || []).filter(o => o.groupName === group.name)
      if (sel.length === 0) return
      if (group.type === 'multiple') {
        const idxs = sel.map(o => group.choices.findIndex(c => c.name === o.choiceName)).filter(i => i >= 0)
        if (idxs.length > 0) initialOptions[gi] = idxs
      } else {
        const idx = group.choices.findIndex(c => c.name === sel[0].choiceName)
        if (idx >= 0) initialOptions[gi] = idx
      }
    })
    setEditingCartItem({ item, product, initialOptions })
  }

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

  // حالة فتح المحل — كل فرع ساعاته المستقلة والإغلاق المؤقت الخاص به، تُستخدم لمنع الطلب وقت الإغلاق
  const openStatus = branch
    ? computeBranchOpenStatus(branch)
    : { open: true, unknown: true, nextText: '', todayText: '' }

  // إعدادات التوصيل الفعلية: تخصيص الفرع إن وُجد، وإلا وراثة إعداد المطعم العام
  const delivery = effectiveDeliverySettings(branch, restaurant)
  const takeawayEnabled = branch?.takeaway_enabled ?? true

  // محرك الاقتراحات الذكي: قواعد المطعم اليدوية ← نفس القسم ← الأكثر مبيعاً (ADR-13)
  const cartSuggestions = useSmartSuggestions({ cart, products, restaurant, cartWideIds })

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

  // Order placed / tracking screen — يعرض كل الطلبات النشطة، الأحدث أولاً
  if (orderPlaced) return (
    <OrdersScreen
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
      reviewsEnabled={reviewsEnabled}
      ordering={ordering}
      cancelOrderByCustomer={cancelOrderByCustomer}
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
        /* ===== Hero Design Tokens (ADR-43) — المصدر الوحيد لأبعاد الهيرو/البطاقة =====
           عدّلها من هنا فقط. القيَم Fluid عبر clamp() (تتدرّج مع العرض بلا قفزات، بلا vh).
           ملاحظة مرحلية: image-h/overlap/logo تبقى ثابتة في المرحلة 1 (مرتبطة بعتبات الـMorph)
           وتتحوّل إلى clamp في المرحلة 2 مع إعادة معايرة العتبات. */
        .sm-menu-frame {
          -webkit-text-size-adjust: 100%;   /* يوقف تضخيم الخط في بعض متصفّحات أندرويد → تجربة موحّدة */
          text-size-adjust: 100%;
          --hero-image-h: 128px;                    /* ارتفاع شريط الصورة (م2 → clamp) */
          --hero-overlap: 76px;                     /* تداخل البطاقة فوق الصورة (م2 → clamp) */
          --hero-radius: 22px;                      /* حواف البطاقة (الهوية — لا تتغيّر) */
          --hero-pad-x: 16px;                       /* حشو أفقي للبطاقة */
          --hero-pad-bottom: clamp(3px, 1.2vw, 6px);/* حشو سفلي — يزيل الفراغ الأبيض */
          --hero-spacing: clamp(2px, 0.7vw, 5px);   /* إيقاع رأسي موحّد بين صفوف المحتوى */
          --hero-logo: clamp(44px, 12.5vw, 52px);   /* الشعار — Fluid، أصغر قليلاً على الشاشات الصغيرة */
          --hero-social: clamp(26px, 7vw, 28px);    /* أيقونة تواصل (fluid) */
          --hero-stat-pad-y: 3px;                   /* حشو رأسي لبطاقة الإحصائيات (مضغوط) */
        }
        /* تابلت: إطار متمركز أنيق (اتجاه أ) */
        @media (min-width: 600px) and (max-width: 1023px) {
          .sm-menu-frame { box-shadow: 0 0 0 100vw #E4E7EE, 0 0 60px rgba(15,17,23,0.14); }
        }
        /* لابتوب: تخطيط عريض + الأصناف عمودين (اتجاه ب) */
        @media (min-width: 1024px) {
          .sm-menu-frame { max-width: 980px !important; box-shadow: 0 0 0 100vw #E4E7EE, 0 0 70px rgba(15,17,23,0.14); }
          .sm-products { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 14px !important; background: transparent !important; padding: 0 16px !important; }
        }
      `}</style>

      {/* Restaurant Header */}
      <MenuHeader
        restaurant={restaurant}
        branch={branch}
        brandColor={brandColor}
        descColor={descColor}
        openStatus={openStatus}
        deliveryEnabled={delivery.enabled}
        deliveryFee={delivery.fee}
        activeOrdersCount={restaurantActiveOrdersCount}
        isEn={isEn}
        t={t}
        tx={tx}
        toggleLang={toggleLang}
        hasOrders={activeOrders.length > 0}
        liveOrdersCount={liveOrdersCount}
        onShowOrders={() => setOrderPlaced(true)}
        onShowAllergens={() => setShowAllergensModal(true)}
        onToggleSearch={() => setSearchOpen(true)}
        rating={rating}
        loyalty={loyalty}
        banners={banners}
        coupons={coupons}
      />

      {/* Category tabs + menu content */}
      <MenuBody
        categories={categories}
        products={products}
        bestSellers={bestSellers}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        cart={cart}
        addToCart={addToCart}
        removeFromCart={removeFromCart}
        onOpenProduct={openProduct}
        brandColor={brandColor}
        priceColor={priceColor}
        descColor={descColor}
        isEn={isEn}
        t={t}
        tx={tx}
        layout={restaurant.menu_layout}
        ordering={ordering}
      />

      {/* شاشة البحث المستقلة — تفتح من أي زر بحث في الهيدر بغضّ النظر عن موضع التمرير */}
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        products={products}
        categories={categories}
        bestSellers={bestSellers}
        cart={cart}
        addToCart={addToCart}
        removeFromCart={removeFromCart}
        onOpenProduct={openProduct}
        brandColor={brandColor}
        priceColor={priceColor}
        descColor={descColor}
        isEn={isEn}
        t={t}
        tx={tx}
        layout={restaurant.menu_layout}
        ordering={ordering}
      />

      {/* Floating cart button — يُخفى تماماً لو الطلبات أونلاين مُطفأة في الباقة (PCR) */}
      {ordering && cartCount > 0 && !cartOpen && (
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

      {/* Cart drawer — يُحجب لو الطلبات أونلاين مُطفأة */}
      {ordering && cartOpen && (
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
          orderNote={orderNote}
          setOrderNote={setOrderNote}
          tables={tables}
          openStatus={openStatus}
          deliveryEnabled={delivery.enabled}
          deliveryFee={delivery.fee}
          takeawayEnabled={takeawayEnabled}
          placeOrder={placeOrder}
          submitting={submitting}
          removeFromCart={removeFromCart}
          incrementCartItem={incrementCartItem}
          onDeleteItem={deleteCartItem}
          onEditItem={startEditCartItem}
          onClose={() => setCartOpen(false)}
          suggestions={cartSuggestions}
          onAddSuggestion={(p) => addToCart(p, 1)}
          onOpenSuggestion={(p) => openProduct(p)}
          loyalty={loyalty}
          couponInput={couponInput}
          setCouponInput={setCouponInput}
          appliedCoupon={appliedCoupon}
          applyCoupon={applyCoupon}
          removeCoupon={removeCoupon}
          applyingCoupon={applyingCoupon}
          discountAmount={discountAmount}
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
          products={products}
          recommendationsMap={recommendationsMap}
          onAddCompanion={(p) => addToCart(p, 1)}
          ordering={ordering}
        />
      )}

      {/* مودال تعديل صنف من السلة (✎) — نفس المودال معبّأً مسبقاً، والتأكيد يستبدل السطر */}
      {editingCartItem && (
        <ProductModal
          product={editingCartItem.product}
          brandColor={brandColor}
          priceColor={priceColor}
          isEn={isEn}
          t={t}
          initial={{ qty: editingCartItem.item.qty, note: editingCartItem.item.note || '', options: editingCartItem.initialOptions }}
          submitLabel={t('saveEditB')}
          onAdd={(product, qty, note, resolved) => updateCartItem(editingCartItem.item.cartKey, product, qty, note, resolved)}
          onClose={() => setEditingCartItem(null)}
          products={products}
          recommendationsMap={recommendationsMap}
          onAddCompanion={(p) => addToCart(p, 1)}
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
