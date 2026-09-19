// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDashboardLoginLockoutUX } from './useDashboardLoginLockoutUX'

beforeEach(() => {
  vi.useFakeTimers()
  window.sessionStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useDashboardLoginLockoutUX — UX محلي بحت، لا يعرف حالة الخادم الفعلية', () => {
  it('لا يقفل قبل 5 محاولات فاشلة متتالية', () => {
    const { result } = renderHook(() => useDashboardLoginLockoutUX('owner@example.com'))
    expect(result.current.isLocked).toBe(false)
    act(() => { for (let i = 0; i < 4; i++) result.current.registerFailure() })
    expect(result.current.isLocked).toBe(false)
  })

  it('يقفل فوراً عند المحاولة الفاشلة الخامسة، بعدّاد يبدأ من 15 دقيقة تقريباً', () => {
    const { result } = renderHook(() => useDashboardLoginLockoutUX('owner@example.com'))
    act(() => { for (let i = 0; i < 5; i++) result.current.registerFailure() })
    expect(result.current.isLocked).toBe(true)
    expect(result.current.remainingSeconds).toBeGreaterThan(890) // ~15 دقيقة
    expect(result.current.remainingSeconds).toBeLessThanOrEqual(900)
    expect(result.current.countdownLabel).toMatch(/^\d{2}:\d{2}$/)
  })

  it('العدّاد يتناقص فعلياً مع الوقت', () => {
    const { result } = renderHook(() => useDashboardLoginLockoutUX('owner@example.com'))
    act(() => { for (let i = 0; i < 5; i++) result.current.registerFailure() })
    const before = result.current.remainingSeconds
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.remainingSeconds).toBeLessThan(before)
  })

  it('ينتهي القفل تلقائياً بعد 15 دقيقة وتُنظَّف الحالة بالكامل', () => {
    const { result } = renderHook(() => useDashboardLoginLockoutUX('owner@example.com'))
    act(() => { for (let i = 0; i < 5; i++) result.current.registerFailure() })
    expect(result.current.isLocked).toBe(true)
    act(() => { vi.advanceTimersByTime(15 * 60 * 1000 + 500) })
    expect(result.current.isLocked).toBe(false)
    expect(result.current.remainingSeconds).toBe(0)
  })

  it('لا يبقى أي مؤقّت يعمل بعد انتهاء القفل (لا infinite timer)', () => {
    const { result } = renderHook(() => useDashboardLoginLockoutUX('owner@example.com'))
    act(() => { for (let i = 0; i < 5; i++) result.current.registerFailure() })
    act(() => { vi.advanceTimersByTime(15 * 60 * 1000 + 500) })
    const pendingBefore = vi.getTimerCount()
    act(() => { vi.advanceTimersByTime(60 * 1000) })
    expect(vi.getTimerCount()).toBeLessThanOrEqual(pendingBefore)
  })

  it('النجاح يصفّر العدّاد فوراً ولا يحدث قفل حتى مع محاولات فاشلة سابقة', () => {
    const { result } = renderHook(() => useDashboardLoginLockoutUX('owner@example.com'))
    act(() => {
      for (let i = 0; i < 4; i++) result.current.registerFailure()
      result.current.registerSuccess()
      result.current.registerFailure()
    })
    expect(result.current.isLocked).toBe(false)
  })

  it('تبديل البريد المكتوب يبدأ عدّاداً مستقلاً — لا يرث قفل حساب آخر', () => {
    const { result, rerender } = renderHook(({ email }) => useDashboardLoginLockoutUX(email), {
      initialProps: { email: 'a@example.com' },
    })
    act(() => { for (let i = 0; i < 5; i++) result.current.registerFailure() })
    expect(result.current.isLocked).toBe(true)

    rerender({ email: 'b@example.com' })
    expect(result.current.isLocked).toBe(false)
  })

  it('العودة لنفس البريد المقفول تستعيد حالة القفل (نجاة من إعادة تحميل الصفحة)', () => {
    const { result, rerender } = renderHook(({ email }) => useDashboardLoginLockoutUX(email), {
      initialProps: { email: 'a@example.com' },
    })
    act(() => { for (let i = 0; i < 5; i++) result.current.registerFailure() })
    expect(result.current.isLocked).toBe(true)

    rerender({ email: 'b@example.com' })
    rerender({ email: 'a@example.com' })
    expect(result.current.isLocked).toBe(true)
  })

  it('mount جديد (محاكاة إعادة تحميل الصفحة) لنفس البريد المقفول يستعيد القفل من sessionStorage', () => {
    const first = renderHook(() => useDashboardLoginLockoutUX('owner@example.com'))
    act(() => { for (let i = 0; i < 5; i++) first.result.current.registerFailure() })
    expect(first.result.current.isLocked).toBe(true)
    first.unmount()

    const second = renderHook(() => useDashboardLoginLockoutUX('owner@example.com'))
    expect(second.result.current.isLocked).toBe(true)
    expect(second.result.current.remainingSeconds).toBeGreaterThan(0)
  })

  it('البريد الفارغ لا يُنشئ قفلاً أبداً', () => {
    const { result } = renderHook(() => useDashboardLoginLockoutUX(''))
    act(() => { for (let i = 0; i < 10; i++) result.current.registerFailure() })
    expect(result.current.isLocked).toBe(false)
  })

  it('التطبيع (trim + lowercase) يطابق نفس تطبيع الخادم', () => {
    const { result, rerender } = renderHook(({ email }) => useDashboardLoginLockoutUX(email), {
      initialProps: { email: '  Owner@Example.com  ' },
    })
    act(() => { for (let i = 0; i < 5; i++) result.current.registerFailure() })
    expect(result.current.isLocked).toBe(true)
    rerender({ email: 'owner@example.com' })
    expect(result.current.isLocked).toBe(true)
  })
})
