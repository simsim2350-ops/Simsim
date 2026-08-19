import { describe, expect, it } from 'vitest'
import { safeSupabaseRequest } from '../../../lib/safeSupabaseRequest'

describe('safeSupabaseRequest', () => {
  it('يشغّل Supabase thenable الذي لا يوفّر catch ويعيد بيانات المحتوى', async () => {
    const queryBuilder = {
      then(resolve) {
        resolve({ data: [{ id: 'category-1', name: 'الشباتي' }], error: null })
      },
    }

    expect(typeof queryBuilder.catch).toBe('undefined')
    await expect(safeSupabaseRequest(queryBuilder)).resolves.toEqual({
      data: [{ id: 'category-1', name: 'الشباتي' }],
      error: null,
    })
  })

  it('يحتفظ بخطأ الطلب كي لا يتحول فشل المحتوى الحرج إلى منيو فارغ صامت', async () => {
    const failure = new Error('network failed')
    const rejectedQueryBuilder = {
      then(_resolve, reject) {
        reject(failure)
      },
    }

    await expect(safeSupabaseRequest(rejectedQueryBuilder)).resolves.toEqual({ data: null, error: failure })
  })
})
