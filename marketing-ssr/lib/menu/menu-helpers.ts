// دوال مساعدة نقية — نقل مطابق من src/features/menu/helpers.js (الأجزاء التي لا تعتمد المتصفح).
// ملاحظة: computeOpenStatus يستعمل توقيت الخادم في SSR (قد يختلف عن جهاز الزبون).
import type { Branch, Restaurant } from './menu-types'

type OpenStatus = { open: boolean; unknown: boolean; todayText: string; nextText: string }
type DayHours = { open?: boolean; from?: string; to?: string }

export function estimatedPrepTime(activeOrdersCount: number): string {
  const base = 10
  const perOrder = 3
  const min = base + activeOrdersCount * perOrder
  const max = min + 10
  return `${min}-${max}`
}

export function getCalorieBadge(calories: number | null | undefined): string | null {
  if (calories == null) return null
  if (calories < 300) return '🟢'
  if (calories <= 600) return '🟡'
  return '🔴'
}

export function computeOpenStatus(hours: unknown): OpenStatus {
  if (!Array.isArray(hours) || hours.length !== 7) {
    return { open: true, unknown: true, todayText: '', nextText: '' }
  }
  const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  const days = hours as DayHours[]

  const fmt = (t?: string) => (t === '24:00' ? '00:00' : t || '')
  const toMins = (t?: string): number | null => {
    if (!t) return null
    const [h, m] = String(t).split(':').map(Number)
    return h * 60 + (m || 0)
  }
  const now = new Date()
  const day = now.getDay()
  const mins = now.getHours() * 60 + now.getMinutes()
  const today = days[day]
  const yesterday = days[(day + 6) % 7]

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

  const todayText = today && today.open ? `${fmt(today.from)} - ${fmt(today.to)}` : 'مغلق اليوم'

  let nextText = ''
  if (!open) {
    for (let offset = 0; offset <= 7; offset++) {
      const idx = (day + offset) % 7
      const h = days[idx]
      if (!h || !h.open) continue
      const f = toMins(h.from)
      if (f === null) continue
      if (offset === 0) {
        if (mins < f) { nextText = `يفتح اليوم الساعة ${fmt(h.from)}`; break }
      } else if (offset === 1) {
        nextText = `يفتح غداً الساعة ${fmt(h.from)}`; break
      } else {
        nextText = `يفتح ${DAY_NAMES[idx]} الساعة ${fmt(h.from)}`; break
      }
    }
  }

  return { open, unknown: false, todayText, nextText }
}

export function computeBranchOpenStatus(branch: Branch | null): OpenStatus {
  if (branch?.is_paused) {
    return { open: false, unknown: false, todayText: '', nextText: 'مغلق مؤقتاً من صاحب المطعم' }
  }
  return computeOpenStatus(branch?.opening_hours)
}

export function effectiveDeliverySettings(branch: Branch | null, restaurant: Restaurant): { enabled: boolean; fee: number } {
  const enabled = branch?.delivery_enabled ?? restaurant?.delivery_enabled ?? false
  const fee = branch?.delivery_fee ?? restaurant?.delivery_fee ?? 0
  return { enabled: Boolean(enabled), fee: Number(fee) || 0 }
}
