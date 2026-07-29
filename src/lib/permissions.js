// ============================================================
// مصدر الحقيقة الوحيد لمنطق صلاحيات الموظفين.
// يُستخدم في AppShell (فلترة التنقل) و App (حماية المسارات).
// ============================================================

// صفحات حصرية لصاحب المطعم فقط — لا تُمنح لأي موظف إطلاقاً
export const OWNER_ONLY = ['dashboard', 'settings', 'staff', 'marketing', 'billing']

// أدوار الموظفين (M7 — owner ضمني عبر restaurants.owner_id، ليس دوراً هنا).
export const MEMBER_ROLES = ['manager', 'cashier', 'staff']
export const ROLE_LABELS = { manager: 'مدير', cashier: 'كاشير', staff: 'موظف' }
// قوالب افتراضية لكل دور (صفحات غير OWNER_ONLY فقط). تُطبَّق عند اختيار الدور
// وتبقى قابلة للتعديل يدوياً (هجين). الدور UI-soft — لا يُفرَض في RLS.
export const ROLE_PRESETS = {
  manager: ['orders', 'menu', 'customers', 'analytics', 'loyalty', 'branches', 'tables', 'qr'],
  cashier: ['orders'],
  staff: [],
}

// صفحات مشتركة على مستوى المطعم كله (منيو/فروع/ولاء+تقييمات/QR).
// تتطلب صلاحية "كل الفروع" — يُمنع منها الموظف المقيّد بفرع محدّد.
export const SHARED_PAGES = ['menu', 'branches', 'tables', 'loyalty', 'qr']

// ترتيب الصفحات القابلة للتخصيص (لتحديد أول صفحة يُوجَّه إليها الموظف)
export const PAGE_ORDER = ['orders', 'menu', 'branches', 'tables', 'customers', 'analytics', 'loyalty', 'qr']

// مسار كل صفحة
export const PAGE_PATH = {
  orders: '/orders', menu: '/menu', branches: '/branches', tables: '/tables',
  customers: '/customers', analytics: '/analytics', loyalty: '/loyalty', qr: '/qr',
}

// مفتاح عنصر التنقل → مفتاح الصلاحية (products و menu نفس الصفحة)
export function navPage(key) {
  return key === 'products' ? 'menu' : key
}

// هل يملك المستخدم صلاحية صفحة معيّنة؟
// perms = { isOwner, allowedPages, branchScope, role, capabilities }
//   role         : دور الموظف (manager/cashier/staff) — M7
//   capabilities : خريطة القدرات الفعّالة (effective_features) لفحص required_permissions
export function canAccess(pageKey, perms) {
  const { isOwner, allowedPages, branchScope, role, capabilities } = perms || {}
  if (isOwner) return true
  if (OWNER_ONLY.includes(pageKey)) return false
  const pages = Array.isArray(allowedPages) ? allowedPages : []
  const hasPage = pages.includes('all') || pages.includes(pageKey)
  if (!hasPage) return false
  // الصفحات المشتركة تتطلب صلاحية "كل الفروع" (يُمنع منها موظف الفرع المحدّد)
  if (SHARED_PAGES.includes(pageKey) && branchScope && branchScope !== 'all') return false
  // فحص دور القدرة (feature_permissions — M7): إن حدّدت القدرة أدواراً مطلوبة،
  // يجب أن يكون دور الموظف ضمنها. fail-open: بلا قيود (فارغة/غير معرّفة) = مسموح.
  const req = capabilities?.[pageKey]?.required_permissions
  if (Array.isArray(req) && req.length > 0 && !req.includes(role)) return false
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
