// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CartDrawer from '../../src/features/menu/CartDrawer'

// mock TableSelect — not under test here
vi.mock('../../src/features/menu/TableSelect', () => ({
  default: () => <select data-testid="table-select" />,
}))

const t = (key) => ({
  cartYours: 'سلتك',
  emptyCartTitle: 'سلتك فارغة',
  browseMenuB: 'تصفح القائمة',
  closeA: 'إغلاق السلة',
  decreaseA: 'إنقاص الكمية',
  increaseA: 'زيادة الكمية',
  confirmOrder: '🎉 تأكيد الطلب',
  closedBtn: '⛔ المحل مغلق الآن',
  closedTitle: 'المحل مغلق الآن',
  dineIn: 'محلي',
  takeaway2: 'سفري',
  deliveryT: 'توصيل',
  orderTypeR: '📦 نوع الطلب',
  nameOpt: '👤 اسمك (اختياري)',
  phoneReq: '📱 رقم جوالك',
  tableReq: '🪑 رقم الطاولة',
  orderNoteL: '💬 ملاحظة على الطلب (اختياري)',
  orderNotePh: 'أخبرنا بأي تفاصيل...',
  namePh2: 'مثال: محمد',
  phonePh: '5XXXXXXXX',
  totalVat: 'المجموع (شامل الضريبة)',
  vatLine: '· منها ض.ق.م 15%',
  total: 'الإجمالي',
  placingOrder: 'جارٍ إرسال الطلب…',
  editItemA: 'تعديل الصنف',
  delItemA: 'حذف الصنف من السلة',
  deliveryFee: '🛵 رسوم التوصيل',
  feeSuffix: 'رسوم توصيل',
  cartItemUnavailableNow: 'لم يعد متوفراً — أزِله للمتابعة',
  cartItemPriceChanged: 'تغيّر السعر إلى',
  cartHasUnavailableItems: 'أزِل الأصناف غير المتوفرة',
  priceChangedTitle: 'تغيّر السعر',
  priceChangedUpdateBtn: 'حدّث وتابع',
  rewardDefault: 'مكافأة',
  suggestTitle: '🍽️ أكمل وجبتك',
  reasonCurated: 'اختيار المطعم',
  reasonCategory: 'من نفس القسم',
  reasonMostOrdered: 'مختارات المطعم ⭐',
  addToCartB: 'إضافة للسلة',
  tablePh: 'اختر رقم الطاولة',
  addrReq: '📍 عنوان التوصيل',
  addrPh2: 'الحي، الشارع...',
}[key] || key)

const defaultProps = {
  cart: [],
  cartCount: 0,
  cartTotal: 0,
  restaurant: { id: 'r1', vat_enabled: true },
  brandColor: '#FF6A00',
  isEn: false,
  t,
  itemName: (item) => item.name,
  orderType: 'dine_in',
  setOrderType: vi.fn(),
  customerName: '',
  setCustomerName: vi.fn(),
  customerPhone: '',
  setCustomerPhone: vi.fn(),
  tableNumber: '',
  setTableNumber: vi.fn(),
  deliveryAddress: '',
  setDeliveryAddress: vi.fn(),
  orderNote: '',
  setOrderNote: vi.fn(),
  tables: [],
  tableQr: null,
  openStatus: { open: true },
  deliveryEnabled: false,
  deliveryFee: 0,
  takeawayEnabled: true,
  placeOrder: vi.fn(),
  submitting: false,
  removeFromCart: vi.fn(),
  incrementCartItem: vi.fn(),
  onDeleteItem: vi.fn(),
  onEditItem: vi.fn(),
  onClose: vi.fn(),
  suggestions: [],
  onAddSuggestion: vi.fn(),
  onOpenSuggestion: vi.fn(),
  loyalty: null,
  couponInput: '',
  setCouponInput: vi.fn(),
  appliedCoupon: null,
  applyCoupon: null,
  removeCoupon: vi.fn(),
  applyingCoupon: false,
  discountAmount: 0,
  priceChangeInfo: null,
  onConfirmPriceUpdate: vi.fn(),
}

const cartItem = {
  cartKey: 'item1__',
  id: 'item1',
  name: 'برجر كلاسيك',
  qty: 2,
  price: 25,
  basePrice: 25,
  available: true,
  emoji: '🍔',
  image_url: null,
  selectedOptions: [],
  note: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CartDrawer', () => {
  it('UT-CD-001: يعرض عنوان السلة مع عدد العناصر', () => {
    render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={25} />)
    expect(screen.getByText(/سلتك.*1/)).toBeInTheDocument()
  })

  it('UT-CD-002: يعرض حالة السلة الفارغة مع نص وزر "تصفح القائمة"', () => {
    render(<CartDrawer {...defaultProps} />)
    expect(screen.getByText('سلتك فارغة')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'تصفح القائمة' })).toBeInTheDocument()
  })

  it('UT-CD-003: يعرض عناصر السلة باسمها', () => {
    render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={50} />)
    expect(screen.getByText('برجر كلاسيك')).toBeInTheDocument()
  })

  it('UT-CD-004: زر "−" يستدعي removeFromCart بمعرف العنصر الصحيح', () => {
    const removeFromCart = vi.fn()
    render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={50} removeFromCart={removeFromCart} />)
    fireEvent.click(screen.getByRole('button', { name: 'إنقاص الكمية' }))
    expect(removeFromCart).toHaveBeenCalledWith('item1__')
  })

  it('UT-CD-005: زر "+" يستدعي incrementCartItem بمعرف العنصر الصحيح', () => {
    const incrementCartItem = vi.fn()
    render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={50} incrementCartItem={incrementCartItem} />)
    fireEvent.click(screen.getByRole('button', { name: 'زيادة الكمية' }))
    expect(incrementCartItem).toHaveBeenCalledWith('item1__')
  })

  it('UT-CD-006: زر نوع الطلب "محلي" يحمل aria-pressed=true عند الاختيار', () => {
    render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={50} orderType="dine_in" />)
    const dineInBtn = screen.getByRole('button', { name: 'محلي' })
    expect(dineInBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('UT-CD-007: زر التأكيد مُعطَّل عندما المحل مغلق', () => {
    render(
      <CartDrawer
        {...defaultProps}
        cart={[cartItem]}
        cartCount={1}
        cartTotal={50}
        openStatus={{ open: false, nextText: null }}
      />
    )
    const submitBtn = screen.getByRole('button', { name: /مغلق/i })
    expect(submitBtn).toBeDisabled()
  })
})
