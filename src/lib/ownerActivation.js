// Owner activation domain — Phase 1: Measure Before You Optimize.
// هذه طبقة pure صغيرة فوق analytics_events، وليست ناقل أحداث أو إطار تحليلات جديد.

export const OWNER_ACTIVATION_MILESTONES = Object.freeze([
  'registration_started',
  'registration_completed',
  'restaurant_created',
  'category_created',
  'first_product_created',
  'menu_minimum_ready',
  'menu_link_copied',
  'menu_shared',
  'qr_downloaded',
])

export const OWNER_AVAILABILITY_EVENTS = Object.freeze([
  'menu_link_copied',
  'menu_shared',
  'qr_downloaded',
])

const RESTAURANT_MILESTONES = new Set([
  'registration_completed',
  'restaurant_created',
  'category_created',
  'first_product_created',
  'menu_minimum_ready',
  ...OWNER_AVAILABILITY_EVENTS,
])

// يحافظ على تعريف «الأول» داخل الفرع الذي يحرره المالك. قاعدة البيانات تبقى الحارس النهائي عبر dedupe_key.
export function isFirstOwnerContentItem(existingCount) {
  return Number(existingCount) === 0
}

export function ownerMilestoneDedupeKey(eventType, restaurantId = null) {
  if (!eventType) return null
  if (eventType === 'registration_started') return 'registration_started:session'
  if (!restaurantId || !RESTAURANT_MILESTONES.has(eventType)) return null
  return `milestone:${eventType}:restaurant:${restaurantId}`
}

export function deriveOwnerActivation(events = []) {
  const normalized = [...events]
    .filter(event => event?.event_type && event?.occurred_at)
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime())

  const minimumReady = normalized.find(event => event.event_type === 'menu_minimum_ready') || null
  const firstAvailability = minimumReady
    ? normalized.find(event => OWNER_AVAILABILITY_EVENTS.includes(event.event_type)
      && new Date(event.occurred_at).getTime() >= new Date(minimumReady.occurred_at).getTime()) || null
    : null

  return {
    minimumReadyAt: minimumReady?.occurred_at || null,
    firstAvailabilityAt: firstAvailability?.occurred_at || null,
    firstAvailabilityEvent: firstAvailability?.event_type || null,
    activatedAt: firstAvailability?.occurred_at || null,
    activated: Boolean(minimumReady && firstAvailability),
  }
}
