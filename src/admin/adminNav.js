// مصدر تنقّل Super Admin الوحيد (نظير nav.js للمطعم، لكن مستقل تماماً).
// ready=false: القسم مخطّط لكنه قيد البناء (يظهر معطّلاً بشارة «قريباً») — لا مسار له بعد.
// الأيقونة تُستمَدّ من NAV_ICON_MAP (components/ui/Icon.jsx) عبر key — مصدر واحد بدل Emoji هنا.
export const ADMIN_NAV = [
  { key: 'overview',    label: 'نظرة عامة',    path: '/admin',             ready: true  },
  { key: 'restaurants', label: 'المطاعم',      path: '/admin/restaurants', ready: true  },
  { key: 'growth',      label: 'النمو',        path: '/admin/growth',      ready: true  },
  { key: 'billing',     label: 'الفوترة',      path: '/admin/billing',     ready: true  },
  { key: 'flags',       label: 'المزايا',      path: '/admin/flags',       ready: true  },
  { key: 'catalog',     label: 'سجل القدرات',  path: '/admin/catalog',     ready: true  },
  { key: 'announcements', label: 'الإعلانات',  path: '/admin/announcements', ready: true },
  { key: 'admins',      label: 'المشرفون',     path: '/admin/admins',      ready: true  },
  { key: 'audit',       label: 'سجلّ التدقيق', path: '/admin/audit',       ready: true  },
]
