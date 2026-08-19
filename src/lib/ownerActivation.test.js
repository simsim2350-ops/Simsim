import { describe, expect, it } from 'vitest'
import { deriveOwnerActivation, isFirstOwnerContentItem, ownerMilestoneDedupeKey } from './ownerActivation.js'

const at = (event_type, occurred_at) => ({ event_type, occurred_at })

describe('owner activation domain', () => {
  it('يعتبر المالك مفعّلاً عند الجاهزية ثم أول فعل إتاحة لاحق', () => {
    const result = deriveOwnerActivation([
      at('restaurant_created', '2026-08-19T08:00:00.000Z'),
      at('menu_minimum_ready', '2026-08-19T08:05:00.000Z'),
      at('menu_shared', '2026-08-19T08:07:00.000Z'),
    ])

    expect(result).toMatchObject({
      activated: true,
      minimumReadyAt: '2026-08-19T08:05:00.000Z',
      firstAvailabilityAt: '2026-08-19T08:07:00.000Z',
      firstAvailabilityEvent: 'menu_shared',
      activatedAt: '2026-08-19T08:07:00.000Z',
    })
  })

  it('لا يفعّل المالك إذا حدثت المشاركة قبل الجاهزية فقط', () => {
    const result = deriveOwnerActivation([
      at('menu_link_copied', '2026-08-19T08:01:00.000Z'),
      at('menu_minimum_ready', '2026-08-19T08:05:00.000Z'),
    ])

    expect(result.activated).toBe(false)
    expect(result.activatedAt).toBeNull()
  })

  it('يختار أول فعل إتاحة لاحق بين النسخ والمشاركة وQR', () => {
    const result = deriveOwnerActivation([
      at('menu_minimum_ready', '2026-08-19T08:05:00.000Z'),
      at('qr_downloaded', '2026-08-19T08:09:00.000Z'),
      at('menu_link_copied', '2026-08-19T08:06:00.000Z'),
      at('menu_shared', '2026-08-19T08:07:00.000Z'),
    ])

    expect(result.firstAvailabilityEvent).toBe('menu_link_copied')
    expect(result.activatedAt).toBe('2026-08-19T08:06:00.000Z')
  })

  it('ينشئ مفتاح dedupe ثابتاً للمطعم ولا يخلط Best Share مع branch أو الطلبات', () => {
    expect(ownerMilestoneDedupeKey('category_created', 'r1')).toBe('milestone:category_created:restaurant:r1')
    expect(ownerMilestoneDedupeKey('category_created', 'r1')).toBe('milestone:category_created:restaurant:r1')
    expect(ownerMilestoneDedupeKey('qr_downloaded', 'r1')).toBe('milestone:qr_downloaded:restaurant:r1')
    expect(ownerMilestoneDedupeKey('menu_minimum_ready', 'r1')).toBe('milestone:menu_minimum_ready:restaurant:r1')
    expect(ownerMilestoneDedupeKey('menu_minimum_ready', null)).toBeNull()
  })

  it('يحدد أول قسم أو صنف فقط ولا يعيد milestone مع المحتوى الموجود', () => {
    expect(isFirstOwnerContentItem(0)).toBe(true)
    expect(isFirstOwnerContentItem(1)).toBe(false)
    expect(isFirstOwnerContentItem(8)).toBe(false)
  })
})
