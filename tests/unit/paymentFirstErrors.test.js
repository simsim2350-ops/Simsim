import { describe, it, expect } from 'vitest'
import { mapPaymentFirstRejectionReason } from '../../src/features/menu/paymentFirstErrors'

describe('mapPaymentFirstRejectionReason', () => {
  it('PFE-01: reason=dry_run_failed يفوّض إلى mapOrderError برسالة create_order الخام', () => {
    const msg = mapPaymentFirstRejectionReason('dry_run_failed', 'invalid customer phone')
    expect(msg.ar).toContain('رقم الجوال')
  })

  it('PFE-02: reason=dry_run_failed برسالة غير معروفة يرجّع fallback الخاص بـmapOrderError نفسها', () => {
    const msg = mapPaymentFirstRejectionReason('dry_run_failed', 'totally unknown db error text')
    expect(msg).toEqual({ ar: 'تعذّر إتمام الطلب. لم يتم تأكيد الطلب — حاول مرة أخرى', en: 'Could not place the order. The order was not confirmed — try again' })
  })

  it('PFE-03: كل سبب معروف يرجّع رسالة ثنائية اللغة غير فارغة', () => {
    const reasons = [
      'unsupported_currency',
      'invalid_idempotency_key',
      'snapshot_failed',
      'amount_integrity_violation',
      'snapshot_integrity_violation',
      'tenant_not_found',
    ]
    for (const reason of reasons) {
      const msg = mapPaymentFirstRejectionReason(reason)
      expect(typeof msg.ar).toBe('string')
      expect(msg.ar.length).toBeGreaterThan(0)
      expect(typeof msg.en).toBe('string')
      expect(msg.en.length).toBeGreaterThan(0)
    }
  })

  it('PFE-04: سبب غير معروف يرجّع رسالة fallback عامة', () => {
    const msg = mapPaymentFirstRejectionReason('totally_unknown_reason')
    expect(msg.ar).toBe('تعذّر إتمام الطلب. لم يتم تأكيد الطلب — حاول مرة أخرى')
  })

  it('PFE-05: reason=undefined/null يرجّع fallback بلا استثناء', () => {
    expect(() => mapPaymentFirstRejectionReason(undefined)).not.toThrow()
    expect(() => mapPaymentFirstRejectionReason(null)).not.toThrow()
    expect(mapPaymentFirstRejectionReason(undefined).ar).toBeTruthy()
  })

  it('PFE-06: دالة خالصة — لا تعتمد على أي حالة خارجية (نفس المُدخَل ⇒ نفس المُخرَج دوماً)', () => {
    const a = mapPaymentFirstRejectionReason('tenant_not_found')
    const b = mapPaymentFirstRejectionReason('tenant_not_found')
    expect(a).toEqual(b)
  })
})
