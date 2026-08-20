import { describe, expect, it } from 'vitest'
import { formatLastSynced } from './orderTracking'

describe('formatLastSynced — مؤشّر "آخر تحديث" (TASK-TRK-002)', () => {
  it('لا وقت مزامنة بعد ⇒ لا نص (لا يُعرض المؤشّر قبل أول مزامنة)', () => {
    expect(formatLastSynced(null, Date.now(), false)).toBeNull()
    expect(formatLastSynced(undefined, Date.now(), false)).toBeNull()
  })

  it('أقل من 5 ثوانٍ ⇒ "الآن"', () => {
    const now = 1_000_000
    expect(formatLastSynced(now - 2000, now, false)).toBe('الآن')
  })

  it('بين 5 و59 ثانية ⇒ عدد الثواني بالعربي', () => {
    const now = 1_000_000
    expect(formatLastSynced(now - 12_000, now, false)).toBe('قبل 12 ث')
  })

  it('دقيقة فأكثر ⇒ بالدقائق', () => {
    const now = 1_000_000
    expect(formatLastSynced(now - 125_000, now, false)).toBe('قبل 2 د')
  })

  it('النسخة الإنجليزية', () => {
    const now = 1_000_000
    expect(formatLastSynced(now - 12_000, now, true)).toBe('12s ago')
    expect(formatLastSynced(now - 125_000, now, true)).toBe('2m ago')
  })
})
