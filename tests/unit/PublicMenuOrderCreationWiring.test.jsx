// @vitest-environment happy-dom
//
// TASK-PAY-3.6D.6-B — اختبارات توصيل PublicMenu.jsx بـ PaymentFirstOrderCreation: أي props تُمرَّر
// إليها (tableQrToken خصوصاً)، وسلوك onOrderCreated (إلحاق الطلب بـactiveOrders، تفعيل orderPlaced،
// تنظيف رابط payment_callback مع الحفاظ على branch/table). PaymentFirstOrderCreation نفسها مموَّهة
// هنا بالكامل (مُختبَرة باستقلالية في PaymentFirstOrderCreation.test.jsx) — نفس نطاق/نمط
// PublicMenuCallbackIntegration.test.jsx تماماً، فقط لمكوّن مختلف.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})

const resolveTableQrMock = vi.fn()
const resolveMenuSlugMock = vi.fn()
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn((name, args) => {
      if (name === 'resolve_table_qr') return resolveTableQrMock(args)
      if (name === 'resolve_menu_slug') return resolveMenuSlugMock(args)
      return { single: () => Promise.resolve({ data: null, error: null }) }
    }),
  },
}))

const useMenuDataMock = vi.fn()
vi.mock('../../src/features/menu/hooks/useMenuData', () => ({ useMenuData: (...args) => useMenuDataMock(...args) }))
vi.mock('../../src/features/menu/hooks/useLang', () => ({ useLang: () => ({ isEn: false, toggleLang: vi.fn(), t: (k) => k, tx: () => '' }) }))

const setActiveOrdersMock = vi.fn()
const setOrderPlacedMock = vi.fn()
vi.mock('../../src/features/menu/hooks/useActiveOrders', () => ({
  useActiveOrders: () => ({
    activeOrders: [], setActiveOrders: setActiveOrdersMock, orderPlaced: false, setOrderPlaced: setOrderPlacedMock,
    liveOrdersCount: 0, cancelOrderByCustomer: vi.fn(), lastSyncedAt: null,
  }),
}))
vi.mock('../../src/features/menu/hooks/useCart', () => ({
  useCart: () => ({
    cart: [], setCart: vi.fn(), cartOpen: false, setCartOpen: vi.fn(), addToCart: vi.fn(),
    removeFromCart: vi.fn(), incrementCartItem: vi.fn(), deleteCartItem: vi.fn(), updateCartItem: vi.fn(),
    cartTotal: 0, cartCount: 0, branchConflict: null, clearCartForNewBranch: vi.fn(), idempotencyKey: null,
  }),
}))
vi.mock('../../src/features/menu/hooks/useCheckout', () => ({
  useCheckout: () => ({
    tableNumber: '', setTableNumber: vi.fn(), orderType: 'dine_in', setOrderType: vi.fn(),
    deliveryAddress: '', setDeliveryAddress: vi.fn(), customerName: '', setCustomerName: vi.fn(),
    customerPhone: '', setCustomerPhone: vi.fn(), orderNote: '', setOrderNote: vi.fn(),
    orderNumber: '', placeOrder: vi.fn(), submitting: false, priceChangeInfo: null, confirmPriceUpdate: vi.fn(),
  }),
}))
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
vi.mock('../../src/features/menu/CartDrawer', () => ({ default: () => <div data-testid="stub-cart-drawer" /> }))
vi.mock('../../src/features/menu/AllergensModal', () => ({ default: () => null }))
vi.mock('../../src/features/menu/OrdersScreen', () => ({ default: () => <div data-testid="stub-orders-screen" /> }))
vi.mock('../../src/features/menu/BannerDisplays', () => ({
  FloatingMenuBanner: () => null, MenuBannerOverlays: () => null, TopMenuBanner: () => null,
  useMenuBannerDisplay: () => ({ topBanner: null, inlineBanner: null, floatingBanner: null, fullscreenBanner: null, popupBanner: null, dismissFullscreen: vi.fn(), dismissPopup: vi.fn() }),
}))
vi.mock('../../src/components/ConfirmDialog', () => ({ default: () => null }))
vi.mock('../../src/lib/analytics', () => ({ track: vi.fn() }))

// المكوّن قيد التركيز — مموَّه بالكامل، مع زرَّين منفصلين (TASK-PAY-3.6D.6-C: التسجيل والانتقال
// فعلان منفصلان الآن — onOrderCreated يُسجِّل فقط، onViewOrder ينقل فقط، بفعل عميل صريح).
const orderCreationPropsSpy = vi.fn()
const FAKE_ORDER = { status: 'succeeded', orderId: 'order-99', orderNumber: 'ORD-0099', accessToken: 'tok-99', idempotent: false, tableNumber: null, deliveryAddress: null }
vi.mock('../../src/features/menu/PaymentFirstOrderCreation', () => ({
  default: (props) => {
    orderCreationPropsSpy(props)
    return (
      <div data-testid="stub-order-creation">
        <button type="button" onClick={() => props.onOrderCreated?.(FAKE_ORDER)}>simulate-order-created</button>
        <button type="button" onClick={() => props.onViewOrder?.(FAKE_ORDER)}>simulate-view-order</button>
      </div>
    )
  },
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

function renderMenu(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/menu/:slug" element={<PublicMenu />} /></Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveTableQrMock.mockReturnValue({ single: () => Promise.resolve({ data: null, error: { message: 'not found' } }) })
  resolveMenuSlugMock.mockResolvedValue({ data: null })
})
afterEach(cleanup)

describe('PublicMenu — payment-first order creation wiring (TASK-PAY-3.6D.6-B)', () => {
  it('يُمرِّر tableQrToken (من ?table=) إلى PaymentFirstOrderCreation', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData())
    renderMenu('/menu/koshary?payment_callback=pay_abc123&table=qr-token-1')
    await screen.findByTestId('stub-order-creation')
    expect(orderCreationPropsSpy).toHaveBeenCalledWith(expect.objectContaining({ tableQrToken: 'qr-token-1' }))
  })

  it('غير-QR: tableQrToken يبقى null/فارغاً — لا رمز QR يُمرَّر بالخطأ', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData())
    renderMenu('/menu/koshary?payment_callback=pay_abc123&branch=branch-primary')
    await screen.findByTestId('stub-order-creation')
    expect(orderCreationPropsSpy.mock.calls[0][0].tableQrToken).toBeFalsy()
  })

  it('onOrderCreated: يُلحِق الطلب بـactiveOrders ويُفعِّل orderPlaced', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData())
    renderMenu('/menu/koshary?payment_callback=pay_abc123')
    fireEvent.click(await screen.findByText('simulate-order-created'))
    expect(setActiveOrdersMock).toHaveBeenCalled()
    const updater = setActiveOrdersMock.mock.calls[0][0]
    const result = updater([])
    expect(result[0]).toMatchObject({ id: 'order-99', orderNumber: 'ORD-0099', accessToken: 'tok-99', status: 'pending' })
    expect(setOrderPlacedMock).toHaveBeenCalledWith(true)
  })

  it('onOrderCreated: لا يُضيف إدخالاً مكرَّراً لنفس orderId (استدعاء idempotent مزدوج)', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData())
    renderMenu('/menu/koshary?payment_callback=pay_abc123')
    fireEvent.click(await screen.findByText('simulate-order-created'))
    const updater = setActiveOrdersMock.mock.calls[0][0]
    const existing = [{ id: 'order-99', orderNumber: 'ORD-0099' }]
    const result = updater(existing)
    expect(result).toBe(existing) // بلا تغيير — نفس المرجع، لا إدخال مكرَّر
  })

  it('onOrderCreated وحدها لا تُنقِل الصفحة أبداً — التسجيل لا يُسبِّب تنقّلاً صامتاً (TASK-PAY-3.6D.6-C)', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData())
    renderMenu('/menu/koshary?payment_callback=pay_abc123&branch=branch-primary')
    fireEvent.click(await screen.findByText('simulate-order-created'))
    expect(navigateSpy).not.toHaveBeenCalled()
  })

  it('onViewOrder: يُزيل payment_callback من الرابط مع الحفاظ على branch (استبدال، لا دفع تاريخ جديد)', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData())
    renderMenu('/menu/koshary?payment_callback=pay_abc123&branch=branch-primary')
    fireEvent.click(await screen.findByText('simulate-view-order'))
    expect(navigateSpy).toHaveBeenCalledWith('/menu/koshary?branch=branch-primary', { replace: true })
  })

  it('onViewOrder (مسار QR): يُزيل payment_callback مع الحفاظ على table', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData())
    renderMenu('/menu/koshary?payment_callback=pay_abc123&table=qr-token-1')
    fireEvent.click(await screen.findByText('simulate-view-order'))
    expect(navigateSpy).toHaveBeenCalledWith('/menu/koshary?table=qr-token-1', { replace: true })
  })

  it('يُمرِّر restaurantName (restaurant?.name) إلى PaymentFirstOrderCreation', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData({ restaurant: { id: 'rest-1', name: 'مطعم كشري التحرير', brand_color: '#FF6A00', menu_layout: 'list' } }))
    renderMenu('/menu/koshary?payment_callback=pay_abc123')
    await screen.findByTestId('stub-order-creation')
    expect(orderCreationPropsSpy).toHaveBeenCalledWith(expect.objectContaining({ restaurantName: 'مطعم كشري التحرير' }))
  })
})
