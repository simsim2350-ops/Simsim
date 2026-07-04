import { useEffect, useRef, useState, Component } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'

// مصيدة أخطاء: تعرض رسالة الخطأ على الشاشة بدل الشاشة البيضاء (للتشخيص)
class ErrBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding:'16px', margin:'12px', background:'#FEF2F2', border:'2px solid #EF4444', borderRadius:'12px', direction:'ltr', textAlign:'left' }}>
          <div style={{ fontWeight:'800', color:'#B91C1C', marginBottom:'6px', fontSize:'13px' }}>⚠️ Error (screenshot this):</div>
          <div style={{ fontSize:'11px', color:'#7F1D1D', fontFamily:'monospace', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
            {String(this.state.err?.message || this.state.err)}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// شارة مستوى السعرات: 🟢 منخفض (<300) / 🟡 متوسط (300-600) / 🔴 مرتفع (600+)
function getCalorieBadge(calories) {
  if (calories == null) return null
  if (calories < 300) return '🟢'
  if (calories <= 600) return '🟡'
  return '🔴'
}

// حساب حالة الفتح من أوقات العمل (مصفوفة 7 أيام {open, from, to}، الأحد = 0)
// يرجّع { open, unknown, todayText, nextText }
function computeOpenStatus(hours) {
  // بدون أوقات محددة => نعتبره مفتوح دائماً (سلوك افتراضي متوافق مع القديم)
  if (!Array.isArray(hours) || hours.length !== 7) {
    return { open: true, unknown: true, todayText: '', nextText: '' }
  }
  const DAY_NAMES = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']

  const fmt = (t) => (t === '24:00' ? '00:00' : t)
  const toMins = (t) => {
    if (!t) return null
    const [h, m] = String(t).split(':').map(Number)
    return (h * 60) + (m || 0)
  }
  const now = new Date()
  const day = now.getDay()
  const mins = now.getHours() * 60 + now.getMinutes()
  const today = hours[day]
  const yesterday = hours[(day + 6) % 7]

  let open = false

  // فترة تمتد من أمس بعد منتصف الليل (مثال: 18:00 - 02:00)
  if (yesterday && yesterday.open) {
    const f = toMins(yesterday.from), t = toMins(yesterday.to)
    if (f !== null && t !== null && t <= f && mins < t) open = true
  }
  // فترة اليوم
  if (!open && today && today.open) {
    const f = toMins(today.from), t = toMins(today.to)
    if (f !== null && t !== null) {
      if (t > f) { if (mins >= f && mins < t) open = true }
      else { if (mins >= f) open = true } // تمتد بعد منتصف الليل
    }
  }

  const todayText = today && today.open
    ? `${fmt(today.from)} - ${fmt(today.to)}`
    : 'مغلق اليوم'

  // إيجاد أقرب موعد فتح قادم (لو مغلق حالياً)
  let nextText = ''
  if (!open) {
    for (let offset = 0; offset <= 7; offset++) {
      const idx = (day + offset) % 7
      const h = hours[idx]
      if (!h || !h.open) continue
      const f = toMins(h.from)
      if (f === null) continue
      if (offset === 0) {
        if (mins < f) { nextText = `يفتح اليوم الساعة ${fmt(h.from)}`; break }
        // اليوم لكن فات وقت الفتح — نكمل للأيام الجاية
      } else if (offset === 1) {
        nextText = `يفتح غداً الساعة ${fmt(h.from)}`; break
      } else {
        nextText = `يفتح ${DAY_NAMES[idx]} الساعة ${fmt(h.from)}`; break
      }
    }
  }

  return { open, unknown: false, todayText, nextText }
}

// أيقونات حقيقية (SVG) لمنصات التواصل الاجتماعي بألوانها الرسمية
const SOCIAL_ICONS = {
  instagram: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFDC80"/>
          <stop offset="25%" stopColor="#FCAF45"/>
          <stop offset="50%" stopColor="#F77737"/>
          <stop offset="75%" stopColor="#E1306C"/>
          <stop offset="100%" stopColor="#C13584"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig-grad)"/>
      <rect x="6" y="6" width="12" height="12" rx="4" stroke="white" strokeWidth="1.6" fill="none"/>
      <circle cx="12" cy="12" r="3.2" stroke="white" strokeWidth="1.6" fill="none"/>
      <circle cx="16.2" cy="7.8" r="1.1" fill="white"/>
    </svg>
  ),
  whatsapp_social: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#25D366"/>
      <path d="M16.7 14.3c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1-.7-.3-1.4-.7-2-1.3-.5-.5-1-1.1-1.4-1.7-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.3.2-.4.1-.1 0-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.1s.9 2.4 1.1 2.6c.1.2 1.9 2.9 4.6 4 .6.3 1.1.4 1.5.6.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" fill="white"/>
    </svg>
  ),
  snapchat: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#FFFC00"/>
      <path d="M12 6c-2 0-3.3 1.5-3.3 3.4 0 .6.1 1.3.1 1.7-.2.1-.5.2-1 0-.3-.1-.7 0-.7.4 0 .3.3.5.6.7-.1.3-.4.6-.8.8-.3.1-.3.5 0 .7.4.2.8.2 1 .3.1.3.1.7.5.9.5.2 1.1-.2 1.8-.2.6 0 1 .4 1.8.4s1.2-.4 1.8-.4c.7 0 1.3.4 1.8.2.4-.2.4-.6.5-.9.2-.1.6-.1 1-.3.3-.2.3-.6 0-.7-.4-.2-.7-.5-.8-.8.3-.2.6-.4.6-.7 0-.4-.4-.5-.7-.4-.5.2-.8.1-1 0 0-.4.1-1.1.1-1.7C15.3 7.5 14 6 12 6z" fill="black"/>
    </svg>
  ),
  twitter: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M18.9 2H22l-7.4 8.4L23.3 22h-6.8l-5.3-7-6.1 7H1.9l7.9-9-8.4-10.9h7l4.8 6.4L18.9 2zm-1.2 18h1.9L7.4 4H5.4l12.3 16z" fill="black"/>
    </svg>
  ),
  tiktok: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="black"/>
      <path d="M15.6 7.3c-.5-.5-.8-1.2-.8-2h-2v9.4c0 1-.8 1.9-1.9 1.9-1 0-1.9-.8-1.9-1.9s.8-1.9 1.9-1.9c.2 0 .4 0 .6.1V10c-.2 0-.4 0-.6 0-2.2 0-3.9 1.8-3.9 3.9s1.8 3.9 3.9 3.9 3.9-1.8 3.9-3.9V9.1c.7.5 1.6.8 2.6.8V8c-.7 0-1.4-.3-1.8-.7z" fill="#25F4EE"/>
      <path d="M15.6 7.1c-.5-.5-.8-1.2-.8-2h-1.7v9.4c0 1-.8 1.9-1.9 1.9-.5 0-1-.2-1.3-.5l-1.2 1.4c.6.6 1.5 1 2.5 1 2.2 0 3.9-1.8 3.9-3.9V8.9c.7.5 1.6.8 2.6.8V8c-.7 0-1.4-.3-1.8-.7z" fill="white" opacity="0.4"/>
    </svg>
  ),
}

function PublicMenuInner() {
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const branchId = searchParams.get('branch')
  const [branch, setBranch] = useState(null)
  const [branchList, setBranchList] = useState([])   // كل الفروع النشطة (لصفحة اختيار الفرع)
  const [branchPicked, setBranchPicked] = useState(false) // هل حسم الزبون اختيار الفرع؟
  const [restaurant, setRestaurant] = useState(null)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [bestSellers, setBestSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeCategory, setActiveCategory] = useState(null)
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [dragOffset, setDragOffset] = useState(0)
  const dragStartYRef = useRef(null)

  // ===== اللغة (عربي/إنجليزي) =====
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('sm_lang') || 'ar' } catch { return 'ar' } })
  const isEn = lang === 'en'
  const toggleLang = () => setLang(l => { const n = l === 'ar' ? 'en' : 'ar'; try { localStorage.setItem('sm_lang', n) } catch {} return n })
  // ترجمة المحتوى: يرجّع الإنجليزي إن وُجد وإلا العربي (fallback)
  const tx = (obj, base) => (isEn && obj && obj[`${base}_en`]) ? obj[`${base}_en`] : (obj?.[base] || '')
  // اسم الصنف داخل الطلب: يُطابق الصنف الحالي لجلب الترجمة، وإلا الاسم المخزّن
  const itemName = (item) => {
    if (isEn && item?.id) {
      const pr = products.find(p => p.id === item.id)
      if (pr?.name_en) return pr.name_en
    }
    return item?.name || ''
  }
  // قاموس نصوص الواجهة الثابتة
  const TT = {
    search:      { ar: 'ابحث في المنيو...', en: 'Search the menu...' },
    bestSellers: { ar: 'الأكثر مبيعاً', en: 'Best Sellers' },
    viewCart:    { ar: 'عرض السلة', en: 'View Cart' },
    cart:        { ar: 'السلة', en: 'Cart' },
    totalVat:    { ar: 'المجموع (شامل الضريبة)', en: 'Total (VAT incl.)' },
    vatLine:     { ar: '· منها ض.ق.م 15%', en: '· incl. 15% VAT' },
    delivery:    { ar: '🛵 رسوم التوصيل', en: '🛵 Delivery fee' },
    openNow:     { ar: 'مفتوح الآن', en: 'Open now' },
    closedNow:   { ar: 'مغلق الآن', en: 'Closed now' },
    addToCart:   { ar: 'أضف للسلة', en: 'Add to cart' },
    checkout:    { ar: 'إتمام الطلب', en: 'Checkout' },
    allergens:   { ar: 'مسبّبات الحساسية', en: 'Allergens' },
    branches:    { ar: 'الفروع', en: 'Branches' },
    currency:    { ar: '﷼', en: 'SAR' },
    empty:       { ar: 'السلة فارغة!', en: 'Your cart is empty!' },
    note:        { ar: 'ملاحظة', en: 'Note' },
    qty:         { ar: 'الكمية', en: 'Quantity' },
    calories:    { ar: 'كالوري', en: 'cal' },
    myOrders:    { ar: 'طلباتي', en: 'My Orders' },
    noResults:   { ar: 'لا توجد نتائج', en: 'No results' },
    dineIn:      { ar: 'محلي', en: 'Dine-in' },
    takeaway2:   { ar: 'سفري', en: 'Takeaway' },
    deliveryT:   { ar: 'توصيل', en: 'Delivery' },
    addrLabel:   { ar: '📍 عنوان التوصيل', en: '📍 Delivery address' },
    namePh:      { ar: 'اسمك', en: 'Your name' },
    phonePh:     { ar: 'رقم جوالك', en: 'Your phone number' },
    addrPh:      { ar: 'اكتب عنوانك بالتفصيل...', en: 'Enter your address...' },
    notePh:      { ar: 'أي ملاحظة على الطلب؟', en: 'Any note on your order?' },
    orderType:   { ar: 'نوع الطلب', en: 'Order type' },
    total:       { ar: 'الإجمالي', en: 'Total' },
    points:      { ar: 'نقاطي', en: 'My Points' },
    rate:        { ar: 'قيّم طلبك', en: 'Rate your order' },
    confirmOrder:{ ar: '🎉 تأكيد الطلب', en: '🎉 Confirm order' },
    closedBtn:   { ar: '⛔ المحل مغلق الآن', en: '⛔ Closed now' },
    namePh2:     { ar: 'مثال: محمد', en: 'e.g. Mohammed' },
    tablePh:     { ar: 'أدخل رقم طاولتك...', en: 'Enter your table number...' },
    addrPh2:     { ar: 'الحي، الشارع، أقرب معلم، ملاحظات إضافية...', en: 'District, street, nearest landmark...' },
    notePh2:     { ar: 'أضف ملاحظتك هنا (اختياري)...', en: 'Add your note here (optional)...' },
    noteShop:    { ar: 'اكتب ملاحظتك للمطعم (اختياري)...', en: 'Note to the restaurant (optional)...' },
    loadingMenu: { ar: 'جارٍ تحميل المنيو...', en: 'Loading menu...' },
    notFound:    { ar: 'المطعم غير موجود', en: 'Restaurant not found' },
    notFoundSub: { ar: 'تأكد من الرابط أو تواصل مع المطعم', en: 'Check the link or contact the restaurant' },
    pickBranch:  { ar: 'اختر الفرع الأقرب ليك 👇', en: 'Choose your nearest branch 👇' },
    loyaltyPts:  { ar: '⭐ نقاط الولاء', en: '⭐ Loyalty points' },
    cartYours:   { ar: 'سلتك', en: 'Your cart' },
    orderTypeR:  { ar: '📦 نوع الطلب', en: '📦 Order type' },
    nameOpt:     { ar: '👤 اسمك (اختياري)', en: '👤 Your name (optional)' },
    phoneReq:    { ar: '📱 رقم جوالك', en: '📱 Your phone' },
    tableReq:    { ar: '🪑 رقم الطاولة', en: '🪑 Table number' },
    addrReq:     { ar: '📍 عنوان التوصيل', en: '📍 Delivery address' },
    closedTitle: { ar: 'المحل مغلق الآن', en: 'Closed now' },
    noteRest:    { ar: '💬 ملاحظتك للمطعم', en: '💬 Note to the restaurant' },
    addToCartB:  { ar: 'إضافة للسلة', en: 'Add to cart' },
    reviewQ:     { ar: 'كيف كانت تجربتك؟', en: 'How was your experience?' },
    sendReview:  { ar: '📤 إرسال التقييم', en: '📤 Send review' },
    sendingRev:  { ar: 'جارٍ الإرسال...', en: 'Sending...' },
    minShort:    { ar: 'د', en: 'min' },
    required:    { ar: 'إجباري', en: 'Required' },
    optional:    { ar: 'اختياري', en: 'Optional' },
    stReceived:  { ar: 'استُلم', en: 'Received' },
    stPreparing: { ar: 'قيد التحضير', en: 'Preparing' },
    stReady:     { ar: 'جاهز للاستلام', en: 'Ready for pickup' },
    stCompleted: { ar: 'تم التسليم 🎉', en: 'Delivered 🎉' },
    stCancYou:   { ar: 'ملغي (بواسطتك)', en: 'Cancelled (by you)' },
    stCancShop:  { ar: 'ملغي من المطعم', en: 'Cancelled by restaurant' },
    otDine:      { ar: '🪑 محلي', en: '🪑 Dine-in' },
    otTake:      { ar: '🥡 سفري', en: '🥡 Takeaway' },
    otDeliv:     { ar: '🛵 توصيل', en: '🛵 Delivery' },
    tAdded:      { ar: 'تمت الإضافة', en: 'Added' },
    tEnterTable: { ar: 'أدخل رقم الطاولة', en: 'Enter table number' },
    tEnterAddr:  { ar: 'أدخل عنوان التوصيل', en: 'Enter delivery address' },
    tEnterPhone: { ar: 'أدخل رقم جوالك', en: 'Enter your phone number' },
    tBadPhone:   { ar: 'رقم الجوال غير صحيح، يرجى إدخال رقم صالح', en: 'Invalid phone number' },
    tClosed:     { ar: 'المحل مغلق الآن، لا يمكن استقبال الطلبات', en: 'Closed now — orders unavailable' },
    tNoContact:  { ar: 'رقم تواصل المطعم غير متوفر', en: 'Restaurant contact unavailable' },
    tCancelled:  { ar: 'تم إلغاء طلبك', en: 'Your order was cancelled' },
    tCancelFail: { ar: 'تعذّر الإلغاء — يبدو أن المطعم بدأ تحضير طلبك بالفعل', en: "Couldn't cancel — preparation already started" },
    tPickStars:  { ar: 'اختر عدد النجوم أولاً ⭐', en: 'Pick a rating first ⭐' },
    tRevThanks:  { ar: 'شكراً لتقييمك! 🙏 وصل تقييمك للمطعم', en: 'Thanks for your review! 🙏' },
    reviewedOk:  { ar: '✅ شكراً لتقييمك!', en: '✅ Thanks for your review!' },
    mapBtn:      { ar: '🗺️ الخريطة', en: '🗺️ Map' },
    mapLocation: { ar: '🗺️ الموقع على الخريطة', en: '🗺️ View on map' },
    tRevFail:    { ar: 'تعذّر إرسال التقييم، حاول مرة أخرى', en: "Couldn't send review, try again" },
    tErr:        { ar: 'حدث خطأ، حاول مجدداً', en: 'An error occurred, try again' },
    tCartEmpty:  { ar: 'السلة فارغة!', en: 'Your cart is empty!' },
    tPleaseChoose:{ ar: 'يرجى اختيار', en: 'Please choose' },
    unavailable: { ar: 'غير متوفر', en: 'Unavailable' },
    featured:    { ar: '⭐ مميز', en: '⭐ Featured' },
    ordersTitle: { ar: 'طلباتك', en: 'Your Orders' },
    prevOrders:  { ar: 'طلباتك السابقة', en: 'Your previous orders' },
    ptsUnit:     { ar: 'نقطة', en: 'pts' },
    deliveryFee: { ar: '🛵 رسوم التوصيل', en: '🛵 Delivery fee' },
    feeSuffix:   { ar: 'رسوم توصيل', en: 'delivery fee' },
    cancelledByShop:{ ar: 'تم إلغاء طلبك من قبل المطعم', en: 'Your order was cancelled by the restaurant' },
    itemUnavail: { ar: 'أصبح غير متوفر في طلبك', en: 'became unavailable in your order' },
    tCancelFail3:{ ar: 'تعذّر إلغاء الطلب، حاول مرة أخرى', en: 'Could not cancel the order, try again' },
    allergensDesc:{ ar: 'قد تحتوي أصناف هذا المنيو على واحد أو أكثر من المسبّبات التالية', en: 'Some menu items may contain one or more of the following allergens' },
    close:       { ar: 'إغلاق', en: 'Close' },
    cancelOrder: { ar: 'إلغاء الطلب', en: 'Cancel order' },
    sendWaLast:  { ar: '💬 إرسال تأكيد آخر طلب عبر واتساب', en: '💬 Send last order via WhatsApp' },
    backToMenu:  { ar: '← العودة للمنيو لطلب إضافي', en: '← Back to menu for another order' },
    rewardDefault:{ ar: 'مكافأة', en: 'reward' },
  }
  const t = (key) => (TT[key]?.[lang]) ?? TT[key]?.ar ?? key

  const [modalQty, setModalQty] = useState(1)
  const [modalNote, setModalNote] = useState('')
  const [modalOptions, setModalOptions] = useState({}) // { groupIdx: choiceIdx | [choiceIdx,...] }
  const [tableNumber, setTableNumber] = useState('')
  const [orderType, setOrderType] = useState('dine_in') // dine_in | takeaway | delivery
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [reviewedIds, setReviewedIds] = useState([])       // طلبات قُيّمت بالفعل
  const [reviewDraft, setReviewDraft] = useState({})       // { [orderId]: { rating, comment } }
  const [submittingReview, setSubmittingReview] = useState(false)
  const [loyalty, setLoyalty] = useState(null)             // معلومات نقاط الزبون (لو البرنامج مفعّل)
  const [orderNumber, setOrderNumber] = useState('')
  const [lastOrderSummary, setLastOrderSummary] = useState(null) // { items, total, tableNumber } للمشاركة عبر واتساب
  // activeOrders: كل الطلبات النشطة لهذا المطعم على هذا الجهاز، محفوظة في localStorage
  // كل عنصر: { id, orderNumber, status, items, total, tableNumber, createdAt }
  const [activeOrders, setActiveOrders] = useState([])
  const [restaurantActiveOrdersCount, setActiveOrdersCount] = useState(0)
  const orderChannelsRef = useRef({}) // { [orderId]: channel }
  const restaurantLoadChannelRef = useRef(null)
  const activeOrdersRef = useRef([]) // أحدث نسخة من activeOrders (تُستخدم في المصالحة داخل مستمعي الأحداث)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAllergensModal, setShowAllergensModal] = useState(false)
  const categoryObserverRef = useRef(null)

  const ORDERS_STORAGE_KEY = `simsim_orders_${slug}`
  const REVIEWS_STORAGE_KEY = `simsim_reviewed_${slug}` // معرّفات الطلبات التي قُيّمت من هذا الجهاز
  const PHONE_STORAGE_KEY = `simsim_phone_${slug}`       // آخر رقم جوال استخدمه الزبون (لعرض نقاطه)
  const SCREEN_SESSION_KEY = `simsim_screen_${slug}`

  useEffect(() => {
    fetchMenu()
  }, [slug])

  // قفل تمرير الصفحة خلف الـ Modal طول ما هي مفتوحة (يمنع تحرّك المنيو أثناء سحب الـ Modal)
  useEffect(() => {
    if (selectedProduct) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [selectedProduct])

  // تحميل الطلبات النشطة المحفوظة من قبل لهذا المطعم، والاستماع لتحديثاتها
  useEffect(() => {
    if (!slug) return
    try {
      const saved = JSON.parse(localStorage.getItem(ORDERS_STORAGE_KEY) || '[]')
      // إخفاء الطلبات المكتملة/الملغاة القديمة جداً (أكثر من 12 ساعة) لتجنب تراكم لا نهائي
      const recent = saved.filter(o => Date.now() - (o.createdAt || 0) < 12 * 60 * 60 * 1000)
      setActiveOrders(recent)

      // تحديد الشاشة الافتراضية: لو هذه أول فتحة في الجلسة الحالية (تبويب/مسح QR جديد) → المنيو دائماً
      // لو فيه شاشة محفوظة من قبل في نفس الجلسة (تحديث الصفحة) → نرجع لنفس الشاشة التي كان فيها العميل
      const savedScreen = sessionStorage.getItem(SCREEN_SESSION_KEY)
      if (savedScreen === 'orders' && recent.length > 0) {
        setOrderPlaced(true)
      } else {
        setOrderPlaced(false)
        sessionStorage.setItem(SCREEN_SESSION_KEY, 'menu')
      }
    } catch {
      setActiveOrders([])
    }
  }, [slug])

  // حفظ الشاشة الحالية (منيو أو طلباتي) في sessionStorage عند أي تغيير، لتُستعاد بدقة عند تحديث الصفحة فقط
  useEffect(() => {
    if (!slug) return
    sessionStorage.setItem(SCREEN_SESSION_KEY, orderPlaced ? 'orders' : 'menu')
  }, [orderPlaced, slug])

  // حفظ activeOrders في localStorage عند أي تغيير، والاشتراك في تحديثات أي طلب جديد لم يُشترك له بعد
  useEffect(() => {
    if (!slug) return
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(activeOrders))
    activeOrdersRef.current = activeOrders
    activeOrders.forEach(order => {
      if (orderChannelsRef.current[order.id]) return // مشترك بالفعل
      const ch = supabase.channel(`order-status-${order.id}`)
        .on('postgres_changes',
          { event:'UPDATE', schema:'public', table:'orders', filter:`id=eq.${order.id}` },
          (p) => {
            const newItems = Array.isArray(p.new.items) ? p.new.items : []
            const newStatus = p.new.status
            const newCancelledBy = p.new.cancelled_by
            setActiveOrders(prev => prev.map(o => {
              if (o.id !== order.id) return o
              if (newStatus === 'cancelled' && o.status !== 'cancelled') {
                toast.error(`🚫 ${t('cancelledByShop')} (${o.orderNumber})`, { duration: 8000 })
              } else {
                // إشعار عند تعليم صنف جديد كغير متوفر (طلب لسه نشط)
                newItems.forEach((ni, idx) => {
                  const wasUnavailable = o.items[idx]?.unavailable
                  if (ni.unavailable && !wasUnavailable) {
                    toast.error(`⚠️ ${ni.name} ${t('itemUnavail')} (${o.orderNumber})`, { duration: 6000 })
                  }
                })
              }
              return { ...o, status: newStatus, cancelledBy: newCancelledBy, items: newItems, total: Number(p.new.total) || 0 }
            }))
          }
        ).subscribe()
      orderChannelsRef.current[order.id] = ch
    })
  }, [activeOrders, slug])

  useEffect(() => {
    return () => {
      Object.values(orderChannelsRef.current).forEach(ch => supabase.removeChannel(ch))
      if (restaurantLoadChannelRef.current) supabase.removeChannel(restaurantLoadChannelRef.current)
    }
  }, [])

  // جلب نقاط ولاء الزبون عند دخول شاشة "طلباتي" (لو البرنامج مفعّل)
  useEffect(() => {
    if (!orderPlaced || !restaurant) return
    let phone = customerPhone.replace(/[^\d]/g, '')
    if (!phone) { try { phone = localStorage.getItem(PHONE_STORAGE_KEY) || '' } catch { phone = '' } }
    if (!phone) { setLoyalty(null); return }
    supabase.rpc('get_customer_loyalty', { rest_id: restaurant.id, phone })
      .then(({ data }) => {
        const info = data && data[0]
        setLoyalty(info && info.enabled ? info : null)
      })
      .catch(() => setLoyalty(null))
  }, [orderPlaced, restaurant, activeOrders])

  // مصالحة الحالة: نعيد جلب الحالة الحقيقية للطلبات النشطة من قاعدة البيانات
  // لتعويض أي تحديث فات أثناء انقطاع اتصال realtime (خروج من المتصفح / قفل الشاشة)
  const reconcileActiveOrders = async () => {
    const list = activeOrdersRef.current || []
    const ids = list
      .filter(o => o.status !== 'completed' && o.status !== 'cancelled')
      .map(o => o.id)
    if (ids.length === 0) return
    try {
      const { data, error } = await supabase.rpc('get_orders_status', { order_ids: ids })
      if (error || !data) return
      setActiveOrders(prev => prev.map(o => {
        const fresh = data.find(d => d.id === o.id)
        if (!fresh) return o
        // إشعار لو اكتشفنا إلغاءً من المطعم لم يصل عبر realtime
        if (fresh.status === 'cancelled' && o.status !== 'cancelled' && fresh.cancelled_by !== 'customer') {
          toast.error(`🚫 ${t('cancelledByShop')} (${o.orderNumber})`, { duration: 8000 })
        }
        return {
          ...o,
          status: fresh.status,
          cancelledBy: fresh.cancelled_by ?? o.cancelledBy,
          items: Array.isArray(fresh.items) ? fresh.items : o.items,
          total: Number(fresh.total) || o.total,
        }
      }))
    } catch { /* تجاهل أخطاء الشبكة المؤقتة */ }
  }

  // إعادة المزامنة عند رجوع الزبون للصفحة (تبديل تبويب/فتح المتصفح) + كل فترة قصيرة كشبكة أمان
  useEffect(() => {
    if (!slug) return
    const onVisible = () => { if (document.visibilityState === 'visible') reconcileActiveOrders() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', reconcileActiveOrders)
    const kickoff = setTimeout(reconcileActiveOrders, 1500) // مزامنة أولية سريعة بعد التحميل
    const interval = setInterval(reconcileActiveOrders, 20000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', reconcileActiveOrders)
      clearTimeout(kickoff)
      clearInterval(interval)
    }
  }, [slug])

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

  const fetchMenu = async () => {
    try {
      // Fetch restaurant
      const { data: rest, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single()

      if (error || !rest) { setNotFound(true); return }
      setRestaurant(rest)

      // لو الرابط يحتوي معرّف فرع، نجلب بياناته لعرض اسمه وربط الطلب به
      if (branchId) {
        const { data: br } = await supabase
          .from('branches')
          .select('*')
          .eq('id', branchId)
          .eq('restaurant_id', rest.id)
          .eq('is_active', true)
          .single()
        if (br) setBranch(br)
        setBranchPicked(true) // الفرع محدد مسبقاً من الرابط، لا حاجة لصفحة الاختيار
      } else {
        // لا يوجد فرع في الرابط: نجلب كل الفروع النشطة لعرض صفحة "اختر فرعك"
        const { data: brs } = await supabase
          .from('branches')
          .select('*')
          .eq('restaurant_id', rest.id)
          .eq('is_active', true)
          .order('sort_order')
        const list = brs || []
        setBranchList(list)
        // نعرض صفحة الاختيار فقط لو فيه فرع نشط واحد على الأقل، وإلا نكمل مباشرة (الفرع الرئيسي)
        if (list.length === 0) setBranchPicked(true)
      }

      // عدد الطلبات النشطة حالياً لحساب وقت تجهيز تقديري ديناميكي (عبر RPC آمن)
      const { data: activeCount } = await supabase.rpc('get_active_orders_count', { p_restaurant_id: rest.id })
      setActiveOrdersCount(activeCount || 0)

      // Fetch categories & products
      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase.from('categories').select('*').eq('restaurant_id', rest.id).eq('is_visible', true).order('sort_order'),
        supabase.from('products').select('*').eq('restaurant_id', rest.id).eq('is_available', true).order('sort_order'),
      ])

      if (cats) { setCategories(cats); if (cats.length > 0) setActiveCategory(cats[0].id) }
      if (prods) setProducts(prods)

      // حساب الأصناف الأكثر مبيعاً من الطلبات الفعلية (غير الملغاة) خلال آخر 30 يوماً (عبر RPC آمن)
      const { data: pastOrders } = await supabase.rpc('get_recent_order_items', { p_restaurant_id: rest.id })

      if (pastOrders && prods) {
        const salesCount = {}
        pastOrders.forEach(o => {
          const orderItems = Array.isArray(o.items) ? o.items : []
          orderItems.forEach(it => {
            if (it.unavailable) return
            salesCount[it.id] = (salesCount[it.id] || 0) + (it.qty || 1)
          })
        })
        const ranked = prods
          .filter(p => salesCount[p.id] > 0)
          .sort((a, b) => salesCount[b.id] - salesCount[a.id])
          .slice(0, 4)
        setBestSellers(ranked)
      }

      // تحديث عدد الطلبات النشطة لحظياً مع كل طلب جديد أو تغيّر حالة
      if (restaurantLoadChannelRef.current) supabase.removeChannel(restaurantLoadChannelRef.current)
      restaurantLoadChannelRef.current = supabase.channel(`restaurant-load-${rest.id}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rest.id}` },
          async () => {
            const { data: c } = await supabase.rpc('get_active_orders_count', { p_restaurant_id: rest.id })
            setActiveOrdersCount(c || 0)
          }
        ).subscribe()
    } finally {
      setLoading(false)
    }
  }

  // وقت تجهيز تقديري ديناميكي: وقت أساسي + دقائق إضافية لكل طلب نشط حالياً بالمطبخ
  const estimatedPrepTime = () => {
    const base = 10
    const perOrder = 3
    const min = base + restaurantActiveOrdersCount * perOrder
    const max = min + 10
    return `${min}-${max}`
  }

  // Cart functions
  // selectedOptions: [{ groupName, choiceName, price }] — قائمة مفسّرة من الخيارات المختارة
  const addToCart = (product, qty = 1, note = '', selectedOptions = []) => {
    const optionsPrice = selectedOptions.reduce((s, o) => s + (o.price || 0), 0)
    const finalPrice = product.price + optionsPrice
    // مفتاح فريد للعنصر: نفس الصنف بخيارات مختلفة = عنصر سلة مختلف
    const optionsKey = selectedOptions.map(o => `${o.groupName}:${o.choiceName}`).sort().join('|')
    const cartKey = `${product.id}__${optionsKey}__${note}`

    setCart(prev => {
      const existing = prev.find(i => i.cartKey === cartKey)
      if (existing) return prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + qty } : i)
      return [...prev, {
        cartKey, id: product.id, name: product.name, emoji: product.emoji, image_url: product.image_url,
        price: finalPrice, basePrice: product.price, qty, note,
        selectedOptions,
      }]
    })
    toast.success(`✅ ${t('tAdded')}`)
  }

  const removeFromCart = (cartKey) => {
    setCart(prev => {
      const item = prev.find(i => i.cartKey === cartKey)
      if (!item) return prev
      if (item.qty <= 1) return prev.filter(i => i.cartKey !== cartKey)
      return prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty - 1 } : i)
    })
  }

  const incrementCartItem = (cartKey) => {
    setCart(prev => prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + 1 } : i))
  }

  // التحقق من اكتمال كل مجموعات الخيارات الإجبارية للصنف المعروض في الـ Modal
  const validateModalOptions = (product) => {
    const groups = Array.isArray(product?.options) ? product.options : []
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi]
      if (!group.required) continue
      const sel = modalOptions[gi]
      if (group.type === 'multiple') {
        if (!Array.isArray(sel) || sel.length === 0) return group.name
      } else {
        if (sel == null) return group.name
      }
    }
    return null
  }

  // تحويل modalOptions (مؤشرات) إلى قائمة مفسّرة {groupName, choiceName, price}
  const resolveModalOptions = (product) => {
    const groups = Array.isArray(product?.options) ? product.options : []
    const resolved = []
    groups.forEach((group, gi) => {
      const sel = modalOptions[gi]
      if (sel == null) return
      if (group.type === 'multiple') {
        (Array.isArray(sel) ? sel : []).forEach(ci => {
          const choice = group.choices[ci]
          if (choice) resolved.push({ groupName: group.name, choiceName: choice.name, price: choice.price || 0 })
        })
      } else {
        const choice = group.choices[sel]
        if (choice) resolved.push({ groupName: group.name, choiceName: choice.name, price: choice.price || 0 })
      }
    })
    return resolved
  }

  const toggleSingleOption = (groupIdx, choiceIdx) => {
    setModalOptions(prev => ({ ...prev, [groupIdx]: choiceIdx }))
  }

  const toggleMultipleOption = (groupIdx, choiceIdx) => {
    setModalOptions(prev => {
      const current = Array.isArray(prev[groupIdx]) ? prev[groupIdx] : []
      const next = current.includes(choiceIdx)
        ? current.filter(i => i !== choiceIdx)
        : [...current, choiceIdx]
      return { ...prev, [groupIdx]: next }
    })
  }

  // سحب Modal تفاصيل الصنف للأسفل بالإصبع لإغلاقها (Swipe-to-dismiss)
  const DRAG_CLOSE_THRESHOLD = 100 // px — لو السحب تجاوز هذا الحد، يُغلَق الـ Modal تلقائياً

  const handleModalTouchStart = (e) => {
    dragStartYRef.current = e.touches[0].clientY
  }

  const handleModalTouchMove = (e) => {
    if (dragStartYRef.current == null) return
    const delta = e.touches[0].clientY - dragStartYRef.current
    if (delta > 0) {
      e.preventDefault() // منع تمرير الصفحة خلف الـ Modal أثناء السحب للأسفل
      setDragOffset(delta)
    }
  }

  const handleModalTouchEnd = () => {
    if (dragOffset > DRAG_CLOSE_THRESHOLD) {
      setSelectedProduct(null)
    }
    setDragOffset(0)
    dragStartYRef.current = null
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0)
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0)

  // حالة فتح المحل (حسب الفرع لو محدد، وإلا المطعم) — تُستخدم لمنع الطلب وقت الإغلاق
  const openStatus = restaurant
    ? computeOpenStatus(branch?.opening_hours || restaurant.opening_hours)
    : { open: true, unknown: true, nextText: '', todayText: '' }

  // عدد الطلبات النشطة فعلياً (انتظار/تحضير/جاهز) — لا يشمل المكتملة أو الملغاة
  const liveOrdersCount = activeOrders.filter(o => ['pending','preparing','ready'].includes(o.status)).length

  // بناء رسالة واتساب جاهزة بتفاصيل الطلب وفتحها على رقم المطعم
  const sendWhatsAppConfirmation = () => {
    if (!lastOrderSummary || !restaurant?.phone) {
      toast.error(t('tNoContact'))
      return
    }
    const greeting = restaurant.whatsapp_message?.trim() || `تفضل تأكيد طلبي من ${restaurant.name} 🍽️`
    const typeLabels = { dine_in:'محلي 🪑', takeaway:'سفري 🥡', delivery:'توصيل 🛵' }
    const locationLine = lastOrderSummary.orderType === 'delivery'
      ? `عنوان التوصيل: ${lastOrderSummary.deliveryAddress}`
      : lastOrderSummary.orderType === 'dine_in'
        ? `رقم الطاولة: ${lastOrderSummary.tableNumber}`
        : null
    const lines = [
      greeting,
      `رقم الطلب: ${lastOrderSummary.orderNumber}`,
      `نوع الطلب: ${typeLabels[lastOrderSummary.orderType] || lastOrderSummary.orderType}`,
      ...(locationLine ? [locationLine] : []),
      '',
      'الأصناف:',
      ...lastOrderSummary.items.map(i => {
        const optsText = (i.selectedOptions && i.selectedOptions.length > 0)
          ? ` (${i.selectedOptions.map(o => o.choiceName).join(isEn ? ', ' : '، ')})`
          : ''
        return `- ${i.name}${optsText} × ${i.qty} = ${(i.price * i.qty).toFixed(2)} ﷼`
      }),
      '',
      `الإجمالي: ${lastOrderSummary.total.toFixed(2)} ﷼`,
    ]
    const phone = restaurant.phone.replace(/[^\d]/g, '')
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`
    window.open(url, '_blank')
  }

  // فتح محادثة واتساب عامة للاستفسارات، بمعزل عن طلب فعلي (الزر العائم)
  const openWhatsAppContact = () => {
    if (!restaurant?.phone) {
      toast.error(t('tNoContact'))
      return
    }
    const greeting = restaurant.whatsapp_message?.trim() || `مرحباً، لدي استفسار بخصوص ${restaurant.name} 👋`
    const phone = restaurant.phone.replace(/[^\d]/g, '')
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(greeting)}`
    window.open(url, '_blank')
  }

  // Place order
  const placeOrder = async () => {
    if (cart.length === 0) { toast.error(t('tCartEmpty')); return }
    // منع الطلب وقت الإغلاق حسب أوقات الفرع/المطعم
    const openStatus = computeOpenStatus(branch?.opening_hours || restaurant.opening_hours)
    if (!openStatus.open) {
      toast.error(openStatus.nextText ? `${t('closedTitle')} — ${openStatus.nextText}` : t('tClosed'))
      return
    }
    if (orderType === 'dine_in' && !tableNumber.trim()) { toast.error(t('tEnterTable')); return }
    if (orderType === 'delivery' && !deliveryAddress.trim()) { toast.error(t('tEnterAddr')); return }
    if (!customerPhone.trim()) { toast.error(t('tEnterPhone')); return }
    const cleanPhone = customerPhone.replace(/[^\d]/g, '')
    if (cleanPhone.length < 8 || cleanPhone.length > 15) {
      toast.error(t('tBadPhone'))
      return
    }

    const items = cart.map(i => ({
      id: i.id, name: i.name, emoji: i.emoji, image_url: i.image_url,
      price: i.price, qty: i.qty, notes: i.note,
      selectedOptions: i.selectedOptions || [],
    }))

    const deliveryFee = orderType === 'delivery' ? (Number(restaurant.delivery_fee) || 0) : 0
    // الأسعار المعروضة شاملة ض.ق.م 15% — نفكّ الضريبة للخلف
    const net = cartTotal / 1.15
    const tax = cartTotal - net
    const total = cartTotal + deliveryFee

    const { data, error } = await supabase.from('orders').insert({
      restaurant_id: restaurant.id,
      branch_id: branch?.id || null,
      table_number: orderType === 'dine_in' ? tableNumber : null,
      delivery_address: orderType === 'delivery' ? deliveryAddress.trim() : null,
      customer_name: customerName.trim() || null,
      customer_phone: cleanPhone,
      type: orderType,
      status: 'pending',
      items,
      subtotal: net,
      tax,
      delivery_fee: deliveryFee,
      total,
      notes: '',
    }).select().single()

    if (error) {
      console.error('Order error:', error)
      toast.error(error.message || t('tErr'))
      return
    }

    setOrderNumber(data.order_number)
    setLastOrderSummary({ items, total, tableNumber, orderType, deliveryAddress, orderNumber: data.order_number })
    try { localStorage.setItem(PHONE_STORAGE_KEY, cleanPhone) } catch { /* تجاهل */ }
    setOrderPlaced(true)
    setCart([])
    setCartOpen(false)

    // إضافة الطلب الجديد فوق قائمة الطلبات النشطة (الأحدث أولاً) — الاشتراك في تحديثاته يحصل تلقائياً
    setActiveOrders(prev => [
      { id: data.id, orderNumber: data.order_number, status: 'pending', items, total, tableNumber, orderType, deliveryAddress, createdAt: Date.now() },
      ...prev,
    ])
  }

  // إلغاء الطلب من جهة العميل نفسه — متاح فقط وهو لا يزال "انتظار" قبل أن يبدأ المطعم التحضير
  const cancelOrderByCustomer = async (order) => {
    if (!window.confirm(`هل تريد إلغاء طلب ${order.orderNumber}؟`)) return
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled', cancelled_by: 'customer' })
      .eq('id', order.id)
      .eq('status', 'pending') // حماية إضافية: لا يُنفَّذ إلا لو لسه pending فعلياً في قاعدة البيانات

    if (error) {
      toast.error(t('tCancelFail3'))
      return
    }

    // التأكد من الحالة الحقيقية: update().eq() لا يُرجع خطأ لو لم يُطابق أي صف
    // (أي لو المطعم بدأ التحضير فعلاً) — لذلك نتحقق بدل افتراض النجاح
    let confirmedCancelled = true
    try {
      const { data } = await supabase.rpc('get_orders_status', { order_ids: [order.id] })
      const fresh = data && data[0]
      if (fresh) {
        confirmedCancelled = fresh.status === 'cancelled'
        if (!confirmedCancelled) {
          setActiveOrders(prev => prev.map(o => o.id === order.id
            ? { ...o, status: fresh.status, cancelledBy: fresh.cancelled_by ?? o.cancelledBy }
            : o))
        }
      }
    } catch { /* تعذّر التحقق — نفترض النجاح ما دام لم يُرجع خطأ */ }

    if (confirmedCancelled) {
      setActiveOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'cancelled', cancelledBy:'customer' } : o))
      toast.success(t('tCancelled'))
    } else {
      toast.error(t('tCancelFail'))
    }
  }

  // تحميل معرّفات الطلبات التي سبق تقييمها من هذا الجهاز (حتى لا يُقيّم الطلب مرتين)
  useEffect(() => {
    if (!slug) return
    try {
      const saved = JSON.parse(localStorage.getItem(REVIEWS_STORAGE_KEY) || '[]')
      if (Array.isArray(saved)) setReviewedIds(saved)
    } catch { /* تجاهل */ }
  }, [slug])

  const setDraft = (orderId, patch) => {
    setReviewDraft(prev => ({ ...prev, [orderId]: { rating: 0, comment: '', ...prev[orderId], ...patch } }))
  }

  // إرسال تقييم الزبون بعد اكتمال الطلب — يصل لصاحب المطعم في لوحة التحكم
  const submitReview = async (order) => {
    const draft = reviewDraft[order.id] || {}
    if (!draft.rating || draft.rating < 1) { toast.error(t('tPickStars')); return }
    setSubmittingReview(true)
    try {
      const { error } = await supabase.from('reviews').insert({
        restaurant_id: restaurant.id,
        branch_id: branch?.id || null,
        order_id: order.id,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.replace(/[^\d]/g, '') || null,
        rating: draft.rating,
        comment: (draft.comment || '').trim() || null,
      })
      if (error) throw error
      const updated = [...reviewedIds, order.id]
      setReviewedIds(updated)
      localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(updated))
      toast.success(t('tRevThanks'))
    } catch (err) {
      toast.error(t('tRevFail'))
    } finally {
      setSubmittingReview(false)
    }
  }

  // Filter products
  const filteredProducts = (catId) => {
    let prods = products.filter(p => p.category_id === catId)
    if (searchQuery) prods = products.filter(p => p.name.includes(searchQuery) || (p.description || '').includes(searchQuery))
    return prods
  }

  const allFiltered = searchQuery ? products.filter(p => p.name.includes(searchQuery)) : []

  const brandColor = restaurant?.brand_color || '#FF6B35'
  const priceColor = restaurant?.price_color || brandColor
  const descColor = restaurant?.description_color || '#9CA3AF'

  // Loading
  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F8F9FB', flexDirection:'column', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'48px', height:'48px', border:`3px solid rgba(0,0,0,0.1)`, borderTopColor: brandColor, borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <span style={{ color:'#9CA3AF', fontSize:'14px' }}>{t('loadingMenu')}</span>
    </div>
  )

  // Not found
  if (notFound) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F8F9FB', flexDirection:'column', gap:'16px', fontFamily:'Cairo,sans-serif', direction:'rtl', textAlign:'center', padding:'24px' }}>
      <div style={{ fontSize:'64px' }}>🔍</div>
      <h2 style={{ fontSize:'22px', fontWeight:'900', color:'#0F1117' }}>{t('notFound')}</h2>
      <p style={{ color:'#9CA3AF', fontSize:'14px' }}>{t('notFoundSub')}</p>
    </div>
  )

  // ===== صفحة "اختر فرعك" — تظهر لو فيه فروع نشطة ولم يُحدَّد فرع في الرابط =====
  if (!branchPicked && branchList.length > 0) {
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

    // بطاقة فرع واحدة (تُستخدم للفرع الرئيسي وباقي الفروع)
    const BranchCard = ({ name, address, mapsUrl, hours, onPick, isMain }) => {
      const st = computeOpenStatus(hours)
      const c = st.open ? '#10B981' : '#EF4444'
      const bg = st.open ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'
      return (
        <div
          onClick={onPick}
          style={{ background:'white', borderRadius:'16px', border:'1.5px solid #E5E7EB', padding:'16px', cursor:'pointer', transition:'all 0.15s', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}
        >
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <div style={{ width:'46px', height:'46px', borderRadius:'12px', background:`${brandColor}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px', flexShrink:0 }}>
              {isMain ? '🏠' : '🏢'}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', color:'#0F1117', marginBottom:'3px' }}>{name}</div>
              {address && <div style={{ fontSize:'12px', color:'#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>📍 {address}</div>}
            </div>
            <span style={{ fontSize:'20px', color:'#D1D5DB', flexShrink:0 }}>‹</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginTop:'10px', flexWrap:'wrap' }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'11px', fontWeight:'700', color:c, background:bg, padding:'3px 9px', borderRadius:'100px' }}>
              <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:c, display:'inline-block' }}/>
              {st.open ? t('openNow') : t('closedNow')}
            </span>
            {!st.open && st.nextText && <span style={{ fontSize:'11px', color:'#EF4444' }}>{st.nextText}</span>}
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ fontSize:'11px', fontWeight:'700', color:brandColor, background:`${brandColor}14`, padding:'3px 9px', borderRadius:'100px', textDecoration:'none' }}
              >
                {t('mapBtn')}
              </a>
            )}
          </div>
        </div>
      )
    }

    return (
      <div style={{ minHeight:'100vh', background:'#F8F9FB', direction:'rtl', fontFamily:'Tajawal,sans-serif', maxWidth:'480px', margin:'0 auto', position:'relative', boxShadow:'0 0 60px rgba(15,17,23,0.12)' }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} * { box-sizing: border-box; } @media(min-width:600px){body{background:#E9ECF2}}`}</style>

        {/* Header */}
        <div style={{ background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, padding:'28px 20px 22px', textAlign:'center', color:'white' }}>
          <div style={{ width:'64px', height:'64px', borderRadius:'16px', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'30px', margin:'0 auto 12px', overflow:'hidden' }}>
            {restaurant.logo_url
              ? <img src={restaurant.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : '🍕'}
          </div>
          <h1 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', marginBottom:'4px' }}>{restaurant.name}</h1>
          <p style={{ fontSize:'13px', opacity:0.9 }}>{t('pickBranch')}</p>
        </div>

        {/* Branch list */}
        <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:'12px', maxWidth:'520px', margin:'0 auto' }}>
          {/* الفرع الرئيسي (المطعم نفسه) */}
          <BranchCard
            isMain
            name="الفرع الرئيسي"
            address={restaurant.address}
            mapsUrl={null}
            hours={restaurant.opening_hours}
            onPick={() => chooseBranch(null)}
          />
          {branchList.map(b => (
            <BranchCard
              key={b.id}
              name={isEn && b.name_en ? b.name_en : b.name}
              address={isEn && b.address_en ? b.address_en : b.address}
              mapsUrl={b.maps_url}
              hours={b.opening_hours}
              onPick={() => chooseBranch(b)}
            />
          ))}
        </div>
      </div>
    )
  }

  // Order placed / tracking screen — يعرض كل الطلبات النشطة، الأحدث أولاً
  if (orderPlaced) return (
    <div style={{ minHeight:'100vh', background:'#F8F9FB', direction:'rtl', fontFamily:'Tajawal,sans-serif', maxWidth:'480px', margin:'0 auto', position:'relative', boxShadow:'0 0 60px rgba(15,17,23,0.12)' }}>
      <style>{`@media(min-width:600px){body{background:#E9ECF2}}`}</style>
      <div style={{ background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, padding:'32px 24px', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, background:'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1), transparent)', pointerEvents:'none' }}/>
        <div style={{ fontSize:'56px', marginBottom:'10px', position:'relative' }}>🎉</div>
        <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'22px', color:'white', marginBottom:'4px' }}>{t('ordersTitle')}</h2>
        <p style={{ color:'rgba(255,255,255,0.8)', fontSize:'13px' }}>{liveOrdersCount > 0 ? `${liveOrdersCount} ${isEn ? 'active order(s)' : 'طلب نشط'}` : t('prevOrders')}</p>
      </div>

      <div style={{ padding:'20px 16px' }}>
        {/* بطاقة نقاط الولاء — تظهر لو البرنامج مفعّل والزبون معروف */}
        {loyalty && (() => {
          const threshold = loyalty.reward_threshold || 0
          const balance = loyalty.balance || 0
          const ready = threshold > 0 && balance >= threshold
          const pct = threshold > 0 ? Math.min(100, Math.round((balance / threshold) * 100)) : 0
          return (
            <div style={{ background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, borderRadius:'18px', padding:'18px', marginBottom:'16px', color:'white' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                <span style={{ fontSize:'13px', fontWeight:'700', opacity:0.9 }}>{t('loyaltyPts')}</span>
                <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'22px', lineHeight:1 }}>{balance}<span style={{ fontSize:'12px', fontWeight:'700', opacity:0.85 }}> {t('ptsUnit')}</span></span>
              </div>
              {ready ? (
                <div style={{ background:'rgba(255,255,255,0.2)', borderRadius:'11px', padding:'10px 12px', fontSize:'13px', fontWeight:'800' }}>
                  🎉 {isEn ? 'Your reward is ready' : 'مكافأتك جاهزة'}: {loyalty.reward_description || t('rewardDefault')} — {isEn ? 'claim it at the restaurant!' : 'اطلبها عند المطعم!'}
                </div>
              ) : (
                <>
                  <div style={{ height:'8px', background:'rgba(255,255,255,0.25)', borderRadius:'100px', overflow:'hidden', marginBottom:'8px' }}>
                    <div style={{ width:`${pct}%`, height:'100%', background:'white', borderRadius:'100px', transition:'width 0.5s' }}/>
                  </div>
                  <div style={{ fontSize:'12px', opacity:0.92 }}>
                    {isEn ? `${Math.max(0, threshold - balance)} pts left to unlock` : `باقي ${Math.max(0, threshold - balance)} نقطة للحصول على`}: {loyalty.reward_description || t('rewardDefault')}
                  </div>
                </>
              )}
            </div>
          )
        })()}
        {activeOrders.map(order => {
          const statuses = ['pending','preparing','ready','completed']
          const currentIdx = statuses.indexOf(order.status)
          return (
            <div key={order.id} style={{ background:'white', borderRadius:'18px', padding:'18px', marginBottom:'16px', border: order.status==='cancelled' ? '1.5px solid #FEE2E2' : '1px solid #E5E7EB' }}>

              {/* رقم الطلب وحالته */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px' }}>{order.orderNumber}</span>
                <span style={{ fontSize:'11px', fontWeight:'700', color: order.status==='cancelled' ? '#EF4444' : brandColor, background: order.status==='cancelled' ? '#FEF2F2' : `${brandColor}15`, padding:'4px 10px', borderRadius:'100px' }}>
                  {order.status === 'cancelled'
                    ? (order.cancelledBy === 'customer' ? t('stCancYou') : t('stCancShop'))
                    : { pending:t('stReceived'), preparing:t('stPreparing'), ready:t('stReady'), completed:t('stCompleted') }[order.status] || order.status}
                </span>
              </div>

              <div style={{ fontSize:'12px', color:'#9CA3AF', marginBottom:'16px' }}>
                {{ dine_in:t('otDine'), takeaway:t('otTake'), delivery:t('otDeliv') }[order.orderType] || ''}
                {order.orderType === 'dine_in' && order.tableNumber && ` — طاولة ${order.tableNumber}`}
                {order.orderType === 'delivery' && order.deliveryAddress && ` — ${order.deliveryAddress}`}
              </div>

              {/* Status stepper */}
              {order.status !== 'cancelled' && (
                <div style={{ display:'flex', alignItems:'center', marginBottom:'16px' }}>
                  {[
                    { key:'pending', icon:'📥' }, { key:'preparing', icon:'👨‍🍳' },
                    { key:'ready', icon:'✅' }, { key:'completed', icon:'🎉' },
                  ].map((step, i, arr) => {
                    const stepIdx = statuses.indexOf(step.key)
                    const isDone = stepIdx < currentIdx
                    const isCurrent = stepIdx === currentIdx
                    return (
                      <div key={step.key} style={{ display:'flex', alignItems:'center', flex: i < arr.length - 1 ? 1 : 'none' }}>
                        <div style={{
                          width:'30px', height:'30px', borderRadius:'50%',
                          background: isDone ? '#10B981' : isCurrent ? brandColor : '#F3F4F6',
                          border: `2px solid ${isDone ? '#10B981' : isCurrent ? brandColor : '#E5E7EB'}`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:'13px', transition:'all 0.5s', flexShrink:0,
                        }}>
                          {isDone ? '✓' : step.icon}
                        </div>
                        {i < arr.length - 1 && (
                          <div style={{ flex:1, height:'2px', background: isDone ? '#10B981' : '#E5E7EB', margin:'0 4px', transition:'background 0.5s' }}/>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* الأصناف */}
              <div style={{ borderTop:'1px solid #F3F4F6', paddingTop:'12px' }}>
                {order.items.map((item, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 0', opacity: item.unavailable ? 0.55 : 1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <span style={{ fontSize:'15px' }}>{item.emoji || '🍽️'}</span>
                      <span style={{ fontSize:'13px', fontWeight:'600', textDecoration: item.unavailable ? 'line-through' : 'none' }}>{itemName(item)} × {item.qty}</span>
                      {item.unavailable && <span style={{ fontSize:'9px', fontWeight:'700', color:'#EF4444', background:'#FEF2F2', padding:'2px 6px', borderRadius:'100px' }}>{t('unavailable')}</span>}
                    </div>
                  </div>
                ))}
                <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', paddingTop:'8px', marginTop:'4px', borderTop:'1px solid #F3F4F6' }}>
                  <span>{t('total')}</span>
                  <span style={{ color:brandColor }}>{order.total.toFixed(2)} ﷼</span>
                </div>
              </div>

              {/* تقييم الزبون — يظهر بعد اكتمال الطلب فقط */}
              {order.status === 'completed' && (
                reviewedIds.includes(order.id) ? (
                  <div style={{ marginTop:'12px', padding:'12px', borderRadius:'12px', background:'#ECFDF5', border:'1px solid #A7F3D0', textAlign:'center', fontSize:'13px', fontWeight:'700', color:'#065F46' }}>
                    {t('reviewedOk')}
                  </div>
                ) : (
                  <div style={{ marginTop:'14px', paddingTop:'14px', borderTop:'1px dashed #E5E7EB' }}>
                    <div style={{ fontSize:'13px', fontWeight:'800', marginBottom:'10px', textAlign:'center' }}>{t('reviewQ')} 🌟</div>
                    <div style={{ display:'flex', justifyContent:'center', gap:'8px', marginBottom:'12px' }}>
                      {[1,2,3,4,5].map(n => {
                        const active = (reviewDraft[order.id]?.rating || 0) >= n
                        return (
                          <span
                            key={n}
                            onClick={() => setDraft(order.id, { rating:n })}
                            style={{ fontSize:'32px', cursor:'pointer', lineHeight:1, filter: active ? 'none' : 'grayscale(1)', opacity: active ? 1 : 0.35, transition:'all 0.1s' }}
                          >⭐</span>
                        )
                      })}
                    </div>
                    <textarea
                      value={reviewDraft[order.id]?.comment || ''}
                      onChange={e => setDraft(order.id, { comment: e.target.value })}
                      placeholder={t('noteShop')}
                      style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'13px', outline:'none', textAlign:'right', minHeight:'60px', resize:'vertical', boxSizing:'border-box', marginBottom:'10px' }}
                    />
                    <button
                      onClick={() => submitReview(order)}
                      disabled={submittingReview}
                      style={{ width:'100%', padding:'11px', borderRadius:'11px', border:'none', background:brandColor, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', cursor:'pointer', opacity: submittingReview ? 0.7 : 1 }}
                    >
                      {submittingReview ? t('sendingRev') : t('sendReview')}
                    </button>
                  </div>
                )
              )}

              {/* إلغاء الطلب — متاح فقط قبل أن يبدأ المطعم التحضير */}
              {order.status === 'pending' && (
                <button
                  onClick={() => cancelOrderByCustomer(order)}
                  style={{ width:'100%', marginTop:'12px', padding:'10px', borderRadius:'11px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', color:'#EF4444', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}
                >
                  {t('cancelOrder')}
                </button>
              )}
            </div>
          )
        })}

        {/* WhatsApp confirmation لآخر طلب (اختياري) */}
        {restaurant?.phone && lastOrderSummary && (
          <button
            onClick={sendWhatsAppConfirmation}
            style={{ width:'100%', padding:'15px', borderRadius:'14px', border:'1.5px solid #25D366', background:'rgba(37,211,102,0.08)', color:'#1FA855', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', cursor:'pointer', marginBottom:'12px', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}
          >
            {t('sendWaLast')}
          </button>
        )}

        {/* العودة للمنيو لطلب إضافي — الطلبات الحالية تستمر بالتتبع */}
        <button
          onClick={() => setOrderPlaced(false)}
          style={{ width:'100%', padding:'15px', borderRadius:'14px', border:'none', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'16px', cursor:'pointer', boxShadow:`0 8px 24px ${brandColor}44` }}
        >
          {t('backToMenu')}
        </button>
      </div>
    </div>
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
      <div style={{ background:`linear-gradient(135deg, ${brandColor}22, ${brandColor}08)`, borderBottom:'1px solid #E5E7EB' }}>

        {/* Cover image */}
        {restaurant.cover_url && (
          <div style={{ width:'100%', height:'200px', overflow:'hidden' }}>
            <img src={restaurant.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          </div>
        )}

        <div style={{ padding: restaurant.cover_url ? '0 16px 16px' : '20px 16px 16px', marginTop: restaurant.cover_url ? '-32px' : 0 }}>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'8px' }}>
            <button onClick={toggleLang} style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'6px 12px', borderRadius:'100px', border:'1.5px solid #E5E7EB', background:'white', cursor:'pointer', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', color:'#374151', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
              🌐 {isEn ? 'العربية' : 'English'}
            </button>
          </div>
          <div style={{ display:'flex', alignItems:'flex-start', gap:'14px', marginBottom: tx(restaurant,'description') ? '10px' : 0 }}>
            <div style={{ width:'64px', height:'64px', borderRadius:'16px', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'30px', flexShrink:0, boxShadow:'0 4px 16px rgba(0,0,0,0.2)', overflow:'hidden', border: restaurant.cover_url ? '3px solid white' : 'none' }}>
              {restaurant.logo_url
                ? <img src={restaurant.logo_url} alt={restaurant.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : '🍕'}
            </div>
            <div style={{ flex:1, paddingTop: restaurant.cover_url ? '38px' : 0 }}>
              <h1 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', color:'#0F1117', marginBottom:'4px' }}>{restaurant.name}</h1>
              {branch && (
                <div style={{ fontSize:'12px', fontWeight:'700', color:brandColor, marginBottom:'6px' }}>🏢 {isEn && branch.name_en ? branch.name_en : branch.name}</div>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
                {(() => {
                  const c = openStatus.open ? '#10B981' : '#EF4444'
                  const bg = openStatus.open ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'
                  return (
                    <>
                      <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'12px', fontWeight:'700', color:c, background:bg, padding:'3px 10px', borderRadius:'100px' }}>
                        <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:c, display:'inline-block' }}/>
                        {openStatus.open ? t('openNow') : t('closedNow')}
                      </span>
                      {openStatus.open
                        ? (!openStatus.unknown && openStatus.todayText && (
                            <span style={{ fontSize:'12px', color:'#9CA3AF', direction:'ltr' }}>🕐 {openStatus.todayText}</span>
                          ))
                        : (openStatus.nextText && (
                            <span style={{ fontSize:'12px', color:'#EF4444' }}>{openStatus.nextText}</span>
                          ))}
                    </>
                  )
                })()}
                {estimatedPrepTime() != null && (
                  <span style={{ fontSize:'12px', color:'#9CA3AF' }}>⏱️ {estimatedPrepTime()} {t('minShort')}</span>
                )}
              </div>
            </div>
            {activeOrders.length > 0 && (
              <button
                onClick={() => setOrderPlaced(true)}
                style={{ flexShrink:0, padding:'9px 14px', borderRadius:'12px', border:'none', background:brandColor, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', boxShadow:`0 4px 12px ${brandColor}44` }}
              >
                📋 {t('myOrders')}
                {liveOrdersCount > 0 && (
                  <span style={{ background:'rgba(255,255,255,0.3)', borderRadius:'100px', padding:'1px 7px', fontSize:'11px' }}>{liveOrdersCount}</span>
                )}
              </button>
            )}
          </div>

          {tx(restaurant,'description') && (
            <p style={{ fontSize:'13px', color:descColor, lineHeight:'1.6', marginBottom:'10px' }}>{tx(restaurant,'description')}</p>
          )}

          {/* موقع المحل — يعرض موقع الفرع لو محدد، وإلا موقع المطعم */}
          {(() => {
            const addr = branch?.address || restaurant.address
            const mapsUrl = branch?.maps_url
            if (!addr && !mapsUrl) return null
            return (
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px', flexWrap:'wrap' }}>
                {addr && (
                  <span style={{ fontSize:'12px', color:'#6B7280', display:'inline-flex', alignItems:'center', gap:'4px' }}>
                    📍 {addr}
                  </span>
                )}
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize:'12px', fontWeight:'700', color:brandColor, background:`${brandColor}14`, padding:'5px 11px', borderRadius:'100px', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:'5px' }}
                  >
                    {t('mapLocation')}
                  </a>
                )}
              </div>
            )
          })()}

          {/* Social links */}
          {restaurant.social_links && Object.values(restaurant.social_links).some(v => v) && (
            <div style={{ display:'flex', gap:'8px' }}>
              {['instagram', 'whatsapp_social', 'snapchat', 'twitter', 'tiktok']
                .filter(key => restaurant.social_links[key])
                .map(key => {
                  const Icon = SOCIAL_ICONS[key]
                  return (
                    <a
                      key={key}
                      href={restaurant.social_links[key]}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ width:'34px', height:'34px', borderRadius:'50%', background:'white', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', boxShadow:'0 2px 6px rgba(0,0,0,0.06)', overflow:'hidden' }}
                    >
                      <Icon/>
                    </a>
                  )
                })}
            </div>
          )}

          {/* Allergens button */}
          {Array.isArray(restaurant.allergens) && restaurant.allergens.length > 0 && (
            <button
              onClick={() => setShowAllergensModal(true)}
              style={{ marginTop:'10px', display:'flex', alignItems:'center', gap:'6px', padding:'7px 12px', borderRadius:'10px', border:'1.5px solid #FDE68A', background:'#FFFBEB', color:'#92400E', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}
            >
              ⚠️ {t('allergens')}
            </button>
          )}
        </div>

        {/* Search */}
        <div style={{ padding:'0 16px 14px' }}>
          <div style={{ background:'white', borderRadius:'12px', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', overflow:'hidden' }}>
            <span style={{ padding:'10px 12px', fontSize:'16px', color:'#9CA3AF' }}>🔍</span>
            <input
              type="text"
              placeholder={t('search')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ flex:1, padding:'10px 4px', border:'none', outline:'none', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'transparent', textAlign:'right' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ padding:'10px 12px', background:'none', border:'none', fontSize:'16px', cursor:'pointer', color:'#9CA3AF' }}>✕</button>
            )}
          </div>
        </div>
      </div>

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
              <div className="sm-products" style={['grid','circles'].includes(restaurant.menu_layout)
                ? { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', padding:'0 16px' }
                : { display:'flex', flexDirection:'column', gap:'1px', background:'#E5E7EB', borderRadius:'16px', overflow:'hidden' }
              }>
                {allFiltered.map(prod => <ProductItem key={prod.id} product={prod} cart={cart} onAdd={() => { setSelectedProduct(prod); setModalQty(1); setModalNote(''); setModalOptions({}) }} onQtyChange={(delta) => delta > 0 ? addToCart(prod, 1) : removeFromCart(`${prod.id}____`)} brandColor={brandColor} priceColor={priceColor} descColor={descColor} isEn={isEn} layout={restaurant.menu_layout} />)}
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
            <div className="sm-products" style={['grid','circles'].includes(restaurant.menu_layout)
              ? { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', padding:'0 16px' }
              : { display:'flex', flexDirection:'column', gap:'1px', background:'#F3F4F6' }
            }>
              {bestSellers.map(prod => (
                <ProductItem key={prod.id} product={prod} cart={cart} onAdd={() => { setSelectedProduct(prod); setModalQty(1); setModalNote(''); setModalOptions({}) }} onQtyChange={(delta) => delta > 0 ? addToCart(prod, 1) : removeFromCart(`${prod.id}____`)} brandColor={brandColor} priceColor={priceColor} descColor={descColor} isEn={isEn} layout={restaurant.menu_layout} />
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
              <div className="sm-products" style={['grid','circles'].includes(restaurant.menu_layout)
                ? { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', padding:'0 16px' }
                : { display:'flex', flexDirection:'column', gap:'1px', background:'#F3F4F6' }
              }>
                {catProducts.map(prod => (
                  <ProductItem
                    key={prod.id}
                    product={prod}
                    cart={cart}
                    onAdd={() => { setSelectedProduct(prod); setModalQty(1); setModalNote(''); setModalOptions({}) }}
                    onQtyChange={(delta) => delta > 0 ? addToCart(prod, 1) : removeFromCart(`${prod.id}____`)}
                    brandColor={brandColor}
                    priceColor={priceColor}
                    descColor={descColor}
                    isEn={isEn}
                    layout={restaurant.menu_layout}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

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
          onClick={openWhatsAppContact}
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
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={() => setCartOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', animation:'fadeIn 0.2s ease' }}/>
          <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', maxHeight:'88vh', display:'flex', flexDirection:'column', animation:'slideUp 0.3s ease', position:'relative', overflow:'hidden' }}>
            <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'12px auto' }}/>

            <div style={{ padding:'0 20px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
              <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px' }}>🛒 {t('cartYours')} ({cartCount})</h3>
              <button onClick={() => setCartOpen(false)} style={{ width:'32px', height:'32px', borderRadius:'50%', border:'1.5px solid #E5E7EB', background:'white', fontSize:'18px', cursor:'pointer', color:'#6B7280' }}>✕</button>
            </div>

            {/* Cart items */}
            <div style={{ flex:1, overflowY:'auto', padding:'12px 20px' }}>
              {cart.map((item) => (
                <div key={item.cartKey} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 0', borderBottom:'1px solid #F3F4F6' }}>
                  <div style={{ width:'48px', height:'48px', borderRadius:'12px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'24px', flexShrink:0, overflow:'hidden' }}>
                    {item.image_url
                      ? <img src={item.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      : item.emoji}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:'700', fontSize:'14px', marginBottom:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{itemName(item)}</div>
                    {Array.isArray(item.selectedOptions) && item.selectedOptions.length > 0 && (
                      <div style={{ fontSize:'11px', color:'#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item.selectedOptions.map(o => o.choiceName).join(isEn ? ', ' : '، ')}
                      </div>
                    )}
                    {item.note && <div style={{ fontSize:'11px', color:'#9CA3AF' }}>📝 {item.note}</div>}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:'0', border:'1.5px solid #E5E7EB', borderRadius:'10px', overflow:'hidden', flexShrink:0 }}>
                    <button onClick={() => removeFromCart(item.cartKey)} style={{ width:'30px', height:'30px', background:'none', border:'none', fontSize:'18px', cursor:'pointer', color:brandColor, fontWeight:'300' }}>−</button>
                    <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'13px', minWidth:'24px', textAlign:'center', borderRight:'1px solid #E5E7EB', borderLeft:'1px solid #E5E7EB', lineHeight:'30px' }}>{item.qty}</span>
                    <button onClick={() => incrementCartItem(item.cartKey)} style={{ width:'30px', height:'30px', background:'none', border:'none', fontSize:'18px', cursor:'pointer', color:brandColor, fontWeight:'300' }}>+</button>
                  </div>
                  <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', flexShrink:0, minWidth:'50px', textAlign:'left' }}>{(item.price * item.qty).toFixed(2)} ﷼</div>
                </div>
              ))}
            </div>

            {/* Summary — الأسعار شاملة ض.ق.م 15% */}
            <div style={{ padding:'12px 20px', background:'#F8F9FB', borderTop:'1px solid #E5E7EB', flexShrink:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#9CA3AF', marginBottom:'4px' }}>
                <span>{t('totalVat')}</span><span>{cartTotal.toFixed(2)} ﷼</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#9CA3AF', marginBottom: orderType === 'delivery' && restaurant?.delivery_fee > 0 ? '4px' : '8px' }}>
                <span>{t('vatLine')}</span><span>{(cartTotal - cartTotal / 1.15).toFixed(2)} ﷼</span>
              </div>
              {orderType === 'delivery' && Number(restaurant?.delivery_fee) > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#9CA3AF', marginBottom:'8px' }}>
                  <span>{t('deliveryFee')}</span><span>{Number(restaurant.delivery_fee).toFixed(2)} ﷼</span>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', paddingTop:'8px', borderTop:'1px solid #E5E7EB', marginBottom:'12px' }}>
                <span>{t('total')}</span>
                <span style={{ color:brandColor }}>{(cartTotal + (orderType === 'delivery' ? (Number(restaurant.delivery_fee) || 0) : 0)).toFixed(2)} ﷼</span>
              </div>

              {/* Order type */}
              <div style={{ marginBottom:'14px' }}>
                <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>{t('orderTypeR')} *</label>
                <div style={{ display:'grid', gridTemplateColumns: restaurant?.delivery_enabled ? 'repeat(3,1fr)' : 'repeat(2,1fr)', gap:'8px' }}>
                  {[
                    { key:'dine_in', icon:'🪑', label:t('dineIn') },
                    { key:'takeaway', icon:'🥡', label:t('takeaway2') },
                    ...(restaurant?.delivery_enabled ? [{ key:'delivery', icon:'🛵', label:t('deliveryT') }] : []),
                  ].map(opt => (
                    <div
                      key={opt.key}
                      onClick={() => setOrderType(opt.key)}
                      style={{
                        padding:'12px 8px', borderRadius:'11px', cursor:'pointer', textAlign:'center',
                        border:`1.5px solid ${orderType===opt.key ? brandColor : '#E5E7EB'}`,
                        background: orderType===opt.key ? `${brandColor}0D` : 'white',
                        transition:'all 0.15s',
                      }}
                    >
                      <div style={{ fontSize:'20px', marginBottom:'4px' }}>{opt.icon}</div>
                      <div style={{ fontSize:'12px', fontWeight:'700', color: orderType===opt.key ? brandColor : '#374151' }}>{opt.label}</div>
                    </div>
                  ))}
                </div>
                {orderType === 'delivery' && restaurant?.delivery_fee > 0 && (
                  <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'6px' }}>+ {Number(restaurant.delivery_fee).toFixed(2)} ﷼ {t('feeSuffix')}</div>
                )}
              </div>

              {/* Customer info */}
              <div style={{ marginBottom:'12px' }}>
                <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>{t('nameOpt')}</label>
                <input
                  type="text"
                  placeholder={t('namePh2')}
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'white', outline:'none', textAlign:'right', marginBottom:'10px' }}
                />
                <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>{t('phoneReq')} *</label>
                <input
                  type="tel"
                  placeholder={t('phonePh')}
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'white', outline:'none', textAlign:'right', direction:'ltr' }}
                />
              </div>

              {/* Table number — محلي فقط */}
              {orderType === 'dine_in' && (
                <div style={{ marginBottom:'12px' }}>
                  <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>{t('tableReq')} *</label>
                  <input
                    type="text"
                    placeholder={t('tablePh')}
                    value={tableNumber}
                    onChange={e => setTableNumber(e.target.value)}
                    style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'white', outline:'none', textAlign:'right' }}
                  />
                </div>
              )}

              {/* Delivery address — توصيل فقط */}
              {orderType === 'delivery' && (
                <div style={{ marginBottom:'12px' }}>
                  <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>{t('addrReq')} *</label>
                  <textarea
                    placeholder={t('addrPh2')}
                    value={deliveryAddress}
                    onChange={e => setDeliveryAddress(e.target.value)}
                    style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'white', outline:'none', textAlign:'right', minHeight:'72px', resize:'vertical' }}
                  />
                </div>
              )}

              {!openStatus.open && (
                <div style={{ display:'flex', alignItems:'flex-start', gap:'8px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'12px', padding:'12px 14px', marginBottom:'12px' }}>
                  <span style={{ fontSize:'18px', flexShrink:0 }}>🔴</span>
                  <div>
                    <div style={{ fontSize:'13px', fontWeight:'800', color:'#B91C1C', marginBottom:'2px' }}>{t('closedTitle')}</div>
                    {openStatus.nextText && (
                      <div style={{ fontSize:'12px', color:'#B91C1C', opacity:0.85 }}>{openStatus.nextText}</div>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={placeOrder}
                disabled={!openStatus.open}
                style={{ width:'100%', padding:'15px', borderRadius:'14px', border:'none', background: openStatus.open ? `linear-gradient(135deg, ${brandColor}, ${brandColor}CC)` : '#E5E7EB', color: openStatus.open ? 'white' : '#9CA3AF', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'16px', cursor: openStatus.open ? 'pointer' : 'not-allowed', boxShadow: openStatus.open ? `0 8px 24px ${brandColor}44` : 'none' }}
              >
                {openStatus.open ? t('confirmOrder') : t('closedBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product modal */}
      {selectedProduct && (
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={() => setSelectedProduct(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', animation: dragOffset > 0 ? 'none' : 'fadeIn 0.2s ease', opacity: dragOffset > 0 ? Math.max(1 - dragOffset / 300, 0.3) : 1 }}/>
          <div style={{
            background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px',
            animation: dragOffset > 0 ? 'none' : 'slideUp 0.3s ease',
            transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : 'none',
            transition: dragOffset > 0 ? 'none' : 'transform 0.2s ease',
            position:'relative', overflow:'hidden', maxHeight:'90vh', display:'flex', flexDirection:'column',
          }}>
            <div
              onTouchStart={handleModalTouchStart}
              onTouchMove={handleModalTouchMove}
              onTouchEnd={handleModalTouchEnd}
              style={{ flexShrink:0 }}
            >
              <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'12px auto' }}/>

              <div style={{ height:'300px', background: selectedProduct.image_url ? '#F8F9FB' : `linear-gradient(135deg, ${brandColor}22, ${brandColor}08)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'100px', overflow:'hidden' }}>
                {selectedProduct.image_url
                  ? <img src={selectedProduct.image_url} alt={selectedProduct.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  : selectedProduct.emoji}
              </div>
            </div>

            <div style={{ overflowY:'auto' }}>
            <div style={{ padding:'20px 20px 32px' }}>
              <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'22px', marginBottom:'6px' }}>{(isEn && selectedProduct.name_en) ? selectedProduct.name_en : selectedProduct.name}</h2>
              {((isEn && selectedProduct.description_en) ? selectedProduct.description_en : selectedProduct.description) && <p style={{ fontSize:'14px', color:'#6B7280', lineHeight:'1.65', marginBottom:'16px' }}>{(isEn && selectedProduct.description_en) ? selectedProduct.description_en : selectedProduct.description}</p>}

              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'24px', color:priceColor }}>{selectedProduct.price} ﷼</span>
                {selectedProduct.compare_price && <span style={{ fontSize:'15px', color:'#9CA3AF', textDecoration:'line-through' }}>{selectedProduct.compare_price} ﷼</span>}
                {selectedProduct.calories && <span style={{ fontSize:'12px', color:'#9CA3AF', background:'#F3F4F6', padding:'3px 10px', borderRadius:'100px', marginRight:'auto' }}>{getCalorieBadge(selectedProduct.calories)} {selectedProduct.calories} {t('calories')}</span>}
              </div>

              {/* Option groups: size, extras, etc. */}
              {Array.isArray(selectedProduct.options) && selectedProduct.options.length > 0 && (
                <div style={{ marginBottom:'20px', display:'flex', flexDirection:'column', gap:'16px' }}>
                  {selectedProduct.options.map((group, gi) => (
                    <div key={gi}>
                      <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
                        <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px' }}>{group.name}</span>
                        {group.required && <span style={{ fontSize:'10px', fontWeight:'700', color:'#EF4444', background:'#FEF2F2', padding:'2px 7px', borderRadius:'100px' }}>{t('required')}</span>}
                        {!group.required && group.type === 'multiple' && <span style={{ fontSize:'10px', fontWeight:'700', color:'#9CA3AF', background:'#F3F4F6', padding:'2px 7px', borderRadius:'100px' }}>{t('optional')}</span>}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                        {group.choices.map((choice, ci) => {
                          const isSelected = group.type === 'multiple'
                            ? (Array.isArray(modalOptions[gi]) && modalOptions[gi].includes(ci))
                            : modalOptions[gi] === ci
                          return (
                            <div
                              key={ci}
                              onClick={() => group.type === 'multiple' ? toggleMultipleOption(gi, ci) : toggleSingleOption(gi, ci)}
                              style={{
                                display:'flex', alignItems:'center', justifyContent:'space-between',
                                padding:'11px 14px', borderRadius:'11px', cursor:'pointer',
                                border:`1.5px solid ${isSelected ? brandColor : '#E5E7EB'}`,
                                background: isSelected ? `${brandColor}0D` : 'white',
                                transition:'all 0.15s',
                              }}
                            >
                              <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                                <div style={{
                                  width:'18px', height:'18px', flexShrink:0,
                                  borderRadius: group.type === 'multiple' ? '5px' : '50%',
                                  border:`2px solid ${isSelected ? brandColor : '#D1D5DB'}`,
                                  background: isSelected ? brandColor : 'white',
                                  display:'flex', alignItems:'center', justifyContent:'center',
                                  fontSize:'11px', color:'white',
                                }}>
                                  {isSelected && '✓'}
                                </div>
                                <span style={{ fontSize:'14px', fontWeight:'600' }}>{choice.name}</span>
                              </div>
                              {choice.price > 0 && <span style={{ fontSize:'13px', fontWeight:'700', color:brandColor }}>+{choice.price} ﷼</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quantity */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
                <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px' }}>{t('qty')}</span>
                <div style={{ display:'flex', alignItems:'center', gap:'0', border:'1.5px solid #E5E7EB', borderRadius:'12px', overflow:'hidden' }}>
                  <button onClick={() => setModalQty(q => Math.max(1, q - 1))} style={{ width:'40px', height:'40px', background:'none', border:'none', fontSize:'22px', cursor:'pointer', color:brandColor, fontWeight:'300' }}>−</button>
                  <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', minWidth:'40px', textAlign:'center', borderRight:'1px solid #E5E7EB', borderLeft:'1px solid #E5E7EB', lineHeight:'40px' }}>{modalQty}</span>
                  <button onClick={() => setModalQty(q => q + 1)} style={{ width:'40px', height:'40px', background:'none', border:'none', fontSize:'22px', cursor:'pointer', color:brandColor, fontWeight:'300' }}>+</button>
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom:'20px' }}>
                <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>{t('noteRest')}</label>
                <textarea
                  placeholder={t('notePh2')}
                  value={modalNote}
                  onChange={e => setModalNote(e.target.value)}
                  rows={2}
                  style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'#F8F9FB', outline:'none', textAlign:'right', direction:'rtl', resize:'none' }}
                />
              </div>

              <button
                onClick={() => {
                  const missingGroup = validateModalOptions(selectedProduct)
                  if (missingGroup) { toast.error(`${t('tPleaseChoose')}: ${missingGroup}`); return }
                  const resolved = resolveModalOptions(selectedProduct)
                  addToCart(selectedProduct, modalQty, modalNote, resolved)
                  setSelectedProduct(null)
                }}
                style={{ width:'100%', padding:'16px', borderRadius:'14px', border:'none', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'16px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:`0 8px 24px ${brandColor}44` }}
              >
                <span>{t('addToCartB')}</span>
                <span style={{ background:'rgba(0,0,0,0.15)', padding:'4px 12px', borderRadius:'8px', fontSize:'14px' }}>
                  {((selectedProduct.price + resolveModalOptions(selectedProduct).reduce((s,o)=>s+(o.price||0),0)) * modalQty).toFixed(2)} ﷼
                </span>
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Allergens Modal */}
      {showAllergensModal && (
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={() => setShowAllergensModal(false)}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)' }}/>
          <div onClick={e => e.stopPropagation()} style={{ position:'relative', background:'white', width:'100%', maxWidth:'480px', borderRadius:'24px 24px 0 0', padding:'20px', maxHeight:'75vh', overflowY:'auto', animation:'slideUp 0.25s ease' }}>
            <ErrBoundary>
            <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'0 auto 16px' }}/>
            <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'17px', marginBottom:'6px', textAlign:'center' }}>⚠️ {t('allergens')}</h3>
            <p style={{ fontSize:'12px', color:'#9CA3AF', textAlign:'center', marginBottom:'18px', lineHeight:'1.6' }}>
              {t('allergensDesc')}
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {(Array.isArray(restaurant.allergens) ? restaurant.allergens : [])
                .map((a, i) => {
                  // تحصين: تجاهل القيم الفارغة، ودعم النص أو الكائن
                  if (a == null) return null
                  const item = typeof a === 'string' ? { label: a, icon: '⚠️' } : (a || {})
                  const label = item.label || item.name || (typeof a === 'string' ? a : '')
                  if (!label) return null
                  const shown = (isEn && item.label_en) ? item.label_en : label
                  return (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', background:'#F8F9FB', borderRadius:'12px' }}>
                      <span style={{ fontSize:'18px' }}>{item.icon || '⚠️'}</span>
                      <span style={{ fontSize:'13px', fontWeight:'600' }}>{shown}</span>
                    </div>
                  )
                })}
            </div>
            <button
              onClick={() => setShowAllergensModal(false)}
              style={{ width:'100%', marginTop:'18px', padding:'13px', borderRadius:'12px', border:'none', background:'#F3F4F6', color:'#374151', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer' }}
            >
              {t('close')}
            </button>
            </ErrBoundary>
          </div>
        </div>
      )}
    </div>
  )
}

// Product item component
function ProductItem({ product, cart, onAdd, onQtyChange, brandColor, priceColor, descColor, isEn, layout = 'list' }) {
  const _priceColor = priceColor || brandColor
  const _descColor = descColor || '#9CA3AF'
  const pName = (isEn && product.name_en) ? product.name_en : product.name
  const pDesc = (isEn && product.description_en) ? product.description_en : product.description
  const hasOptions = Array.isArray(product.options) && product.options.length > 0
  // لو الصنف بدون خيارات: نجمع كل عناصر السلة بنفس id (مفتاح بدون خيارات دائماً ثابت)
  const qty = hasOptions ? 0 : cart.filter(i => i.id === product.id).reduce((s,i) => s + i.qty, 0)

  const qtyControl = qty === 0 ? (
    <button
      onClick={onAdd}
      style={{ position:'absolute', bottom:'6px', left:'6px', width:'30px', height:'30px', borderRadius:'50%', border:'none', background: brandColor, color:'white', fontSize:'20px', fontWeight:'300', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 12px ${brandColor}55`, lineHeight:'1' }}
    >
      +
    </button>
  ) : (
    <div style={{ position:'absolute', bottom:'5px', left:'4px', display:'flex', alignItems:'center', background:'#0F1117', borderRadius:'100px', overflow:'hidden', boxShadow:'0 4px 12px rgba(0,0,0,0.3)' }}>
      <button onClick={() => onQtyChange(-1)} style={{ width:'26px', height:'26px', background:'none', border:'none', color:'white', fontSize:'17px', cursor:'pointer', fontWeight:'300', display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
      <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'13px', color:'white', minWidth:'20px', textAlign:'center' }}>{qty}</span>
      <button onClick={onAdd} style={{ width:'26px', height:'26px', background:'none', border:'none', color:'white', fontSize:'17px', cursor:'pointer', fontWeight:'300', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
    </div>
  )

  if (layout === 'circles') {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', padding:'6px 4px' }}>
        <div style={{ position:'relative', marginBottom:'10px' }}>
          <div onClick={onAdd} style={{
            width:'104px', height:'104px', borderRadius:'50%', background:'#F8F9FB',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:'44px',
            overflow:'hidden', boxShadow:'0 6px 18px rgba(0,0,0,0.10)', border:'3px solid white', cursor:'pointer',
          }}>
            {product.image_url
              ? <img src={product.image_url} alt={product.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : product.emoji}
          </div>
          {product.is_featured && (
            <span style={{ position:'absolute', top:'-2px', right:'-2px', fontSize:'9px', fontWeight:'800', color:'#92400E', background:'#FEF3C7', padding:'2px 6px', borderRadius:'100px', boxShadow:'0 2px 6px rgba(0,0,0,0.1)' }}>⭐</span>
          )}
          <div style={{ position:'absolute', bottom:'-2px', left:'50%', transform:'translateX(50%)' }}>
            {qtyControl}
          </div>
        </div>
        <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', color:'#0F1117', marginBottom:'4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%' }}>{pName}</div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'13px', color: _priceColor }}>{product.price} ﷼</span>
          {product.compare_price && <span style={{ fontSize:'10px', color:'#9CA3AF', textDecoration:'line-through' }}>{product.compare_price} ﷼</span>}
        </div>
      </div>
    )
  }

  if (layout === 'grid') {
    return (
      <div style={{ background:'white', borderRadius:'14px', overflow:'hidden', border:'1px solid #F0F0F0' }}>
        <div style={{ position:'relative' }}>
          <div onClick={onAdd} style={{ width:'100%', aspectRatio:'1/1', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'46px', overflow:'hidden', cursor:'pointer' }}>
            {product.image_url
              ? <img src={product.image_url} alt={product.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : product.emoji}
          </div>
          {product.is_featured && (
            <span style={{ position:'absolute', top:'8px', right:'8px', fontSize:'10px', fontWeight:'800', color:'#92400E', background:'#FEF3C7', padding:'2px 7px', borderRadius:'100px' }}>{isEn ? '⭐ Featured' : '⭐ مميز'}</span>
          )}
          {qtyControl}
        </div>
        <div onClick={onAdd} style={{ padding:'10px 12px', cursor:'pointer' }}>
          <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', color:'#0F1117', marginBottom:'4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pName}</div>
          <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'13px', color: _priceColor }}>{product.price} ﷼</span>
            {product.compare_price && <span style={{ fontSize:'10px', color:'#9CA3AF', textDecoration:'line-through' }}>{product.compare_price} ﷼</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background:'white', padding:'14px 16px', display:'flex', gap:'12px', alignItems:'center' }}>
      <div onClick={onAdd} style={{ flex:1, minWidth:0, cursor:'pointer' }}>
        {product.is_featured && (
          <span style={{ fontSize:'10px', fontWeight:'800', color:'#92400E', background:'#FEF3C7', padding:'2px 7px', borderRadius:'100px', marginBottom:'4px', display:'inline-block' }}>{isEn ? '⭐ Featured' : '⭐ مميز'}</span>
        )}
        <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', color:'#0F1117', marginBottom:'4px' }}>{pName}</div>
        {pDesc && (
          <div style={{ fontSize:'12px', color:'#9CA3AF', lineHeight:'1.5', marginBottom:'8px', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
            {pDesc}
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px', color: _priceColor }}>{product.price} ﷼</span>
          {product.compare_price && <span style={{ fontSize:'12px', color:'#9CA3AF', textDecoration:'line-through' }}>{product.compare_price} ﷼</span>}
          {product.calories && <span style={{ fontSize:'11px', color:'#9CA3AF' }}>{getCalorieBadge(product.calories)} {product.calories}</span>}
        </div>
      </div>

      <div style={{ position:'relative', flexShrink:0 }}>
        <div onClick={onAdd} style={{ width:'88px', height:'88px', borderRadius:'14px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'42px', border:'1px solid #E5E7EB', overflow:'hidden', cursor:'pointer' }}>
          {product.image_url
            ? <img src={product.image_url} alt={product.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : product.emoji}
        </div>
        {qtyControl}
      </div>
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
