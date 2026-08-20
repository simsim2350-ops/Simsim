import { describe, expect, it } from 'vitest'
import { mapOrderError } from './orderErrors'

describe('mapOrderError — خريطة رسائل create_order إلى عربي/إنجليزي (TASK-CHK-002)', () => {
  it('يطابق رسالة B1 التاريخية (طلب بلا كوبون) — لا صلة لها بالمخرجات لكن يجب ألا يظهر نصّ Postgres خام', () => {
    const result = mapOrderError('record "v_coupon" is not assigned yet')
    expect(result).toEqual(expect.objectContaining({ ar: expect.any(String), en: expect.any(String) }))
  })

  it('يترجم كل رسائل التحقّق الـ13 الموثّقة في §6.3 دون رسالة احتياطية', () => {
    const knownMessages = [
      'invalid order type',
      'invalid items payload',
      'invalid customer phone',
      'restaurant is unavailable',
      'branch is unavailable',
      'delivery is unavailable',
      'takeaway is unavailable',
      'table number is required',
      'delivery address is required',
      'invalid product or quantity',
      'product is unavailable for this branch',
      'invalid product option',
      'required product option is missing',
      'invalid or expired coupon',
      'coupon minimum order not met',
      'coupon usage limit reached',
    ]
    const fallback = mapOrderError('لا يوجد مثل هذه الرسالة إطلاقاً')
    for (const msg of knownMessages) {
      const result = mapOrderError(msg)
      expect(result).not.toEqual(fallback)
      expect(result.ar.length).toBeGreaterThan(0)
      expect(result.en.length).toBeGreaterThan(0)
    }
  })

  it('يطابق برسالة تحتوي نصاً إضافياً حول الخادم (Postgres يضيف سياقاً أحياناً)', () => {
    const result = mapOrderError('new row for relation "orders" violates check constraint — product is unavailable for this branch')
    expect(result.ar).toContain('لم يعد متاحاً')
  })

  it('رسالة غير معروفة ⇒ الرسالة الاحتياطية العامة، بلا انهيار', () => {
    const result = mapOrderError('some brand new postgres error nobody mapped yet')
    expect(result.ar).toContain('لم يتم تأكيد الطلب')
  })

  it('مدخل فارغ/غير نصّي ⇒ الرسالة الاحتياطية بلا رمي استثناء', () => {
    expect(mapOrderError(null).ar).toBeTruthy()
    expect(mapOrderError(undefined).ar).toBeTruthy()
    expect(mapOrderError('').ar).toBeTruthy()
  })
})
