// مصدر تنقّل Super Admin الوحيد (نظير nav.js للمطعم، لكن مستقل تماماً).
// ready=false: القسم مخطّط لكنه قيد البناء (يظهر معطّلاً بشارة «قريباً») — لا مسار له بعد.
export const ADMIN_NAV = [
  { key: 'overview',    label: 'نظرة عامة',    icon: '📊', path: '/admin',             ready: true  },
  { key: 'restaurants', label: 'المطاعم',      icon: '🏪', path: '/admin/restaurants', ready: true  },
  { key: 'billing',     label: 'الفوترة',      icon: '💳', path: '/admin/billing',     ready: true  },
  { key: 'flags',       label: 'المزايا',      icon: '🚩', path: '/admin/flags',       ready: false },
  { key: 'audit',       label: 'سجلّ التدقيق', icon: '📜', path: '/admin/audit',       ready: true  },
]
