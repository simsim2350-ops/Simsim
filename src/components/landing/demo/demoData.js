// =====================================================================
// بيانات الديمو التفاعلي — مطعم تجريبي مكتفٍ ذاتياً (بلا شبكة/Supabase).
// ثنائي اللغة (ar/en) لدعم تبديل اللغة داخل الديمو.
// صور المنتجات: emoji فوق تدرّج لوني — خفيفة جداً (صفر تحميل شبكة) وعلى هوية سمسم.
// =====================================================================

export const DEMO_RESTAURANT = {
  name: { ar: 'مطعم الذوّاقة', en: 'Al-Thawwaqah' },
  tagline: { ar: 'برجر ومشاوٍ • تجربة سمسم', en: 'Burgers & Grills • SIMSIM demo' },
  rating: 4.9,
  reviews: 428,
  time: { ar: '20–30 دقيقة', en: '20–30 min' },
  cover: 'linear-gradient(135deg, #FF7A45, #E85A24)',
}

export const DEMO_CATEGORIES = [
  { id: 'popular', name: { ar: 'الأكثر طلباً', en: 'Popular' }, icon: '🔥' },
  { id: 'burgers', name: { ar: 'برجر', en: 'Burgers' }, icon: '🍔' },
  { id: 'sides',   name: { ar: 'جانبية', en: 'Sides' }, icon: '🍟' },
  { id: 'drinks',  name: { ar: 'مشروبات', en: 'Drinks' }, icon: '🥤' },
  { id: 'sweets',  name: { ar: 'حلويات', en: 'Sweets' }, icon: '🍰' },
]

// مجموعات الخيارات (اختياري لكل منتج): single = اختيار واحد، multi = متعدد.
export const DEMO_PRODUCTS = [
  {
    id: 'p1', cat: 'burgers', emoji: '🍔', grad: 'linear-gradient(135deg,#FFE3D3,#FFC7A8)',
    name: { ar: 'برجر سمسم الخاص', en: 'SIMSIM Special Burger' },
    desc: { ar: 'لحم أنغوس مشوي، جبن شيدر، صوص سمسم السري', en: 'Grilled Angus, cheddar, secret SIMSIM sauce' },
    price: 32, best: true, calories: 640,
    options: [
      { id: 'size', type: 'single', required: true,
        label: { ar: 'الحجم', en: 'Size' },
        items: [
          { id: 'single', name: { ar: 'كلاسيك', en: 'Classic' }, price: 0 },
          { id: 'double', name: { ar: 'دبل لحم', en: 'Double patty' }, price: 9 },
        ] },
      { id: 'extras', type: 'multi', required: false,
        label: { ar: 'إضافات', en: 'Add-ons' },
        items: [
          { id: 'cheese', name: { ar: 'جبن إضافي', en: 'Extra cheese' }, price: 4 },
          { id: 'bacon', name: { ar: 'لحم مقدد', en: 'Beef bacon' }, price: 6 },
          { id: 'jalapeno', name: { ar: 'هالبينو', en: 'Jalapeño' }, price: 3 },
        ] },
    ],
  },
  {
    id: 'p2', cat: 'burgers', emoji: '🍗', grad: 'linear-gradient(135deg,#FFEFD6,#FFD9A0)',
    name: { ar: 'برجر دجاج مقرمش', en: 'Crispy Chicken Burger' },
    desc: { ar: 'صدر دجاج مقرمش، خس، مايونيز الثوم', en: 'Crispy chicken breast, lettuce, garlic mayo' },
    price: 27, best: true, calories: 580,
    options: [
      { id: 'spice', type: 'single', required: true,
        label: { ar: 'مستوى الحرارة', en: 'Spice level' },
        items: [
          { id: 'mild', name: { ar: 'عادي', en: 'Mild' }, price: 0 },
          { id: 'hot', name: { ar: 'حار', en: 'Hot' }, price: 0 },
        ] },
    ],
  },
  {
    id: 'p3', cat: 'sides', emoji: '🍟', grad: 'linear-gradient(135deg,#FFF0CC,#FFE08A)',
    name: { ar: 'بطاطس مقرمشة', en: 'Crispy Fries' },
    desc: { ar: 'بطاطس ذهبية مع صوص الجبن', en: 'Golden fries with cheese dip' },
    price: 14, best: true, calories: 320,
  },
  {
    id: 'p4', cat: 'sides', emoji: '🧅', grad: 'linear-gradient(135deg,#FBE7C6,#F3CE8E)',
    name: { ar: 'حلقات البصل', en: 'Onion Rings' },
    desc: { ar: 'مقرمشة من الخارج طرية من الداخل', en: 'Crunchy outside, tender inside' },
    price: 16, best: false, calories: 290,
  },
  {
    id: 'p5', cat: 'drinks', emoji: '🥤', grad: 'linear-gradient(135deg,#D8F1E4,#AEE3CB)',
    name: { ar: 'ليمون بالنعناع', en: 'Mint Lemonade' },
    desc: { ar: 'طازج ومنعش', en: 'Fresh & refreshing' },
    price: 10, best: true, calories: 120,
  },
  {
    id: 'p6', cat: 'drinks', emoji: '🧊', grad: 'linear-gradient(135deg,#DCE7FB,#B9CCF5)',
    name: { ar: 'آيس تي خوخ', en: 'Peach Iced Tea' },
    desc: { ar: 'شاي مثلج بنكهة الخوخ', en: 'Peach-flavored iced tea' },
    price: 12, best: false, calories: 140,
  },
  {
    id: 'p7', cat: 'sweets', emoji: '🍰', grad: 'linear-gradient(135deg,#F7DCE8,#EDB6CE)',
    name: { ar: 'تشيز كيك التوت', en: 'Berry Cheesecake' },
    desc: { ar: 'قطعة كريمية تكفي شخصين', en: 'Creamy slice for two' },
    price: 18, best: true, calories: 410,
  },
  {
    id: 'p8', cat: 'sweets', emoji: '🍫', grad: 'linear-gradient(135deg,#EAD8C8,#CDB39A)',
    name: { ar: 'براوني بالشوكولاتة', en: 'Chocolate Brownie' },
    desc: { ar: 'ساخنة مع صوص الشوكولاتة', en: 'Warm with chocolate sauce' },
    price: 15, best: false, calories: 380,
  },
]

// نصوص واجهة الديمو (i18n خفيف).
export const DEMO_T = {
  ar: {
    search: 'ابحث في المنيو…', open: 'مفتوح الآن', add: 'أضف', addToCart: 'أضف للسلة',
    cart: 'السلة', empty: 'سلتك فارغة', emptyHint: 'أضف أصنافاً لتبدأ طلبك',
    total: 'الإجمالي', checkout: 'إتمام الطلب', required: 'مطلوب', optional: 'اختياري',
    cal: 'سعرة', points: 'نقطة ولاء', earnHint: 'ستكسب', best: 'الأكثر طلباً',
    orderDone: 'تم استلام طلبك!', orderDoneSub: 'هذه تجربة ديمو — بهذه السهولة يطلب عميلك.',
    startFree: 'أنشئ منيو مطعمك مجاناً', backToMenu: 'رجوع للمنيو', qty: 'الكمية',
    items: 'صنف', noResults: 'لا توجد نتائج', close: 'إغلاق', demo: 'ديمو',
  },
  en: {
    search: 'Search the menu…', open: 'Open now', add: 'Add', addToCart: 'Add to cart',
    cart: 'Cart', empty: 'Your cart is empty', emptyHint: 'Add items to start your order',
    total: 'Total', checkout: 'Checkout', required: 'Required', optional: 'Optional',
    cal: 'cal', points: 'loyalty pts', earnHint: "You'll earn", best: 'Popular',
    orderDone: 'Order received!', orderDoneSub: 'This is a demo — that easy for your customer.',
    startFree: 'Create your menu free', backToMenu: 'Back to menu', qty: 'Qty',
    items: 'items', noResults: 'No results', close: 'Close', demo: 'demo',
  },
}
