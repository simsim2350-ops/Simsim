// مصدر الحقيقة الوحيد لروابط التنقل في السايدبار.
// تعديل التنقل يتم من هنا فقط — ينعكس على كل الصفحات تلقائياً.
//
// التنقل مُجمَّع في مجموعات منطقية (label = عنوان المجموعة، null = بلا عنوان يظهر أعلى القائمة).
// الفائدة: بنية Modular قابلة للتوسع — أي ميزة جديدة تدخل مجموعتها بلا إطالة القائمة المسطّحة.
export const NAV_GROUPS = [
  { label: null, items: [
    { key: 'dashboard', icon: '📊', label: 'الرئيسية', path: '/dashboard' },
    { key: 'orders',    icon: '🛒', label: 'الطلبات',   path: '/orders' },
  ] },
  { label: 'المنيو', items: [
    // رابط واحد للمنيو — الأقسام والأصناف واقتراحات السلة تبويبات داخل الصفحة نفسها
    { key: 'menu', icon: '📋', label: 'المنيو', path: '/menu' },
  ] },
  { label: 'العملاء', items: [
    { key: 'customers',  icon: '👥', label: 'العملاء',           path: '/customers' },
    { key: 'loyalty',    icon: '🎁', label: 'الولاء والتقييمات', path: '/loyalty' },
    { key: 'marketing',  icon: '📣', label: 'العروض والكوبونات', path: '/marketing' },
  ] },
  { label: 'الإعداد', items: [
    { key: 'branches', icon: '🏢', label: 'الفروع',    path: '/branches' },
    { key: 'tables',   icon: '🪑', label: 'الطاولات',  path: '/tables' },
    { key: 'qr',       icon: '📱', label: 'QR Code',   path: '/qr' },
    { key: 'staff',    icon: '🧑‍🍳', label: 'الموظفون', path: '/staff' },
  ] },
  { label: 'تحليل وضبط', items: [
    { key: 'analytics', icon: '📈', label: 'التحليلات',        path: '/analytics' },
    { key: 'billing',   icon: '💳', label: 'الاشتراك والفوترة', path: '/billing' },
    { key: 'settings',  icon: '⚙️', label: 'الإعدادات',        path: '/settings' },
  ] },
]

// قائمة مسطّحة مشتقّة — للتوافق مع أي مستهلك يحتاج كل العناصر دفعة واحدة
export const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items)

export default NAV_ITEMS
