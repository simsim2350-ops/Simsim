// مصدر الحقيقة الوحيد لروابط التنقل في السايدبار.
// تعديل التنقل يتم من هنا فقط — ينعكس على كل الصفحات تلقائياً.
export const NAV_ITEMS = [
  { key: 'dashboard', icon: '📊', label: 'الرئيسية',           path: '/dashboard' },
  { key: 'orders',    icon: '🛒', label: 'الطلبات',            path: '/orders' },
  { key: 'menu',      icon: '📋', label: 'الأقسام',            path: '/menu' },
  { key: 'products',  icon: '🍽️', label: 'الأصناف',            path: '/menu', state: { tab: 'products' } },
  { key: 'customers', icon: '👥', label: 'العملاء',            path: '/customers' },
  { key: 'loyalty',   icon: '🎁', label: 'الولاء والتقييمات',  path: '/loyalty' },
  { key: 'branches',  icon: '🏢', label: 'الفروع',             path: '/branches' },
  { key: 'qr',        icon: '📱', label: 'QR Code',            path: '/qr' },
  { key: 'analytics', icon: '📈', label: 'التحليلات',          path: '/analytics' },
  { key: 'settings',  icon: '⚙️', label: 'الإعدادات',          path: '/settings' },
]

export default NAV_ITEMS
