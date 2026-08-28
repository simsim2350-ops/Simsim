// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import CartDrawer from '../../src/features/menu/CartDrawer'

// mock TableSelect — not under test here
vi.mock('../../src/features/menu/TableSelect', () => ({
  default: () => <select data-testid="table-select" />,
}))

// TASK-PAY-3.6D.10 — PaymentFirstCheckoutEntry مموَّهة هنا (نفس نمط TableSelect أعلاه) — منطقها
// الداخلي (اللوحة/إعادة التوجيه/الأخطاء) مُختبَر باستقلالية تامة في PaymentFirstCheckoutEntry.test.jsx؛
// هذا الملف يختبر فقط منطق CartDrawer نفسه (متى تُعرَض، وبأي props).
const paymentFirstEntryPropsSpy = vi.fn()
vi.mock('../../src/features/menu/PaymentFirstCheckoutEntry', () => ({
  default: (props) => { paymentFirstEntryPropsSpy(props); return <div data-testid="stub-payment-first-entry" /> },
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
  pfPaymentMethodLabel: 'طريقة الدفع',
  pfPaymentMethodCash: 'نقداً/عند الاستلام',
  pfPaymentMethodCard: 'الدفع الإلكتروني',
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

afterEach(cleanup)

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
    // accessible name includes emoji child: "🪑 محلي" — use regex to match
    const dineInBtn = screen.getByRole('button', { name: /محلي/ })
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

// ══════════════════════════════════════════════════════════════════
// TASK-PAY-3.6D.10 — ربط لوحة بدء الدفع أولاً بالسلة الحقيقية
// ══════════════════════════════════════════════════════════════════
describe('CartDrawer — payment-first integration (TASK-PAY-3.6D.10)', () => {
  it('1. خيار "الدفع الإلكتروني" يظهر في السلة الحقيقية', () => {
    render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={50} />)
    expect(screen.getByRole('button', { name: 'الدفع الإلكتروني' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'نقداً/عند الاستلام' })).toBeInTheDocument()
  })

  it('نقداً هو الافتراضي — لا props جديدة ⇒ نفس سلوك الدفع النقدي القديم تماماً (بلا تغيير)', () => {
    const placeOrder = vi.fn()
    render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={50} placeOrder={placeOrder} />)
    fireEvent.click(screen.getByRole('button', { name: /تأكيد الطلب/ }))
    expect(placeOrder).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('stub-payment-first-entry')).not.toBeInTheDocument()
  })

  it('2/5. اختيار "الدفع الإلكتروني" ثم الضغط على زر التأكيد يستدعي onStartPaymentFirstCheckout بدل placeOrder', () => {
    const placeOrder = vi.fn()
    const onStartPaymentFirstCheckout = vi.fn()
    render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={50} placeOrder={placeOrder} onStartPaymentFirstCheckout={onStartPaymentFirstCheckout} paymentMethod="card" />)
    fireEvent.click(screen.getByRole('button', { name: /تأكيد الطلب/ }))
    expect(onStartPaymentFirstCheckout).toHaveBeenCalledTimes(1)
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it('زر "الدفع الإلكتروني" يستدعي setPaymentMethod("card")', () => {
    const setPaymentMethod = vi.fn()
    render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={50} setPaymentMethod={setPaymentMethod} />)
    fireEvent.click(screen.getByRole('button', { name: 'الدفع الإلكتروني' }))
    expect(setPaymentMethod).toHaveBeenCalledWith('card')
  })

  it('2/3. paymentFirstCheckoutInput موجودة ⇒ تُعرَض PaymentFirstCheckoutEntry بدل زر التأكيد العادي، ويختفي مبدِّل طريقة الدفع', () => {
    const snapshot = { type: 'takeaway', items: [], customer_phone: '512345678', restaurant_slug: 'koshary', branch_id: 'branch-1' }
    render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={50} paymentFirstCheckoutInput={snapshot} />)
    expect(screen.getByTestId('stub-payment-first-entry')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تأكيد الطلب/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'الدفع الإلكتروني' })).not.toBeInTheDocument()
    expect(paymentFirstEntryPropsSpy).toHaveBeenCalledWith(expect.objectContaining({ checkoutInput: snapshot }))
  })

  it('4. onCancel من PaymentFirstCheckoutEntry مربوط بـ onCancelPaymentFirstCheckout', () => {
    const onCancelPaymentFirstCheckout = vi.fn()
    const snapshot = { type: 'takeaway', items: [], customer_phone: '512345678' }
    render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={50} paymentFirstCheckoutInput={snapshot} onCancelPaymentFirstCheckout={onCancelPaymentFirstCheckout} />)
    expect(paymentFirstEntryPropsSpy).toHaveBeenCalledWith(expect.objectContaining({ onCancel: onCancelPaymentFirstCheckout }))
  })

  it('6. لا وجود لأي زر تأكيد نقر مزدوج بعد التفعيل — الزر استُبدِل بالكامل، لا يتعايشان', () => {
    const snapshot = { type: 'takeaway', items: [], customer_phone: '512345678' }
    render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={50} paymentFirstCheckoutInput={snapshot} />)
    expect(screen.queryAllByRole('button', { name: /تأكيد الطلب/ })).toHaveLength(0)
  })

  it('8. مسار QR: slug/branchId يُمرَّران لـ PaymentFirstCheckoutEntry، وisQrCheckout=true', () => {
    render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={50} tableQr={{ token: 'qr-1', tableName: '5' }} paymentFirstCheckoutInput={{ type: 'dine_in', items: [], customer_phone: '512345678', table_qr_token: 'qr-1' }} slug="koshary" branchId="branch-qr" />)
    expect(paymentFirstEntryPropsSpy).toHaveBeenCalledWith(expect.objectContaining({ slug: 'koshary', branchId: 'branch-qr', isQrCheckout: true }))
  })

  it('غير-QR: isQrCheckout=false يُمرَّر بشكل صحيح', () => {
    render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={50} tableQr={null} paymentFirstCheckoutInput={{ type: 'takeaway', items: [], customer_phone: '512345678' }} />)
    expect(paymentFirstEntryPropsSpy).toHaveBeenCalledWith(expect.objectContaining({ isQrCheckout: false }))
  })

  it('7. الدفع النقدي (afterAll) يبقى كما هو تماماً حين paymentMethod="cash" — لا PaymentFirstCheckoutEntry تُعرَض إطلاقاً', () => {
    render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={50} paymentMethod="cash" />)
    expect(screen.queryByTestId('stub-payment-first-entry')).not.toBeInTheDocument()
  })

  it('بلا أي props جديدة إطلاقاً (مُستدعٍ قديم لا يعرف عن 3.6D.10) ⇒ يُعرَض بلا انهيار، طريقة الدفع نقداً افتراضياً', () => {
    // defaultProps نفسها لا تتضمّن أياً من props الدفع أولاً الجديدة — هذا يثبت التوافق الخلفي الكامل
    expect(() => render(<CartDrawer {...defaultProps} cart={[cartItem]} cartCount={1} cartTotal={50} />)).not.toThrow()
    expect(screen.getByRole('button', { name: 'نقداً/عند الاستلام' })).toHaveAttribute('aria-pressed', 'true')
  })
})
