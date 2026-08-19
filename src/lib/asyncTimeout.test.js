import { describe, expect, it, vi } from 'vitest'
import { AsyncTimeoutError, isTimeoutError, withTimeout } from './asyncTimeout'

describe('withTimeout', () => {
  it('يعيد نتيجة الطلب المكتمل قبل انتهاء المهلة', async () => {
    await expect(withTimeout(Promise.resolve('READY'), { operation: 'onboarding_categories', timeoutMs: 100 })).resolves.toBe('READY')
  })

  it('ينهي الطلب المعلّق بخطأ تشخيص قابل للمعالجة', async () => {
    vi.useFakeTimers()
    try {
      const pending = new Promise(() => {})
      const result = withTimeout(pending, { operation: 'onboarding_categories', timeoutMs: 100 })
      const assertion = expect(result).rejects.toMatchObject({
        name: 'AsyncTimeoutError',
        code: 'SIMSIM_ASYNC_TIMEOUT',
        operation: 'onboarding_categories',
        timeoutMs: 100,
      })

      await vi.advanceTimersByTimeAsync(100)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('يميّز خطأ المهلة عن أخطاء Supabase العادية', () => {
    expect(isTimeoutError(new AsyncTimeoutError('auth_session', 100))).toBe(true)
    expect(isTimeoutError(new Error('network'))).toBe(false)
  })
})
