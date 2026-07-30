// ============================================================================
// Platform Capability Registry (PCR) — Manifest (مصدر الحقيقة للتعريفات) — ADR-40
// ============================================================================
// هذا الملف هو المصدر الوحيد لـ«تعريف» كل قدرة في سمسم (البنية: key/type/scope/
// hierarchy/…). يُزامَن للـDB عبر البذر (buildSeedSQL). الحالة التشغيلية (runtime_status/
// overrides/ربط الباقات/قيم الحدود) تُدار في DB لاحقاً — لا تُكتب هنا.
//
// قواعد ملزمة (يفرضها الحارس features.manifest.test.js):
//   • key: lowercase snake_case، فريد.
//   • type ∈ feature|limit|option|mode · scope ∈ platform|restaurant|user.
//   • parent/supersedes/dependencies تشير إلى مفاتيح موجودة.
//   • نسجّل «ما له قرار تجاري فقط» (يُباع/يُقيَّد/يُرقّى/يحتاج صلاحية) — لا كل زر.
//
// حقول كل قدرة (الاختيارية لها افتراضات في buildSeedSQL):
//   key, name, description?, type, scope?, kind?, category?, module?, parent?,
//   lifecycle_status?, runtime_status?, sort_order?, icon?, upgrade_message?,
//   tags?, required_permissions?,
//   default_enabled?  (لنوع feature → enabled_global)
//   default_value?    (لأنواع limit/option/mode)
//   allowed_values?   (لنوع mode)
//   metric?, unit?    (لنوع limit)
// ============================================================================

// ---------------------------------------------------------------------------
// الفئات (Categories)
// ---------------------------------------------------------------------------
export const CATEGORIES = [
  { key: 'operations', name: 'التشغيل',        name_en: 'Operations', icon: '🛒', sort_order: 10 },
  { key: 'menu',       name: 'المنيو',          name_en: 'Menu',       icon: '📋', sort_order: 20 },
  { key: 'customers',  name: 'العملاء',         name_en: 'Customers',  icon: '👥', sort_order: 30 },
  { key: 'loyalty',    name: 'الولاء',          name_en: 'Loyalty',    icon: '🎁', sort_order: 40 },
  { key: 'marketing',  name: 'التسويق',         name_en: 'Marketing',  icon: '📣', sort_order: 50 },
  { key: 'setup',      name: 'الإعداد',         name_en: 'Setup',      icon: '🏢', sort_order: 60 },
  { key: 'analytics',  name: 'التحليل',         name_en: 'Analytics',  icon: '📈', sort_order: 70 },
  { key: 'billing',    name: 'الفوترة',         name_en: 'Billing',    icon: '💳', sort_order: 80 },
  { key: 'limits',     name: 'الحدود',          name_en: 'Limits',     icon: '📏', sort_order: 90 },
]

// ---------------------------------------------------------------------------
// القدرات (Capabilities) — المجموعة الأولية
//   (1) صفحات المنصّة (من nav.js) — قدرات قابلة للتقييد/البيع.
//   (2) الهيكل الهرمي المعتمد (Menu/Orders/Loyalty children) — ADR-40 المثال.
//   (3) عيّنات limit + mode — لتغطية الأنواع الأربعة وإثبات النموذج.
// ملاحظة: كل الصفحات default_enabled=true (متاحة اليوم لكل المطاعم — صفر تغيير سلوكي).
// ---------------------------------------------------------------------------
export const CAPABILITIES = [
  // (1) صفحات (kind=page, type=feature)
  { key: 'dashboard', name: 'الرئيسية', kind: 'page', category: 'analytics',  module: 'dashboard', type: 'feature', default_enabled: true, sort_order: 10, icon: '📊', description: 'لوحة المؤشرات الرئيسية', required_permissions: ['owner'] },
  { key: 'orders',    name: 'الطلبات',   kind: 'page', category: 'operations', module: 'orders',    type: 'feature', default_enabled: true, sort_order: 20, icon: '🛒', description: 'مركز إدارة الطلبات' },
  { key: 'menu',      name: 'المنيو',    kind: 'page', category: 'menu',       module: 'menu',      type: 'feature', default_enabled: true, sort_order: 30, icon: '📋', description: 'إدارة الأقسام والأصناف' },
  { key: 'customers', name: 'العملاء',   kind: 'page', category: 'customers',  module: 'customers', type: 'feature', default_enabled: true, sort_order: 40, icon: '👥', description: 'لوحة العملاء' },
  { key: 'loyalty',   name: 'الولاء والتقييمات', kind: 'page', category: 'loyalty', module: 'loyalty', type: 'feature', default_enabled: true, sort_order: 50, icon: '🎁', description: 'برنامج الولاء والتقييمات' },
  { key: 'marketing', name: 'العروض والكوبونات', kind: 'page', category: 'marketing', module: 'marketing', type: 'feature', default_enabled: true, sort_order: 60, icon: '📣', description: 'البانرات والكوبونات', required_permissions: ['owner'] },
  { key: 'branches',  name: 'الفروع',    kind: 'page', category: 'setup',      module: 'branches',  type: 'feature', default_enabled: true, sort_order: 70, icon: '🏢', description: 'إدارة الفروع' },
  { key: 'tables',    name: 'الطاولات',  kind: 'page', category: 'setup',      module: 'tables',    type: 'feature', default_enabled: true, sort_order: 80, icon: '🪑', description: 'إدارة الطاولات' },
  { key: 'qr',        name: 'QR Code',   kind: 'page', category: 'setup',      module: 'qr',        type: 'feature', default_enabled: true, sort_order: 90, icon: '📱', description: 'رموز QR' },
  { key: 'staff',     name: 'الموظفون',  kind: 'page', category: 'setup',      module: 'staff',     type: 'feature', default_enabled: true, sort_order: 100, icon: '🧑‍🍳', description: 'إدارة الموظفين', required_permissions: ['owner'] },
  { key: 'analytics', name: 'التحليلات', kind: 'page', category: 'analytics',  module: 'analytics', type: 'feature', default_enabled: true, sort_order: 110, icon: '📈', description: 'التحليلات والتقارير' },
  { key: 'billing',   name: 'الاشتراك والفوترة', kind: 'page', category: 'billing', module: 'billing', type: 'feature', default_enabled: true, sort_order: 120, icon: '💳', description: 'الاشتراك والفواتير', required_permissions: ['owner'] },
  { key: 'settings',  name: 'الإعدادات', kind: 'page', category: 'setup',      module: 'settings',  type: 'feature', default_enabled: true, sort_order: 130, icon: '⚙️', description: 'إعدادات المطعم', required_permissions: ['owner'] },

  // (2) الهيكل الهرمي — المنيو (children of 'menu')
  { key: 'menu_search',          name: 'بحث المنيو',        kind: 'component', category: 'menu', module: 'menu', parent: 'menu', type: 'feature', default_enabled: true, sort_order: 10 },
  { key: 'menu_categories',      name: 'الأقسام',           kind: 'component', category: 'menu', module: 'menu', parent: 'menu', type: 'feature', default_enabled: true, sort_order: 20 },
  { key: 'menu_qr',              name: 'QR للمنيو',         kind: 'component', category: 'menu', module: 'menu', parent: 'menu', type: 'feature', default_enabled: true, sort_order: 30 },
  { key: 'menu_product_details', name: 'تفاصيل المنتج',    kind: 'component', category: 'menu', module: 'menu', parent: 'menu', type: 'feature', default_enabled: true, sort_order: 35, description: 'فتح نافذة تفاصيل المنتج عند الضغط عليه (عند التعطيل: الضغط لا يفتح شيئاً)' },
  { key: 'menu_cart',            name: 'السلة',             kind: 'component', category: 'menu', module: 'menu', parent: 'menu', type: 'feature', default_enabled: true, sort_order: 40 },
  { key: 'menu_checkout',        name: 'إتمام الطلب',       kind: 'action',    category: 'menu', module: 'menu', parent: 'menu', type: 'feature', default_enabled: true, sort_order: 50 },
  { key: 'menu_reviews',         name: 'التقييمات',         kind: 'component', category: 'menu', module: 'menu', parent: 'menu', type: 'feature', default_enabled: true, sort_order: 60 },
  { key: 'menu_recommendations', name: 'الاقتراحات الذكية', kind: 'component', category: 'menu', module: 'menu', parent: 'menu', type: 'feature', default_enabled: true, sort_order: 70 },

  // (2) الهيكل الهرمي — الطلبات (children of 'orders')
  { key: 'orders_create', name: 'إنشاء طلب',  kind: 'action', category: 'operations', module: 'orders', parent: 'orders', type: 'feature', default_enabled: true, sort_order: 10 },
  { key: 'orders_edit',   name: 'تعديل طلب',  kind: 'action', category: 'operations', module: 'orders', parent: 'orders', type: 'feature', default_enabled: true, sort_order: 20 },
  { key: 'orders_cancel', name: 'إلغاء طلب',  kind: 'action', category: 'operations', module: 'orders', parent: 'orders', type: 'feature', default_enabled: true, sort_order: 30 },
  { key: 'orders_refund', name: 'استرجاع',    kind: 'action', category: 'operations', module: 'orders', parent: 'orders', type: 'feature', default_enabled: false, sort_order: 40, runtime_status: 'preview', description: 'استرجاع مبلغ الطلب (قيد التطوير)' },

  // (2) الهيكل الهرمي — الولاء (children of 'loyalty')
  { key: 'loyalty_points',  name: 'النقاط',    kind: 'component', category: 'loyalty', module: 'loyalty', parent: 'loyalty', type: 'feature', default_enabled: true, sort_order: 10 },
  { key: 'loyalty_rewards', name: 'المكافآت',  kind: 'component', category: 'loyalty', module: 'loyalty', parent: 'loyalty', type: 'feature', default_enabled: true, sort_order: 20 },
  { key: 'loyalty_levels',  name: 'المستويات', kind: 'component', category: 'loyalty', module: 'loyalty', parent: 'loyalty', type: 'feature', default_enabled: true, sort_order: 30 },

  // (3) عيّنات الحدود (type=limit) — تُسعّر لاحقاً لكل باقة (M3/M5). null = بلا حد افتراضياً.
  { key: 'products_limit', name: 'حد عدد المنتجات', kind: 'action', category: 'limits', module: 'menu',     type: 'limit', scope: 'restaurant', metric: 'products', unit: 'count', default_value: null, sort_order: 10, description: 'أقصى عدد منتجات (null = بلا حد)' },
  { key: 'branches_limit', name: 'حد عدد الفروع',   kind: 'action', category: 'limits', module: 'branches', type: 'limit', scope: 'restaurant', metric: 'branches', unit: 'count', default_value: null, sort_order: 20, description: 'أقصى عدد فروع (null = بلا حد)' },
  { key: 'users_limit',    name: 'حد عدد المستخدمين', kind: 'action', category: 'limits', module: 'staff',  type: 'limit', scope: 'restaurant', metric: 'users', unit: 'count', default_value: null, sort_order: 30, description: 'أقصى عدد موظفين (null = بلا حد)' },

  // (3) عيّنة وضع (type=mode) — لإثبات النوع (وضع التوصيل)
  { key: 'delivery_mode', name: 'وضع التوصيل', kind: 'option', category: 'operations', module: 'orders', type: 'mode', scope: 'restaurant',
    default_value: 'self', allowed_values: ['none', 'self', 'integrated'], sort_order: 40,
    description: 'none=بلا توصيل · self=توصيل ذاتي · integrated=تكامل مزوّد' },
]

// ---------------------------------------------------------------------------
// التبعيات (Dependencies) — required | optional | conflicts
// ---------------------------------------------------------------------------
export const DEPENDENCIES = [
  { feature: 'menu_checkout', depends_on: 'menu_cart',   type: 'required' },
  { feature: 'menu_cart',     depends_on: 'menu',        type: 'required' },
  { feature: 'orders_refund', depends_on: 'orders',      type: 'required' },
  { feature: 'loyalty_levels', depends_on: 'loyalty_points', type: 'required' },
]

export default { CATEGORIES, CAPABILITIES, DEPENDENCIES }
