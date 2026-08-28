// TASK-PAY-3.6D.5-A.1 — اختبارات usePaymentCustomerData (قراءة فقط، بلا توليد بيانات جديدة أبداً)
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePaymentCustomerData } from '../../src/features/menu/hooks/usePaymentCustomerData.js'
import { persistPaymentCustomerData, paymentCustomerDataStorageKey } from '../../src/features/menu/hooks/paymentCustomerDataHelpers.js'

const KEY = 'pay_hook-test-key'

beforeEach(() => {
  localStorage.clear()
})

describe('usePaymentCustomerData', () => {
  it('PFDATA-17b: يقرأ سجلّاً صالحاً محفوظاً مسبقاً', async () => {
    persistPaymentCustomerData(KEY, { type: 'delivery', customerPhone: '512345678', deliveryAddress: 'حي النخيل' })
    const { result } = renderHook(() => usePaymentCustomerData(KEY))
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current.customerPhone).toBe('512345678')
    expect(result.current.deliveryAddress).toBe('حي النخيل')
  })

  it('بلا سجلّ محفوظ ⇒ null', async () => {
    const { result } = renderHook(() => usePaymentCustomerData(KEY))
    await waitFor(() => expect(result.current).toBeNull())
  })

  it('PFDATA-18: لا تكتب أبداً — لا استدعاء setItem في أي مسار، سواء وُجد سجلّ أم لا', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    renderHook(() => usePaymentCustomerData(KEY))
    await new Promise((r) => setTimeout(r, 0))
    expect(setItemSpy).not.toHaveBeenCalled()
    setItemSpy.mockRestore()
  })

  it('بلا مفتاح إتقان يرجّع null بلا استثناء', () => {
    const { result } = renderHook(() => usePaymentCustomerData(null))
    expect(result.current).toBeNull()
  })

  it('مفتاح مختلف يقرأ سجلّاً مختلفاً معزولاً', async () => {
    persistPaymentCustomerData('pay_key-A', { type: 'takeaway', customerPhone: '511111111' })
    persistPaymentCustomerData('pay_key-B', { type: 'takeaway', customerPhone: '522222222' })
    const a = renderHook(() => usePaymentCustomerData('pay_key-A'))
    const b = renderHook(() => usePaymentCustomerData('pay_key-B'))
    await waitFor(() => expect(a.result.current?.customerPhone).toBe('511111111'))
    await waitFor(() => expect(b.result.current?.customerPhone).toBe('522222222'))
  })

  it('الملف لا يستورد الدالة النقية للتوليد (persistPaymentCustomerData) في أسطر الاستيراد', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/features/menu/hooks/usePaymentCustomerData.js'), 'utf8')
    const importLines = src.split('\n').filter((l) => l.trim().startsWith('import'))
    expect(importLines.join('\n')).not.toMatch(/persistPaymentCustomerData/)
  })
})
