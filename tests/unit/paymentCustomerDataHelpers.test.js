// TASK-PAY-3.6D.5-A.1 — اختبارات دوال بيانات تنفيذ الطلب النقيّة (المواصفة المعتمدة:
// TASK_3_6D_5_A_CUSTOMER_DATA_PERSISTENCE_SPEC.md، القرار المعتمد في TASK_3_6D_5_A_1)
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  PAYMENT_CUSTOMER_DATA_VERSION,
  PAYMENT_CUSTOMER_DATA_TTL_MS,
  paymentCustomerDataStorageKey,
  buildPaymentCustomerDataRecord,
  parseStoredPaymentCustomerData,
  persistPaymentCustomerData,
  clearPaymentCustomerData,
  readPaymentCustomerData,
} from '../../src/features/menu/hooks/paymentCustomerDataHelpers.js'

const KEY = 'pay_test-key-123'

beforeEach(() => {
  localStorage.clear()
})

describe('paymentCustomerDataStorageKey — PFDATA-02', () => {
  it('التنسيق الدقيق المعتمد: simsim_payfirst_customer_{key}', () => {
    expect(paymentCustomerDataStorageKey('pay_abc')).toBe('simsim_payfirst_customer_pay_abc')
  })
})

describe('buildPaymentCustomerDataRecord', () => {
  const now = Date.parse('2026-08-27T12:00:00.000Z')

  it('PFDATA-03: version = 1', () => {
    const r = buildPaymentCustomerDataRecord({ type: 'takeaway', customerPhone: '512345678', now })
    expect(r.version).toBe(1)
    expect(PAYMENT_CUSTOMER_DATA_VERSION).toBe(1)
  })

  it('PFDATA-04: createdAt = الآن بالضبط', () => {
    const r = buildPaymentCustomerDataRecord({ type: 'takeaway', customerPhone: '512345678', now })
    expect(r.createdAt).toBe('2026-08-27T12:00:00.000Z')
  })

  it('PFDATA-05: expiresAt = createdAt + ساعتان بالضبط (TTL المعتمد)', () => {
    const r = buildPaymentCustomerDataRecord({ type: 'takeaway', customerPhone: '512345678', now })
    expect(PAYMENT_CUSTOMER_DATA_TTL_MS).toBe(2 * 60 * 60 * 1000)
    expect(Date.parse(r.expiresAt) - Date.parse(r.createdAt)).toBe(2 * 60 * 60 * 1000)
    expect(r.expiresAt).toBe('2026-08-27T14:00:00.000Z')
  })

  it('PFDATA-06: customerPhone مُخزَّن حرفياً', () => {
    const r = buildPaymentCustomerDataRecord({ type: 'takeaway', customerPhone: '512345678', now })
    expect(r.customerPhone).toBe('512345678')
  })

  it('PFDATA-07: customerName اختياري — يظهر متى وُجد، يُحذَف متى غاب', () => {
    const withName = buildPaymentCustomerDataRecord({ type: 'takeaway', customerPhone: '512345678', customerName: 'محمد', now })
    expect(withName.customerName).toBe('محمد')
    const withoutName = buildPaymentCustomerDataRecord({ type: 'takeaway', customerPhone: '512345678', now })
    expect(withoutName).not.toHaveProperty('customerName')
  })

  it('PFDATA-08: notes اختيارية — نفس السلوك', () => {
    const withNotes = buildPaymentCustomerDataRecord({ type: 'takeaway', customerPhone: '512345678', notes: 'بدون بصل', now })
    expect(withNotes.notes).toBe('بدون بصل')
    const withoutNotes = buildPaymentCustomerDataRecord({ type: 'takeaway', customerPhone: '512345678', now })
    expect(withoutNotes).not.toHaveProperty('notes')
  })

  it('PFDATA-09: dine_in غير-QR يُدرج tableNumber', () => {
    const r = buildPaymentCustomerDataRecord({ type: 'dine_in', isQrCheckout: false, customerPhone: '512345678', tableNumber: '7', now })
    expect(r.tableNumber).toBe('7')
  })

  it('PFDATA-10: dine_in عبر QR لا يُدرج tableNumber أبداً حتى لو أُرسِلت', () => {
    const r = buildPaymentCustomerDataRecord({ type: 'dine_in', isQrCheckout: true, customerPhone: '512345678', tableNumber: '7', now })
    expect(r).not.toHaveProperty('tableNumber')
  })

  it('PFDATA-11: delivery يُدرج deliveryAddress', () => {
    const r = buildPaymentCustomerDataRecord({ type: 'delivery', customerPhone: '512345678', deliveryAddress: 'حي النخيل', now })
    expect(r.deliveryAddress).toBe('حي النخيل')
  })

  it('PFDATA-12: takeaway لا يُدرج tableNumber ولا deliveryAddress حتى لو أُرسِلا', () => {
    const r = buildPaymentCustomerDataRecord({
      type: 'takeaway', customerPhone: '512345678', tableNumber: '7', deliveryAddress: 'حي النخيل', now,
    })
    expect(r).not.toHaveProperty('tableNumber')
    expect(r).not.toHaveProperty('deliveryAddress')
  })

  it('PFDATA-20..24: لا حقول محظورة إطلاقاً — لا providerRef/paymentTransactionId/status/amount/branchId/restaurantId', () => {
    const r = buildPaymentCustomerDataRecord({
      type: 'delivery', customerPhone: '512345678', deliveryAddress: 'x', customerName: 'y', notes: 'z', now,
    })
    for (const forbidden of ['providerRef', 'paymentTransactionId', 'status', 'amount', 'branchId', 'restaurantId', 'branch_id', 'restaurant_id']) {
      expect(r).not.toHaveProperty(forbidden)
    }
    expect(Object.keys(r).sort()).toEqual(['createdAt', 'customerName', 'customerPhone', 'deliveryAddress', 'expiresAt', 'notes', 'version'].sort())
  })

  it('PFDATA-29: حقول نصية طويلة تُقتطَع دفاعياً عند 500 حرفاً (نفس حد create_order)', () => {
    const longNotes = 'ن'.repeat(600)
    const r = buildPaymentCustomerDataRecord({ type: 'takeaway', customerPhone: '512345678', notes: longNotes, now })
    expect(r.notes.length).toBe(500)
  })
})

describe('parseStoredPaymentCustomerData — التحقّق الثابت (بلا I/O)', () => {
  const now = Date.parse('2026-08-27T12:00:00.000Z')
  const validRecord = () => buildPaymentCustomerDataRecord({ type: 'takeaway', customerPhone: '512345678', now })

  it('سجلّ صالح يُرجَّع كما هو', () => {
    const raw = JSON.stringify(validRecord())
    expect(parseStoredPaymentCustomerData(raw, now)).toMatchObject({ customerPhone: '512345678' })
  })

  it('PFDATA-14: JSON تالف ⇒ null', () => {
    expect(parseStoredPaymentCustomerData('{not json', now)).toBeNull()
  })

  it('غياب القيمة الخام ⇒ null', () => {
    expect(parseStoredPaymentCustomerData(null, now)).toBeNull()
    expect(parseStoredPaymentCustomerData(undefined, now)).toBeNull()
  })

  it('PFDATA-15: إصدار غير مدعوم ⇒ null', () => {
    const raw = JSON.stringify({ ...validRecord(), version: 999 })
    expect(parseStoredPaymentCustomerData(raw, now)).toBeNull()
  })

  it('PFDATA-16/28: منتهي الصلاحية (TTL) ⇒ null — يمثّل أيضاً حالة "محاولة مهجورة"', () => {
    const raw = JSON.stringify(validRecord())
    const after3Hours = now + 3 * 60 * 60 * 1000
    expect(parseStoredPaymentCustomerData(raw, after3Hours)).toBeNull()
  })

  it('لحظة الانتهاء بالضبط (>=) تُعامَل كمنتهية', () => {
    const raw = JSON.stringify(validRecord())
    const exactExpiry = Date.parse(validRecord().expiresAt)
    expect(parseStoredPaymentCustomerData(raw, exactExpiry)).toBeNull()
  })
})

describe('persistPaymentCustomerData / clearPaymentCustomerData / readPaymentCustomerData — I/O حقيقي', () => {
  it('PFDATA-13: غياب/فراغ customerPhone يمنع الكتابة كلياً', () => {
    persistPaymentCustomerData(KEY, { type: 'takeaway', customerPhone: '' })
    expect(localStorage.getItem(paymentCustomerDataStorageKey(KEY))).toBeNull()
    persistPaymentCustomerData(KEY, { type: 'takeaway' })
    expect(localStorage.getItem(paymentCustomerDataStorageKey(KEY))).toBeNull()
  })

  it('كتابة ثم قراءة صحيحة', () => {
    persistPaymentCustomerData(KEY, { type: 'takeaway', customerPhone: '512345678' })
    const read = readPaymentCustomerData(KEY)
    expect(read.customerPhone).toBe('512345678')
  })

  it('clearPaymentCustomerData تمسح السجلّ فعلياً', () => {
    persistPaymentCustomerData(KEY, { type: 'takeaway', customerPhone: '512345678' })
    clearPaymentCustomerData(KEY)
    expect(readPaymentCustomerData(KEY)).toBeNull()
    expect(localStorage.getItem(paymentCustomerDataStorageKey(KEY))).toBeNull()
  })

  it('PFDATA-14b: readPaymentCustomerData تُنظِّف JSON تالفاً من التخزين فعلياً (لا تكتفي بإرجاع null)', () => {
    localStorage.setItem(paymentCustomerDataStorageKey(KEY), '{not json')
    expect(readPaymentCustomerData(KEY)).toBeNull()
    expect(localStorage.getItem(paymentCustomerDataStorageKey(KEY))).toBeNull()
  })

  it('PFDATA-15b: readPaymentCustomerData تُنظِّف سجلّ إصدار غير مدعوم من التخزين فعلياً', () => {
    localStorage.setItem(paymentCustomerDataStorageKey(KEY), JSON.stringify({ version: 999, customerPhone: '512345678', expiresAt: new Date(Date.now() + 1000).toISOString() }))
    expect(readPaymentCustomerData(KEY)).toBeNull()
    expect(localStorage.getItem(paymentCustomerDataStorageKey(KEY))).toBeNull()
  })

  it('PFDATA-16b: readPaymentCustomerData تُنظِّف سجلّاً منتهي الصلاحية من التخزين فعلياً', () => {
    const past = Date.now() - 1000
    localStorage.setItem(paymentCustomerDataStorageKey(KEY), JSON.stringify({
      version: 1, customerPhone: '512345678', createdAt: new Date(past - 1000).toISOString(), expiresAt: new Date(past).toISOString(),
    }))
    expect(readPaymentCustomerData(KEY)).toBeNull()
    expect(localStorage.getItem(paymentCustomerDataStorageKey(KEY))).toBeNull()
  })

  it('PFDATA-17: سجلّ صالح غير منتهٍ يُقرَأ بلا حذف', () => {
    persistPaymentCustomerData(KEY, { type: 'takeaway', customerPhone: '512345678' })
    const read = readPaymentCustomerData(KEY)
    expect(read).not.toBeNull()
    expect(localStorage.getItem(paymentCustomerDataStorageKey(KEY))).not.toBeNull()
  })

  it('PFDATA-19: مفتاحا إتقان مختلفان ⇒ سجلّان معزولان تماماً', () => {
    persistPaymentCustomerData('pay_key-A', { type: 'takeaway', customerPhone: '511111111' })
    persistPaymentCustomerData('pay_key-B', { type: 'takeaway', customerPhone: '522222222' })
    expect(readPaymentCustomerData('pay_key-A').customerPhone).toBe('511111111')
    expect(readPaymentCustomerData('pay_key-B').customerPhone).toBe('522222222')
    clearPaymentCustomerData('pay_key-A')
    expect(readPaymentCustomerData('pay_key-A')).toBeNull()
    expect(readPaymentCustomerData('pay_key-B').customerPhone).toBe('522222222') // غير متأثّر
  })

  it('readPaymentCustomerData بلا مفتاح إتقان يرجّع null بلا استثناء', () => {
    expect(readPaymentCustomerData(null)).toBeNull()
    expect(readPaymentCustomerData(undefined)).toBeNull()
  })

  it('persistPaymentCustomerData/clearPaymentCustomerData بلا مفتاح إتقان لا يفعلان شيئاً بلا استثناء', () => {
    expect(() => persistPaymentCustomerData(null, { type: 'takeaway', customerPhone: '512345678' })).not.toThrow()
    expect(() => clearPaymentCustomerData(null)).not.toThrow()
  })

  it('لا يوجد استدعاء setItem إضافي عند القراءة لسجلّ صالح (القراءة لا تُنشئ بيانات جديدة)', () => {
    persistPaymentCustomerData(KEY, { type: 'takeaway', customerPhone: '512345678' })
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    readPaymentCustomerData(KEY)
    expect(setItemSpy).not.toHaveBeenCalled()
    setItemSpy.mockRestore()
  })
})
