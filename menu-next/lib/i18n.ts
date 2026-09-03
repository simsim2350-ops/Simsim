import type { Lang } from './types'

// Minimal static UI strings for the POC — not a port of the current app's full
// i18n system (src/features/menu/i18n.js), just enough for this read-only view.
const STRINGS = {
  ar: {
    branches: 'الفروع',
    unavailable: 'غير متوفر حالياً',
    noProducts: 'لا توجد أصناف متاحة في هذا القسم حالياً.',
    noCategories: 'لا يوجد منيو متاح لهذا الفرع حالياً.',
    switchLang: 'English',
    poweredBy: 'منيو تجريبي مبني بـ Next.js — SimSim',
    notFoundTitle: 'المطعم غير موجود',
    notFoundBody: 'تحقق من الرابط أو جرّب لاحقاً.',
  },
  en: {
    branches: 'Branches',
    unavailable: 'Currently unavailable',
    noProducts: 'No items available in this category right now.',
    noCategories: 'No menu available for this branch right now.',
    switchLang: 'العربية',
    poweredBy: 'Next.js proof-of-concept menu — SimSim',
    notFoundTitle: 'Restaurant not found',
    notFoundBody: 'Check the link or try again later.',
  },
} as const

export function t(lang: Lang) {
  return STRINGS[lang]
}
