// دوال عرض نقية للمنيو — منقولة حرفياً من src/features/menu/helpers.js لضمان تطابق السلوك البصري.
import type { MenuBranch, MenuRestaurant, OpeningHoursDay } from './menu-types'

export interface OpenStatus {
  open: boolean
  unknown: boolean
  todayText: string
  nextText: string
}

// شارة مستوى السعرات: 🟢 منخفض (<300) / 🟡 متوسط (300-600) / 🔴 مرتفع (600+)
export function getCalorieBadge(calories: number | null | undefined): string | null {
  if (calories == null) return null
  if (calories < 300) return '🟢'
  if (calories <= 600) return '🟡'
  return '🔴'
}

// وقت تجهيز تقديري ديناميكي: وقت أساسي + دقائق لكل طلب نشط (Phase 1: العدد 0).
export function estimatedPrepTime(activeOrdersCount: number): string {
  const base = 10
  const perOrder = 3
  const min = base + activeOrdersCount * perOrder
  const max = min + 10
  return `${min}-${max}`
}

// حساب حالة الفتح من أوقات العمل (مصفوفة 7 أيام {open, from, to}، الأحد = 0).
export function computeOpenStatus(hours: OpeningHoursDay[] | null | undefined): OpenStatus {
  if (!Array.isArray(hours) || hours.length !== 7) {
    return { open: true, unknown: true, todayText: '', nextText: '' }
  }
  const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  const fmt = (t: string) => (t === '24:00' ? '00:00' : t)
  const toMins = (t?: string): number | null => {
    if (!t) return null
    const [h, m] = String(t).split(':').map(Number)
    return h * 60 + (m || 0)
  }
  const now = new Date()
  const day = now.getDay()
  const mins = now.getHours() * 60 + now.getMinutes()
  const today = hours[day]
  const yesterday = hours[(day + 6) % 7]

  let open = false
  if (yesterday && yesterday.open) {
    const f = toMins(yesterday.from), t = toMins(yesterday.to)
    if (f !== null && t !== null && t <= f && mins < t) open = true
  }
  if (!open && today && today.open) {
    const f = toMins(today.from), t = toMins(today.to)
    if (f !== null && t !== null) {
      if (t > f) { if (mins >= f && mins < t) open = true }
      else { if (mins >= f) open = true }
    }
  }

  const todayText = today && today.open ? `${fmt(today.from!)} - ${fmt(today.to!)}` : 'مغلق اليوم'

  let nextText = ''
  if (!open) {
    for (let offset = 0; offset <= 7; offset++) {
      const idx = (day + offset) % 7
      const h = hours[idx]
      if (!h || !h.open) continue
      const f = toMins(h.from)
      if (f === null) continue
      if (offset === 0) {
        if (mins < f) { nextText = `يفتح اليوم الساعة ${fmt(h.from!)}`; break }
      } else if (offset === 1) {
        nextText = `يفتح غداً الساعة ${fmt(h.from!)}`; break
      } else {
        nextText = `يفتح ${DAY_NAMES[idx]} الساعة ${fmt(h.from!)}`; break
      }
    }
  }
  return { open, unknown: false, todayText, nextText }
}

// حالة الفتح الفعلية للفرع: الإغلاق المؤقت (is_paused) يتفوّق فوراً على جدول الساعات.
export function computeBranchOpenStatus(branch: MenuBranch | null): OpenStatus {
  if (branch?.is_paused) {
    return { open: false, unknown: false, todayText: '', nextText: 'مغلق مؤقتاً من صاحب المطعم' }
  }
  return computeOpenStatus(branch?.opening_hours)
}

// إعدادات التوصيل الفعلية: الفرع يرث من المطعم إن لم يُخصَّص له إعداد مستقل.
export function effectiveDeliverySettings(branch: MenuBranch | null, restaurant: MenuRestaurant) {
  const enabled = branch?.delivery_enabled ?? restaurant?.delivery_enabled ?? false
  const fee = branch?.delivery_fee ?? restaurant?.delivery_fee ?? 0
  return { enabled, fee }
}
