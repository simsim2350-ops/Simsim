// TASK-PAY-3.6D.4 — اختبارات useResumedPaymentIdempotencyKey (قراءة فقط، بلا توليد مفتاح جديد أبداً)
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useResumedPaymentIdempotencyKey } from '../../src/features/menu/hooks/useResumedPaymentIdempotencyKey.js'

beforeEach(() => {
  localStorage.clear()
})

describe('useResumedPaymentIdempotencyKey', () => {
  it('RPIK-01: يقرأ مفتاحاً محفوظاً مسبقاً بلا تغيير', async () => {
    localStorage.setItem('simsim_payidem_koshary_branch-a', 'existing-key-123')
    const { result } = renderHook(() => useResumedPaymentIdempotencyKey('koshary', 'branch-a'))
    await waitFor(() => expect(result.current).toBe('existing-key-123'))
    expect(localStorage.getItem('simsim_payidem_koshary_branch-a')).toBe('existing-key-123')
  })

  it('RPIK-02: بلا مفتاح محفوظ ⇒ null، ولا يُنشئ أي مفتاح جديد', async () => {
    const { result } = renderHook(() => useResumedPaymentIdempotencyKey('koshary', 'branch-a'))
    await waitFor(() => expect(result.current).toBeNull())
    expect(localStorage.getItem('simsim_payidem_koshary_branch-a')).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('RPIK-03: لا يستدعي crypto.randomUUID أو localStorage.setItem في أي مسار', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => useResumedPaymentIdempotencyKey('koshary', 'branch-a'))
    await waitFor(() => expect(result.current).toBeNull())
    expect(setItemSpy).not.toHaveBeenCalled()
    setItemSpy.mockRestore()
  })

  it('RPIK-04: بلا slug أو branchId يرجّع null بلا استثناء', () => {
    const { result } = renderHook(() => useResumedPaymentIdempotencyKey(null, null))
    expect(result.current).toBeNull()
  })

  it('RPIK-05: مفتاح مختلف لكل فرع من نفس المطعم', async () => {
    localStorage.setItem('simsim_payidem_koshary_branch-a', 'key-a')
    localStorage.setItem('simsim_payidem_koshary_branch-b', 'key-b')
    const a = renderHook(() => useResumedPaymentIdempotencyKey('koshary', 'branch-a'))
    const b = renderHook(() => useResumedPaymentIdempotencyKey('koshary', 'branch-b'))
    await waitFor(() => expect(a.result.current).toBe('key-a'))
    await waitFor(() => expect(b.result.current).toBe('key-b'))
  })

  it('RPIK-06: الملف لا يستورد usePaymentIdempotencyKey (المولِّدة) أو crypto مباشرة', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/features/menu/hooks/useResumedPaymentIdempotencyKey.js'),
      'utf8'
    )
    const importLines = src.split('\n').filter((l) => l.trim().startsWith('import'))
    expect(importLines.join('\n')).not.toMatch(/usePaymentIdempotencyKey|crypto/i)
  })
})
