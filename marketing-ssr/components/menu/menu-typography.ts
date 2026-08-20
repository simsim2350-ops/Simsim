import type { CSSProperties } from 'react'

// نظام Typography مطابق للتطبيق الحالي (src/features/menu/typography.js) — نفس القيَم.
const HEADING = 'Tajawal,sans-serif'

export const TYPE: Record<string, CSSProperties> = {
  sectionTitle: { fontFamily: HEADING, fontWeight: 800, fontSize: '16px' },
  itemName: { fontFamily: HEADING, fontWeight: 700, fontSize: '15px' },
  itemNameSm: { fontFamily: HEADING, fontWeight: 700, fontSize: '13px' },
  price: { fontFamily: HEADING, fontWeight: 800, fontSize: '16px' },
  priceSm: { fontFamily: HEADING, fontWeight: 800, fontSize: '13px' },
  body: { fontWeight: 400, fontSize: '12px', lineHeight: '1.4' },
  meta: { fontWeight: 700, fontSize: '11px' },
  caption: { fontWeight: 700, fontSize: '10px' },
  tab: { fontFamily: HEADING, fontSize: '13px' },
}
