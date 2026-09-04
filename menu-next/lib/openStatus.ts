import type { Branch, Restaurant, OpeningHoursDay } from './types'

// Faithful TypeScript port of src/features/menu/helpers.js's computeOpenStatus /
// computeBranchOpenStatus / effectiveDeliverySettings — same algorithm, same
// day-index convention (Sunday = 0), same "no hours configured = always open"
// fallback. Not reinvented; ported so this order-type/open gating in menu-next
// matches production's real behavior instead of a guess.

export type OpenStatus = { open: boolean; unknown: boolean; todayText: string; nextText: string }

const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

function toMins(t: string | null | undefined): number | null {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + (m || 0)
}

const fmt = (t: string) => (t === '24:00' ? '00:00' : t)

export function computeOpenStatus(hours: OpeningHoursDay[] | null | undefined): OpenStatus {
  if (!Array.isArray(hours) || hours.length !== 7) {
    return { open: true, unknown: true, todayText: '', nextText: '' }
  }
  const now = new Date()
  const day = now.getDay()
  const mins = now.getHours() * 60 + now.getMinutes()
  const today = hours[day]
  const yesterday = hours[(day + 6) % 7]

  let open = false

  if (yesterday && yesterday.open) {
    const f = toMins(yesterday.from)
    const t = toMins(yesterday.to)
    if (f !== null && t !== null && t <= f && mins < t) open = true
  }
  if (!open && today && today.open) {
    const f = toMins(today.from)
    const t = toMins(today.to)
    if (f !== null && t !== null) {
      if (t > f) {
        if (mins >= f && mins < t) open = true
      } else if (mins >= f) {
        open = true
      }
    }
  }

  const todayText = today && today.open ? `${fmt(today.from)} - ${fmt(today.to)}` : 'مغلق اليوم'

  let nextText = ''
  if (!open) {
    for (let offset = 0; offset <= 7; offset++) {
      const idx = (day + offset) % 7
      const h = hours[idx]
      if (!h || !h.open) continue
      const f = toMins(h.from)
      if (f === null) continue
      if (offset === 0) {
        if (mins < f) {
          nextText = `يفتح اليوم الساعة ${fmt(h.from)}`
          break
        }
      } else if (offset === 1) {
        nextText = `يفتح غداً الساعة ${fmt(h.from)}`
        break
      } else {
        nextText = `يفتح ${DAY_NAMES_AR[idx]} الساعة ${fmt(h.from)}`
        break
      }
    }
  }

  return { open, unknown: false, todayText, nextText }
}

export function computeBranchOpenStatus(branch: Branch | null | undefined): OpenStatus {
  if (branch?.is_paused) {
    return { open: false, unknown: false, todayText: '', nextText: 'مغلق مؤقتاً من صاحب المطعم' }
  }
  return computeOpenStatus(branch?.opening_hours)
}

export function effectiveDeliverySettings(branch: Branch | null | undefined, restaurant: Restaurant | null | undefined): { enabled: boolean; fee: number } {
  const enabled = branch?.delivery_enabled ?? restaurant?.delivery_enabled ?? false
  const fee = branch?.delivery_fee ?? restaurant?.delivery_fee ?? 0
  return { enabled, fee }
}
