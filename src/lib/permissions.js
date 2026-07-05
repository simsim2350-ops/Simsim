// ============================================================
// مصدر الحقيقة الوحيد لمنطق صلاحيات الموظفين.
// يُستخدم في AppShell (فلترة التنقل) و App (حماية المسارات).
// ============================================================

// صفحات حصرية لصاحب المطعم فقط — لا تُمنح لأي موظف إطلاقاً
export const OWNER_ONLY = ['dashboard', 'settings', 'staff']

// صفحات مشتركة على مستوى المطعم كله (منيو/فروع/ولاء+تقييمات/QR).
// تتطلب صلاحية "كل الفروع" — يُمنع منها الموظف المقيّد بفرع محدّد.
export const SHARED_PAGES = ['menu', 'branches', 'loyalty', 'qr']

// ترتيب الصفحات القابلة للتخصيص (لتحديد أول صفحة يُوجَّه إليها الموظف)
export const PAGE_ORDER = ['orders', 'menu', 'branches', 'customers', 'analytics', 'loyalty', 'qr']

// مسار كل صفحة
export const PAGE_PATH = {
  orders: '/orders', menu: '/menu', branches: '/branches',
  customers: '/customers', analytics: '/analytics', loyalty: '/loyalty', qr: '/qr',
}

// مفتاح عنصر التنقل → مفتاح الصلاحية (products و menu نفس الصفحة)
export function navPage(key) {
  return key === 'products' ? 'menu' : key
}

// هل يملك المستخدم صلاحية صفحة معيّنة؟
// perms = { isOwner, allowedPages, branchScope }
export function canAccess(pageKey, perms) {
  const { isOwner, allowedPages, branchScope } = perms || {}
  if (isOwner) return true
  if (OWNER_ONLY.includes(pageKey)) return false
  const pages = Array.isArray(allowedPages) ? allowedPages : []
  const hasPage = pages.includes('all') || pages.includes(pageKey)
  if (!hasPage) return false
  // الصفحات المشتركة تتطلب صلاحية "كل الفروع" (يُمنع منها موظف الفرع المحدّد)
  if (SHARED_PAGES.includes(pageKey) && branchScope && branchScope !== 'all') return false
  return true
}

// أول مسار مسموح للمستخدم (لتوجيهه بعد الدخول أو عند منعه من صفحة)
export function firstAllowedPath(perms) {
  const { isOwner } = perms || {}
  if (isOwner) return '/dashboard'
  for (const p of PAGE_ORDER) {
    if (canAccess(p, perms)) return PAGE_PATH[p]
  }
  return null // لا صفحات مسموحة
}
