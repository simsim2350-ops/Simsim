// TASK-PAY-3.6D.3 — اختبارات usePaymentIdempotencyKey (src/features/menu/hooks/usePaymentIdempotencyKey.js)
// localStorage حقيقي (بيئة happy-dom) — لا شبكة، لا db، لا Moyasar.
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePaymentIdempotencyKey } from '../../src/features/menu/hooks/usePaymentIdempotencyKey.js'

beforeEach(() => {
  localStorage.clear()
})

describe('usePaymentIdempotencyKey', () => {
  it('PIK-01: يولّد مفتاحاً جديداً عند أول استخدام لفرع/مطعم بلا مفتاح محفوظ مسبقاً', async () => {
    const { result } = renderHook(() => usePaymentIdempotencyKey('koshary', 'branch-a'))
    await waitFor(() => expect(result.current.paymentIdempotencyKey).toBeTruthy())
  })

  it('PIK-02: يحفظ المفتاح في localStorage تحت simsim_payidem_{slug}_{branchId}', async () => {
    const { result } = renderHook(() => usePaymentIdempotencyKey('koshary', 'branch-a'))
    await waitFor(() => expect(result.current.paymentIdempotencyKey).toBeTruthy())
    expect(localStorage.getItem('simsim_payidem_koshary_branch-a')).toBe(result.current.paymentIdempotencyKey)
  })

  it('PIK-03: يعيد نفس المفتاح المحفوظ مسبقاً بدل توليد آخر جديد', async () => {
    localStorage.setItem('simsim_payidem_koshary_branch-a', 'existing-key-123')
    const { result } = renderHook(() => usePaymentIdempotencyKey('koshary', 'branch-a'))
    await waitFor(() => expect(result.current.paymentIdempotencyKey).toBe('existing-key-123'))
  })

  it('PIK-04: مفتاح مختلف لكل فرع من نفس المطعم', async () => {
    const a = renderHook(() => usePaymentIdempotencyKey('koshary', 'branch-a'))
    const b = renderHook(() => usePaymentIdempotencyKey('koshary', 'branch-b'))
    await waitFor(() => expect(a.result.current.paymentIdempotencyKey).toBeTruthy())
    await waitFor(() => expect(b.result.current.paymentIdempotencyKey).toBeTruthy())
    expect(a.result.current.paymentIdempotencyKey).not.toBe(b.result.current.paymentIdempotencyKey)
  })

  it('PIK-05: clearKey() تمسح المفتاح من الحالة ومن localStorage معاً', async () => {
    const { result } = renderHook(() => usePaymentIdempotencyKey('koshary', 'branch-a'))
    await waitFor(() => expect(result.current.paymentIdempotencyKey).toBeTruthy())
    result.current.clearKey()
    await waitFor(() => expect(result.current.paymentIdempotencyKey).toBeNull())
    expect(localStorage.getItem('simsim_payidem_koshary_branch-a')).toBeNull()
  })

  it('PIK-06: بلا slug أو branchId لا يولّد أي مفتاح ولا يرمي استثناء', () => {
    const { result } = renderHook(() => usePaymentIdempotencyKey(null, null))
    expect(result.current.paymentIdempotencyKey).toBeNull()
  })

  it('PIK-07: بعد المسح، إعادة تركيب الـHook لنفس الفرع يولّد مفتاحاً جديداً مختلفاً', async () => {
    const first = renderHook(() => usePaymentIdempotencyKey('koshary', 'branch-a'))
    await waitFor(() => expect(first.result.current.paymentIdempotencyKey).toBeTruthy())
    const firstKey = first.result.current.paymentIdempotencyKey
    first.result.current.clearKey()

    const second = renderHook(() => usePaymentIdempotencyKey('koshary', 'branch-a'))
    await waitFor(() => expect(second.result.current.paymentIdempotencyKey).toBeTruthy())
    expect(second.result.current.paymentIdempotencyKey).not.toBe(firstKey)
  })
})
