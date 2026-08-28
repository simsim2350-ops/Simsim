// @vitest-environment happy-dom
//
// TASK-PAY-3.6D.10 — اختبارات توصيل PublicMenu.jsx بمخرجات useCheckout الجديدة (paymentMethod/
// paymentFirstCheckoutInput/startPaymentFirstCheckout/cancelPaymentFirstCheckout) إلى CartDrawer.
// CartDrawer نفسها مموَّهة هنا بالكامل (مُختبَرة باستقلالية في CartDrawer.test.jsx) — نفس نطاق/نمط
// PublicMenuCallbackIntegration.test.jsx وPublicMenuOrderCreationWiring.test.jsx تماماً.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../../src/lib/supabase', () => ({
  supabase: { rpc: vi.fn(() => ({ single: () => Promise.resolve({ data: null, error: null }) })) },
}))

const useMenuDataMock = vi.fn()
vi.mock('../../src/features/menu/hooks/useMenuData', () => ({ useMenuData: (...args) => useMenuDataMock(...args) }))
vi.mock('../../src/features/menu/hooks/useLang', () => ({ useLang: () => ({ isEn: false, toggleLang: vi.fn(), t: (k) => k, tx: () => '' }) }))
vi.mock('../../src/features/menu/hooks/useActiveOrders', () => ({
  useActiveOrders: () => ({ activeOrders: [], setActiveOrders: vi.fn(), orderPlaced: false, setOrderPlaced: vi.fn(), liveOrdersCount: 0, cancelOrderByCustomer: vi.fn(), lastSyncedAt: null }),
}))
vi.mock('../../src/features/menu/hooks/useCart', () => ({
  useCart: () => ({
    cart: [], setCart: vi.fn(), cartOpen: true, setCartOpen: vi.fn(), addToCart: vi.fn(),
    removeFromCart: vi.fn(), incrementCartItem: vi.fn(), deleteCartItem: vi.fn(), updateCartItem: vi.fn(),
    cartTotal: 0, cartCount: 0, branchConflict: null, clearCartForNewBranch: vi.fn(), idempotencyKey: null,
  }),
}))

const useCheckoutMock = vi.fn()
vi.mock('../../src/features/menu/hooks/useCheckout', () => ({ useCheckout: (...args) => useCheckoutMock(...args) }))

vi.mock('../../src/features/menu/hooks/useCoupon', () => ({
  useCoupon: () => ({ couponInput: '', setCouponInput: vi.fn(), appliedCoupon: null, applyCoupon: vi.fn(), removeCoupon: vi.fn(), applying: false, discountAmount: 0 }),
}))
vi.mock('../../src/features/menu/hooks/useLoyalty', () => ({ useLoyalty: () => null }))
vi.mock('../../src/features/menu/hooks/useTables', () => ({ useTables: () => ({ tables: [] }) }))
vi.mock('../../src/features/menu/hooks/useRecommendationRules', () => ({ useRecommendationRules: () => ({}) }))
vi.mock('../../src/features/menu/hooks/useSmartSuggestions', () => ({ useSmartSuggestions: () => [] }))
vi.mock('../../src/features/menu/hooks/useCartWideIds', () => ({ useCartWideIds: () => [] }))
vi.mock('../../src/features/menu/hooks/useReviews', () => ({
  useReviews: () => ({ reviewedIds: [], reviewDraft: {}, setDraft: vi.fn(), submitReview: vi.fn(), submittingReview: false }),
}))

vi.mock('../../src/features/menu/MenuSkeleton', () => ({ default: () => <div data-testid="stub-skeleton" /> }))
vi.mock('../../src/features/menu/MenuHeader', () => ({ default: () => <div data-testid="stub-menu-header" /> }))
vi.mock('../../src/features/menu/MenuOffersDrawer', () => ({ default: () => null }))
vi.mock('../../src/features/menu/MenuBody', () => ({ default: () => <div data-testid="stub-menu-body" /> }))
vi.mock('../../src/features/menu/MenuBranding', () => ({ default: () => null }))
vi.mock('../../src/features/menu/SearchOverlay', () => ({ default: () => null }))
vi.mock('../../src/features/menu/ProductModal', () => ({ default: () => null }))
vi.mock('../../src/features/menu/AllergensModal', () => ({ default: () => null }))
vi.mock('../../src/features/menu/OrdersScreen', () => ({ default: () => <div data-testid="stub-orders-screen" /> }))
vi.mock('../../src/features/menu/PaymentFirstOrderCreation', () => ({ default: () => <div data-testid="stub-order-creation" /> }))
vi.mock('../../src/features/menu/BannerDisplays', () => ({
  FloatingMenuBanner: () => null, MenuBannerOverlays: () => null, TopMenuBanner: () => null,
  useMenuBannerDisplay: () => ({ topBanner: null, inlineBanner: null, floatingBanner: null, fullscreenBanner: null, popupBanner: null, dismissFullscreen: vi.fn(), dismissPopup: vi.fn() }),
}))
vi.mock('../../src/components/ConfirmDialog', () => ({ default: () => null }))
vi.mock('../../src/lib/analytics', () => ({ track: vi.fn() }))

// المكوّن قيد التركيز — مموَّه، props تُلتقَط للتحقّق فقط (نفس نمط PublicMenuCallbackIntegration).
const cartDrawerPropsSpy = vi.fn()
vi.mock('../../src/features/menu/CartDrawer', () => ({
  default: (props) => { cartDrawerPropsSpy(props); return <div data-testid="stub-cart-drawer" /> },
}))

const { default: PublicMenu } = await import('../../src/pages/PublicMenu.jsx')

function baseMenuData(overrides = {}) {
  return {
    restaurant: { id: 'rest-1', brand_color: '#FF6A00', menu_layout: 'list' },
    branch: { id: 'branch-primary', takeaway_enabled: true },
    categories: [], products: [], contentError: null, customerFavorites: [], manualBestSellers: [],
    loading: false, notFound: false, activeCategory: null, setActiveCategory: vi.fn(),
    restaurantActiveOrdersCount: 0, rating: null, loyaltyEnabled: false,
    banners: [], coupons: [], capabilities: {}, branding: null, reloadMenu: vi.fn(),
    ...overrides,
  }
}

function baseCheckoutReturn(overrides = {}) {
  return {
    tableNumber: '', setTableNumber: vi.fn(), orderType: 'dine_in', setOrderType: vi.fn(),
    deliveryAddress: '', setDeliveryAddress: vi.fn(), customerName: '', setCustomerName: vi.fn(),
    customerPhone: '', setCustomerPhone: vi.fn(), orderNote: '', setOrderNote: vi.fn(),
    orderNumber: '', placeOrder: vi.fn(), submitting: false, priceChangeInfo: null, confirmPriceUpdate: vi.fn(),
    paymentMethod: 'cash', setPaymentMethod: vi.fn(),
    paymentFirstCheckoutInput: null, startPaymentFirstCheckout: vi.fn(), cancelPaymentFirstCheckout: vi.fn(),
    ...overrides,
  }
}

function renderMenu(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/menu/:slug" element={<PublicMenu />} /></Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useCheckoutMock.mockReturnValue(baseCheckoutReturn())
})
afterEach(cleanup)

describe('PublicMenu — payment-first checkout entry wiring (TASK-PAY-3.6D.10)', () => {
  it('يُمرِّر paymentMethod/paymentFirstCheckoutInput/onStartPaymentFirstCheckout/onCancelPaymentFirstCheckout من useCheckout إلى CartDrawer دون تحويل', async () => {
    const startFn = vi.fn()
    const cancelFn = vi.fn()
    useCheckoutMock.mockReturnValue(baseCheckoutReturn({ paymentMethod: 'card', startPaymentFirstCheckout: startFn, cancelPaymentFirstCheckout: cancelFn }))
    useMenuDataMock.mockReturnValue(baseMenuData())
    renderMenu('/menu/koshary')
    await screen.findByTestId('stub-cart-drawer')
    expect(cartDrawerPropsSpy).toHaveBeenCalledWith(expect.objectContaining({
      paymentMethod: 'card',
      onStartPaymentFirstCheckout: startFn,
      onCancelPaymentFirstCheckout: cancelFn,
    }))
  })

  it('11. غير-QR/متعدد الفروع: يُمرِّر slug وbranchId المُحلَّل فعلياً من ?branch=', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData({ branch: { id: 'branch-secondary', takeaway_enabled: true } }))
    renderMenu('/menu/koshary?branch=branch-secondary')
    await screen.findByTestId('stub-cart-drawer')
    expect(cartDrawerPropsSpy).toHaveBeenCalledWith(expect.objectContaining({ slug: 'koshary', branchId: 'branch-secondary' }))
  })

  it('paymentFirstCheckoutInput غير null ⇒ يصل كما هو إلى CartDrawer (بلا تحويل)', async () => {
    const snapshot = { type: 'takeaway', items: [], customer_phone: '512345678', restaurant_slug: 'koshary' }
    useCheckoutMock.mockReturnValue(baseCheckoutReturn({ paymentFirstCheckoutInput: snapshot }))
    useMenuDataMock.mockReturnValue(baseMenuData())
    renderMenu('/menu/koshary')
    await screen.findByTestId('stub-cart-drawer')
    expect(cartDrawerPropsSpy).toHaveBeenCalledWith(expect.objectContaining({ paymentFirstCheckoutInput: snapshot }))
  })

  it('7. الدفع النقدي الافتراضي (paymentMethod=cash) لا يُغيِّر أي شيء آخر في props السلة الحالية', async () => {
    const placeOrderFn = vi.fn()
    useCheckoutMock.mockReturnValue(baseCheckoutReturn({ placeOrder: placeOrderFn }))
    useMenuDataMock.mockReturnValue(baseMenuData())
    renderMenu('/menu/koshary')
    await screen.findByTestId('stub-cart-drawer')
    expect(cartDrawerPropsSpy).toHaveBeenCalledWith(expect.objectContaining({ placeOrder: placeOrderFn, paymentMethod: 'cash' }))
  })

  it('12. تدفّق العودة من الدفع (payment_callback) غير مُتأثِّر — لا استدعاء لـ useCheckout المموَّهة يُغيِّر بوابة الاستحواذ', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData())
    renderMenu('/menu/koshary?payment_callback=pay_abc123')
    expect(await screen.findByTestId('stub-order-creation')).toBeInTheDocument()
    expect(screen.queryByTestId('stub-cart-drawer')).not.toBeInTheDocument()
  })
})
