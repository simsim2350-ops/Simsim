// أيقونات SVG موحّدة لوضع المنصّة — تستبدل Emoji الخام في القشرة الدائمة (الشريط الجانبي،
// الترويسة، شريط الأوامر) التي تُعرض في كل صفحة وتتأثر برسم الأنظمة المختلفة لكل Emoji.
// كل أيقونة تتبع currentColor فتتّسق تلقائياً مع أي لون/حالة، وaria-hidden لأنها دوماً
// مرافقة لنص أو لزر يحمل aria-label خاصاً به.
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
}

const svg = (paths) => function IconComponent({ size = 18, style, className }) {
  return <svg {...base} width={size} height={size} style={style} className={className}>{paths}</svg>
}

export const IconOverview = svg(<>
  <rect x="3" y="3" width="7" height="7" rx="1.5" />
  <rect x="14" y="3" width="7" height="7" rx="1.5" />
  <rect x="3" y="14" width="7" height="7" rx="1.5" />
  <rect x="14" y="14" width="7" height="7" rx="1.5" />
</>)

export const IconRestaurants = svg(<>
  <path d="M3 9l1-5h16l1 5" />
  <path d="M4 9v11h16V9" />
  <path d="M9 20v-6h6v6" />
</>)

export const IconGrowth = svg(<>
  <polyline points="4,17 10,11 14,15 20,7" />
  <polyline points="14,7 20,7 20,13" />
</>)

export const IconBilling = svg(<>
  <rect x="3" y="6" width="18" height="13" rx="2" />
  <line x1="3" y1="10" x2="21" y2="10" />
</>)

export const IconFlag = svg(<>
  <line x1="6" y1="3" x2="6" y2="21" />
  <path d="M6 4h12l-3 4 3 4H6" />
</>)

export const IconAnnouncements = svg(<>
  <path d="M4 10v4h3l6 4V6l-6 4H4Z" />
  <path d="M16.5 9a4 4 0 0 1 0 6" />
</>)

export const IconAdmins = svg(<>
  <circle cx="9" cy="8" r="3" />
  <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
  <circle cx="17" cy="9" r="2.5" />
  <path d="M15 20c.2-2.6 2-4.6 4.5-5" />
</>)

export const IconAudit = svg(<>
  <line x1="5" y1="6" x2="19" y2="6" />
  <line x1="5" y1="12" x2="19" y2="12" />
  <line x1="5" y1="18" x2="13" y2="18" />
</>)

export const IconSearch = svg(<>
  <circle cx="10.5" cy="10.5" r="6.5" />
  <line x1="20" y1="20" x2="15.5" y2="15.5" />
</>)

export const IconMenu = svg(<>
  <line x1="4" y1="7" x2="20" y2="7" />
  <line x1="4" y1="12" x2="20" y2="12" />
  <line x1="4" y1="17" x2="20" y2="17" />
</>)

export const IconLogout = svg(<>
  <line x1="12" y1="3" x2="12" y2="11" />
  <path d="M7 6a8 8 0 1 0 10 0" />
</>)

export const IconShield = svg(
  <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
)

export const IconRefresh = svg(<>
  <path d="M20 12a8 8 0 1 1-3-6.3" />
  <polyline points="20,3 20,9 14,9" />
</>)

export const IconEye = svg(<>
  <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
  <circle cx="12" cy="12" r="3" />
</>)

export const IconEyeOff = svg(<>
  <path d="M3 3l18 18" />
  <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6 0 10 7 10 7a17.9 17.9 0 0 1-3.2 4.1M6.6 6.6C4 8.3 2 12 2 12s4 7 10 7c1.5 0 2.9-.4 4.1-1" />
  <path d="M9.5 9.8a3 3 0 0 0 4.2 4.2" />
</>)

// أيقونة سجل القدرات (طبقات) — PCR/ADR-40
export const IconCatalog = svg(<>
  <path d="M12 3l9 5-9 5-9-5 9-5z" />
  <path d="M3 12l9 5 9-5" />
  <path d="M3 16.5l9 5 9-5" />
</>)

// أيقونة هوية المنيو (وسم/علامة) — Menu Branding
export const IconBranding = svg(<>
  <path d="M4 4h9l7 7-9 9-7-7V4z" />
  <circle cx="8.5" cy="8.5" r="1.5" />
</>)

// أيقونة إدارة الموقع التسويقي (نافذة/تخطيط صفحة).
export const IconMarketing = svg(<>
  <rect x="3" y="4" width="18" height="16" rx="2" />
  <line x1="3" y1="8" x2="21" y2="8" />
  <line x1="7" y1="12" x2="17" y2="12" />
  <line x1="7" y1="16" x2="13" y2="16" />
</>)

// خريطة أيقونات التنقّل — مصدر واحد يستهلكه AdminShell وCommandPalette معاً.
export const NAV_ICON_MAP = {
  overview: IconOverview,
  restaurants: IconRestaurants,
  growth: IconGrowth,
  billing: IconBilling,
  flags: IconFlag,
  catalog: IconCatalog,
  branding: IconBranding,
  marketing: IconMarketing,
  announcements: IconAnnouncements,
  admins: IconAdmins,
  audit: IconAudit,
}
