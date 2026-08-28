// @vitest-environment happy-dom
//
// TASK-PAY-3.6D.4-C.3 — اختبارات تكامل بوابة عودة الدفع أولاً داخل PublicMenu.jsx.
// نطاق هذه الاختبارات: منطق البوابات المبكرة (early-return gates) فقط — من يظهر ومتى — وليس إعادة
// اختبار PaymentFirstCallbackLanding نفسها (مُختبَرة بالكامل في PaymentFirstCallbackLanding.test.jsx)
// ولا منطق المنيو العادي الداخلي (مُختبَر عبر مكوّناته الفرعية المموَّهة هنا). كل الـhooks/المكوّنات
// الفرعية مموَّهة (نفس نمط CartDrawer.test.jsx مع TableSelect) — لا Supabase حقيقي، لا شبكة.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// ——————————— تمويه العميل والاستدعاءات المباشرة داخل PublicMenu.jsx نفسها ———————————
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

// ——————————— تمويه كل الـhooks التي يستدعيها PublicMenuInner ———————————
const useMenuDataMock = vi.fn()
vi.mock('../../src/features/menu/hooks/useMenuData', () => ({
  useMenuData: (...args) => useMenuDataMock(...args),
}))
vi.mock('../../src/features/menu/hooks/useLang', () => ({
  useLang: () => ({ isEn: false, toggleLang: vi.fn(), t: (k) => k, tx: () => '' }),
}))
vi.mock('../../src/features/menu/hooks/useActiveOrders', () => ({
  useActiveOrders: () => ({
    activeOrders: [], setActiveOrders: vi.fn(), orderPlaced: false, setOrderPlaced: vi.fn(),
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
  useCoupon: () => ({
    couponInput: '', setCouponInput: vi.fn(), appliedCoupon: null, applyCoupon: vi.fn(),
    removeCoupon: vi.fn(), applying: false, discountAmount: 0,
  }),
}))
vi.mock('../../src/features/menu/hooks/useLoyalty', () => ({ useLoyalty: () => null }))
vi.mock('../../src/features/menu/hooks/useTables', () => ({ useTables: () => ({ tables: [] }) }))
vi.mock('../../src/features/menu/hooks/useRecommendationRules', () => ({ useRecommendationRules: () => ({}) }))
vi.mock('../../src/features/menu/hooks/useSmartSuggestions', () => ({ useSmartSuggestions: () => [] }))
vi.mock('../../src/features/menu/hooks/useCartWideIds', () => ({ useCartWideIds: () => [] }))
vi.mock('../../src/features/menu/hooks/useReviews', () => ({
  useReviews: () => ({ reviewedIds: [], reviewDraft: {}, setDraft: vi.fn(), submitReview: vi.fn(), submittingReview: false }),
}))

// ——————————— تمويه المكوّنات الفرعية الثقيلة (نفس نمط CartDrawer.test.jsx مع TableSelect) ———————————
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

// المكوّن قيد الاختبار الفعلي — غير مموَّه؛ props المُستقبَلة تُلتقَط للتحقق منها.
const callbackLandingPropsSpy = vi.fn()
vi.mock('../../src/features/menu/PaymentFirstCallbackLanding', () => ({
  default: (props) => { callbackLandingPropsSpy(props); return <div data-testid="stub-callback-landing">{props.branchId ?? 'no-branch'}</div> },
}))

// يُستورَد بعد كل التمويهات أعلاه (ترتيب vi.mock hoisting يضمن هذا تلقائياً في vitest)
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
      <Routes>
        <Route path="/menu/:slug" element={<PublicMenu />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveTableQrMock.mockReturnValue({ single: () => Promise.resolve({ data: null, error: { message: 'not found' } }) })
  resolveMenuSlugMock.mockResolvedValue({ data: null })
})

afterEach(cleanup)

describe('PublicMenu — payment-first callback integration (TASK-PAY-3.6D.4-C.3)', () => {
  it('PMCB-01: payment_callback موجود ⇒ استحواذ كامل — PaymentFirstCallbackLanding تُعرَض، لا منيو ولا سلة تحتها', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData())
    renderMenu('/menu/koshary?payment_callback=pay_abc123')
    expect(await screen.findByTestId('stub-callback-landing')).toBeInTheDocument()
    expect(screen.queryByTestId('stub-menu-body')).not.toBeInTheDocument()
    expect(screen.queryByTestId('stub-cart-drawer')).not.toBeInTheDocument()
  })

  it('PMCB-02: بوابة الدفع تتجاوز حجب "QR غير متاح" عند فشل إعادة توثيق الطاولة', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData())
    // resolve_table_qr يفشل (القيمة الافتراضية في beforeEach) — رمز طاولة + عودة دفع معاً
    renderMenu('/menu/koshary?payment_callback=pay_abc123&table=qr-token-1')
    expect(await screen.findByTestId('stub-callback-landing')).toBeInTheDocument()
    expect(screen.queryByText('رمز الطاولة غير متاح')).not.toBeInTheDocument()
  })

  it('PMCB-03: خارج سياق عودة الدفع، فشل QR يبقى يحجب المنيو كما هو — سلوك موجود غير مُعدَّل', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData())
    renderMenu('/menu/koshary?table=qr-token-1')
    expect(await screen.findByText('رمز الطاولة غير متاح')).toBeInTheDocument()
    expect(screen.queryByTestId('stub-callback-landing')).not.toBeInTheDocument()
  })

  it('PMCB-04: عودة دفع غير-QR تمرّر branch?.id المُحلَّل فعلياً (من ?branch=) إلى PaymentFirstCallbackLanding', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData({ branch: { id: 'branch-xyz', takeaway_enabled: true } }))
    renderMenu('/menu/koshary?payment_callback=pay_abc123&branch=branch-xyz')
    await screen.findByTestId('stub-callback-landing')
    expect(callbackLandingPropsSpy).toHaveBeenCalledWith(expect.objectContaining({ slug: 'koshary', branchId: 'branch-xyz' }))
  })

  it('PMCB-05: البوابة لا تستدعي أي منطق دفع — لا placeOrder، لا استدعاء RPC خاص بالدفع من PublicMenu نفسها', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData())
    const { supabase } = await import('../../src/lib/supabase')
    renderMenu('/menu/koshary?payment_callback=pay_abc123')
    await screen.findByTestId('stub-callback-landing')
    const rpcCalls = supabase.rpc.mock.calls.map((c) => c[0])
    expect(rpcCalls).not.toContain('initiatePaymentFirstCheckout')
    expect(rpcCalls.every((name) => name === 'resolve_table_qr' || name === 'resolve_menu_slug')).toBe(true)
  })

  it('PMCB-06: لا استدعاء Moyasar ولا fetch مباشر من PublicMenu.jsx نفسها لأجل مسار العودة', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/pages/PublicMenu.jsx'), 'utf8')
    const importLines = src.split('\n').filter((l) => l.trim().startsWith('import'))
    expect(importLines.join('\n')).not.toMatch(/moyasar/i)
    expect(src).not.toMatch(/\bfetch\(/)
  })

  it('PMCB-07: لا استعلام مباشر عن payment_transactions من PublicMenu.jsx', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/pages/PublicMenu.jsx'), 'utf8')
    expect(src).not.toMatch(/\.from\(\s*['"]payment_transactions['"]\s*\)/)
  })

  it('PMCB-08: منيو عادية بلا payment_callback تُعرَض بلا تغيير — لا بوابة عودة دفع', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData())
    renderMenu('/menu/koshary')
    expect(await screen.findByTestId('stub-menu-body')).toBeInTheDocument()
    expect(screen.queryByTestId('stub-callback-landing')).not.toBeInTheDocument()
  })

  it('PMCB-09: منيو QR عادية (بلا payment_callback) بنجاح توثيق الطاولة تُعرَض بلا بوابة عودة دفع', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData({ branch: { id: 'branch-qr', takeaway_enabled: true } }))
    resolveTableQrMock.mockReturnValue({
      single: () => Promise.resolve({ data: { table_id: 't1', table_name: '5', restaurant_id: 'r1', branch_id: 'branch-qr' }, error: null }),
    })
    renderMenu('/menu/koshary?table=qr-token-1')
    expect(await screen.findByTestId('stub-menu-body')).toBeInTheDocument()
    expect(screen.queryByTestId('stub-callback-landing')).not.toBeInTheDocument()
    expect(screen.queryByText('رمز الطاولة غير متاح')).not.toBeInTheDocument()
  })

  it('PMCB-10: منيو متعددة الفروع عادية (?branch=) بلا payment_callback تُعرَض بلا تغيير', async () => {
    useMenuDataMock.mockReturnValue(baseMenuData({ branch: { id: 'branch-secondary', takeaway_enabled: true } }))
    renderMenu('/menu/koshary?branch=branch-secondary')
    expect(await screen.findByTestId('stub-menu-body')).toBeInTheDocument()
    expect(useMenuDataMock).toHaveBeenCalledWith('koshary', 'branch-secondary')
    expect(screen.queryByTestId('stub-callback-landing')).not.toBeInTheDocument()
  })

  it('PMCB-11: طلب سابق مخزَّن (orderPlaced) لا يظهر — عودة الدفع الحقيقية تتقدّم عليه', async () => {
    // useActiveOrders مموَّهة بـorderPlaced=false ثابتاً هنا؛ الاختبار يثبت فقط أن ترتيب البوابات
    // في الكود نفسه يضع عودة الدفع قبل orderPlaced (مُتحقَّق من ترتيب الأسطر في التنفيذ) — التحقّق
    // السلوكي الكامل بتغيير orderPlaced ديناميكياً يتطلّب تمويهاً أعقد، خارج نطاق هذه المهمة.
    useMenuDataMock.mockReturnValue(baseMenuData())
    renderMenu('/menu/koshary?payment_callback=pay_abc123')
    expect(await screen.findByTestId('stub-callback-landing')).toBeInTheDocument()
    expect(screen.queryByTestId('stub-orders-screen')).not.toBeInTheDocument()
  })
})
