// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PaymentFirstCallbackLanding, { CallbackState } from '../../src/features/menu/PaymentFirstCallbackLanding'

const t = (key) => ({
  pfCallbackResolving: 'جارٍ التحقق من حالة الدفع…',
  pfCallbackMissingKey: 'تعذّر العثور على محاولة الدفع',
  pfCallbackMissingKeyBody: 'لم نتمكن من ربط هذه الصفحة بمحاولة دفع',
  pfCallbackPendingTitle: 'دفعتك لا تزال قيد التأكيد',
  pfCallbackPendingBody: 'قد يستغرق هذا لحظات',
  pfCallbackSucceededTitle: 'تم تأكيد الدفع بنجاح',
  pfCallbackFailedTitle: 'تعذّر إتمام الدفع',
  pfCallbackUnknownTitle: 'لم يتم العثور على هذه المحاولة',
  pfCallbackRetryableErrorTitle: 'حدث خطأ تقني أثناء التحقق',
  pfCallbackRetryAction: 'إعادة التحقق',
  backToMenu: '← العودة للمنيو',
}[key] || key)

const RESUMED_KEY = 'pay_resumed-key-123'
const STORAGE_KEY = 'simsim_payidem_koshary_branch-a'

function renderCallback({ url = '/menu/koshary?payment_callback=pay_resumed-key-123', db, onSucceeded, onFailed, onRecover } = {}) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <PaymentFirstCallbackLanding
        slug="koshary" branchId="branch-a" db={db}
        onSucceeded={onSucceeded} onFailed={onFailed} onRecover={onRecover}
        t={t} isEn={false} brandColor="#FF6A00"
      />
    </MemoryRouter>
  )
}

function makeDb(rpcImpl) {
  return { rpc: vi.fn(rpcImpl) }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PaymentFirstCallbackLanding', () => {
  it('PFCL-06: بلا payment_callback في الرابط ⇒ IDLE، لا شيء يُعرض، لا استدعاء RPC', async () => {
    localStorage.setItem(STORAGE_KEY, RESUMED_KEY)
    const db = makeDb(() => Promise.resolve({ data: [], error: null }))
    const { container } = renderCallback({ url: '/menu/koshary', db })
    await new Promise((r) => setTimeout(r, 0))
    expect(container).toBeEmptyDOMElement()
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('PFCL-05: payment_callback موجود لكن بلا مفتاح محفوظ محلياً ⇒ MISSING_KEY، لا استدعاء RPC', async () => {
    const db = makeDb(() => Promise.resolve({ data: [], error: null }))
    renderCallback({ db })
    await waitFor(() => expect(screen.getByText('تعذّر العثور على محاولة الدفع')).toBeInTheDocument())
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('PFCL-01: مفتاح صالح محفوظ ← RPC ← succeeded يعرض الإجمالي السلطوي فقط', async () => {
    localStorage.setItem(STORAGE_KEY, RESUMED_KEY)
    const db = makeDb(() => Promise.resolve({ data: [{ status: 'succeeded', amount: 45.5, currency: 'SAR', updated_at: '2026-08-27T10:00:00Z' }], error: null }))
    renderCallback({ db })
    await waitFor(() => expect(screen.getByText('تم تأكيد الدفع بنجاح')).toBeInTheDocument())
    expect(screen.getByText(/45\.50/)).toBeInTheDocument()
    expect(db.rpc).toHaveBeenCalledWith('get_payment_status_by_idempotency_key', { p_idempotency_key: RESUMED_KEY })
  })

  it('PFCL-02: مفتاح صالح ← RPC ← pending يعرض حالة "قيد التأكيد" دون ادّعاء نجاح أو فشل', async () => {
    localStorage.setItem(STORAGE_KEY, RESUMED_KEY)
    vi.useFakeTimers()
    const db = makeDb(() => Promise.resolve({ data: [{ status: 'pending', amount: 20, currency: 'SAR', updated_at: '2026-08-27T10:00:00Z' }], error: null }))
    renderCallback({ db })
    await vi.waitFor(() => expect(screen.getByText('دفعتك لا تزال قيد التأكيد')).toBeInTheDocument())
    expect(screen.queryByText('تم تأكيد الدفع بنجاح')).not.toBeInTheDocument()
    expect(screen.queryByText('تعذّر إتمام الدفع')).not.toBeInTheDocument()
  })

  it('PFCL-03: مفتاح صالح ← RPC ← failed يعرض رسالة فشل آمنة', async () => {
    localStorage.setItem(STORAGE_KEY, RESUMED_KEY)
    const db = makeDb(() => Promise.resolve({ data: [{ status: 'failed', amount: 20, currency: 'SAR', updated_at: '2026-08-27T10:00:00Z' }], error: null }))
    renderCallback({ db })
    await waitFor(() => expect(screen.getByText('تعذّر إتمام الدفع')).toBeInTheDocument())
  })

  it('PFCL-03b: status=cancelled يُعامَل كفشل (failed-equivalent)', async () => {
    localStorage.setItem(STORAGE_KEY, RESUMED_KEY)
    const db = makeDb(() => Promise.resolve({ data: [{ status: 'cancelled', amount: 20, currency: 'SAR', updated_at: '2026-08-27T10:00:00Z' }], error: null }))
    renderCallback({ db })
    await waitFor(() => expect(screen.getByText('تعذّر إتمام الدفع')).toBeInTheDocument())
  })

  it('PFCL-04: مفتاح غير معروف (RPC نجحت، صف فارغ) ⇒ UNKNOWN، مختلفة عن FAILED', async () => {
    localStorage.setItem(STORAGE_KEY, RESUMED_KEY)
    const db = makeDb(() => Promise.resolve({ data: [], error: null }))
    renderCallback({ db })
    await waitFor(() => expect(screen.getByText('لم يتم العثور على هذه المحاولة')).toBeInTheDocument())
    expect(screen.queryByText('تعذّر إتمام الدفع')).not.toBeInTheDocument()
  })

  it('PFCL-07: خطأ من RPC نفسه (error field) ⇒ RETRYABLE_ERROR', async () => {
    localStorage.setItem(STORAGE_KEY, RESUMED_KEY)
    const db = makeDb(() => Promise.resolve({ data: null, error: { message: 'network issue' } }))
    renderCallback({ db })
    await waitFor(() => expect(screen.getByText('حدث خطأ تقني أثناء التحقق')).toBeInTheDocument())
  })

  it('PFCL-07b: استثناء من db.rpc نفسها (رمي بدل رفض) ⇒ RETRYABLE_ERROR بلا انهيار', async () => {
    localStorage.setItem(STORAGE_KEY, RESUMED_KEY)
    const db = makeDb(() => { throw new Error('unexpected') })
    renderCallback({ db })
    await waitFor(() => expect(screen.getByText('حدث خطأ تقني أثناء التحقق')).toBeInTheDocument())
  })

  it('PFCL-08: لا استدعاء مباشر لـpayment_transactions أو .from() في الملف — RPC فقط', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/features/menu/PaymentFirstCallbackLanding.jsx'), 'utf8')
    expect(src).not.toMatch(/\.from\(\s*['"]payment_transactions['"]\s*\)/)
  })

  it('PFCL-09: لا استيراد لـMoyasar، ولا استدعاء fetch مباشر في الملف', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/features/menu/PaymentFirstCallbackLanding.jsx'), 'utf8')
    const importLines = src.split('\n').filter((l) => l.trim().startsWith('import'))
    expect(importLines.join('\n')).not.toMatch(/moyasar/i)
    expect(src).not.toMatch(/\bfetch\(/)
  })

  it('PFCL-10: لا استيراد أو استدعاء لـstartCheckout/initiatePaymentFirstCheckout في الملف', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/features/menu/PaymentFirstCallbackLanding.jsx'), 'utf8')
    const importLines = src.split('\n').filter((l) => l.trim().startsWith('import'))
    expect(importLines.join('\n')).not.toMatch(/startCheckout|initiatePaymentFirstCheckout|checkoutOrchestration/i)
  })

  it('PFCL-11: المفتاح المحفوظ يبقى كما هو بعد الحل — لا setItem جديد، لا مفتاح مختلف', async () => {
    localStorage.setItem(STORAGE_KEY, RESUMED_KEY)
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    const db = makeDb(() => Promise.resolve({ data: [{ status: 'succeeded', amount: 10, currency: 'SAR', updated_at: '2026-08-27T10:00:00Z' }], error: null }))
    renderCallback({ db })
    await waitFor(() => expect(db.rpc).toHaveBeenCalled())
    expect(setItemSpy).not.toHaveBeenCalled()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(RESUMED_KEY)
    setItemSpy.mockRestore()
  })

  it('PFCL-12: providerRef/معرّفات داخلية لا تُعرَض حتى لو وُجدت في استجابة RPC (دفاعي)', async () => {
    localStorage.setItem(STORAGE_KEY, RESUMED_KEY)
    const db = makeDb(() => Promise.resolve({
      data: [{ status: 'succeeded', amount: 10, currency: 'SAR', updated_at: '2026-08-27T10:00:00Z', provider_ref: 'pay_leak_test_999', id: 'internal-tx-id-leak' }],
      error: null,
    }))
    const { container } = renderCallback({ db })
    await waitFor(() => expect(screen.getByText('تم تأكيد الدفع بنجاح')).toBeInTheDocument())
    expect(container.textContent).not.toContain('pay_leak_test_999')
    expect(container.textContent).not.toContain('internal-tx-id-leak')
  })

  it('PFCL-13: الاستقصاء محدود — لا يتجاوز الحد الأقصى للمحاولات مهما طال البقاء في pending', async () => {
    localStorage.setItem(STORAGE_KEY, RESUMED_KEY)
    vi.useFakeTimers()
    const db = makeDb(() => Promise.resolve({ data: [{ status: 'pending', amount: 10, currency: 'SAR', updated_at: '2026-08-27T10:00:00Z' }], error: null }))
    renderCallback({ db })

    await vi.waitFor(() => expect(db.rpc).toHaveBeenCalledTimes(1))
    // تقديم الوقت بما يكفي لعدة دورات استقصاء (أكثر بكثير من الحد الأقصى المفترض)
    for (let i = 0; i < 8; i++) {
      await vi.advanceTimersByTimeAsync(3100)
    }
    const callsAfterLongWait = db.rpc.mock.calls.length
    expect(callsAfterLongWait).toBeGreaterThan(1) // فعلاً استقصى أكثر من مرة
    expect(callsAfterLongWait).toBeLessThanOrEqual(6) // المحاولة الأولى + 5 محاولات استقصاء كحد أقصى — أبداً بلا حدود

    // مزيد من الوقت لا يزيد عدد الاستدعاءات أكثر (توقّف فعلي، لا استمرار خفي)
    await vi.advanceTimersByTimeAsync(20000)
    expect(db.rpc.mock.calls.length).toBe(callsAfterLongWait)
  })

  it('PFCL-13b: زر "إعادة التحقق" بعد استنفاد الاستقصاء يُعيد محاولة واحدة يدوية إضافية', async () => {
    localStorage.setItem(STORAGE_KEY, RESUMED_KEY)
    vi.useFakeTimers()
    const db = makeDb(() => Promise.resolve({ data: [{ status: 'pending', amount: 10, currency: 'SAR', updated_at: '2026-08-27T10:00:00Z' }], error: null }))
    renderCallback({ db })
    for (let i = 0; i < 8; i++) {
      await vi.advanceTimersByTimeAsync(3100)
    }
    const exhaustedCalls = db.rpc.mock.calls.length
    const retryBtn = await vi.waitFor(() => screen.getByRole('button', { name: 'إعادة التحقق' }))
    vi.useRealTimers()
    fireEvent.click(retryBtn)
    await waitFor(() => expect(db.rpc.mock.calls.length).toBe(exhaustedCalls + 1))
  })

  it('PFCL-14: "رجوع للمنيو" في MISSING_KEY يستدعي onRecover', async () => {
    const onRecover = vi.fn()
    renderCallback({ onRecover })
    await waitFor(() => expect(screen.getByRole('button', { name: '← العودة للمنيو' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '← العودة للمنيو' }))
    expect(onRecover).toHaveBeenCalledTimes(1)
  })

  it('PFCL-15: onSucceeded يُستدعى مرة واحدة عند الوصول لـsucceeded، مع بيانات الصف فقط', async () => {
    localStorage.setItem(STORAGE_KEY, RESUMED_KEY)
    const onSucceeded = vi.fn()
    const db = makeDb(() => Promise.resolve({ data: [{ status: 'succeeded', amount: 10, currency: 'SAR', updated_at: '2026-08-27T10:00:00Z' }], error: null }))
    renderCallback({ db, onSucceeded })
    await waitFor(() => expect(onSucceeded).toHaveBeenCalledTimes(1))
    expect(onSucceeded).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded', amount: 10 }))
  })
})
