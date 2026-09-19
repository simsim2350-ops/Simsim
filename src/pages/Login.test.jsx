// @vitest-environment happy-dom
//
// Dashboard login lockout UX — covers the scenarios required for the
// Migration 5.1 UX layer: normal login, wrong-password attempts 1-4 unchanged,
// the 5th attempt surfacing the lockout notice, the button/HTTP guard during
// the local countdown, countdown expiry, and that the enumeration-safe
// server contract (identical rejection every time, no new client-visible
// distinction) is never touched by any of this.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Login from './Login'

const { mockSignIn, mockCompleteAuthSession, mockGetSession, mockToastError, mockToastSuccess, mockToast, mockNavigate } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockCompleteAuthSession: vi.fn(),
  mockGetSession: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToast: vi.fn(),
  mockNavigate: vi.fn(),
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ signIn: mockSignIn, completeAuthSession: mockCompleteAuthSession }),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}))

vi.mock('../lib/analytics', () => ({ trackOwnerMilestone: vi.fn() }))

vi.mock('react-hot-toast', () => {
  const fn = (...args) => mockToast(...args)
  fn.error = mockToastError
  fn.success = mockToastSuccess
  return { toast: fn }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  )
}

function fillAndSubmit(email, password) {
  fireEvent.change(screen.getByPlaceholderText('example@restaurant.com'), { target: { value: email } })
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: password } })
  fireEvent.submit(screen.getByPlaceholderText('example@restaurant.com').closest('form'))
}

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  mockGetSession.mockResolvedValue({ data: { session: null } })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Login — تسجيل دخول طبيعي (سيناريو 1)', () => {
  it('بيانات صحيحة → نجاح وتوجيه', async () => {
    mockSignIn.mockResolvedValue({ data: { session: { user: { id: 'u1', user_metadata: {} } } } })
    mockCompleteAuthSession.mockResolvedValue({ restaurant: null, destination: '/dashboard' })
    renderLogin()
    await act(async () => { fillAndSubmit('owner@example.com', 'CorrectPass123!') })
    expect(mockSignIn).toHaveBeenCalledWith('owner@example.com', 'CorrectPass123!')
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Login — كلمة مرور خاطئة (سيناريوهات 2-3-9)', () => {
  it('المحاولات 1-4: السلوك الحالي بدون تغيير، لا رسالة قفل، الزر يبقى مفعّلاً', async () => {
    mockSignIn.mockRejectedValue(new Error('Invalid login credentials'))
    renderLogin()
    for (let i = 1; i <= 4; i++) {
      await act(async () => { fillAndSubmit('owner@example.com', 'wrong') })
      expect(mockSignIn).toHaveBeenCalledTimes(i)
      expect(mockToastError).toHaveBeenCalledWith('البريد أو كلمة المرور غير صحيحة')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    }
    const btn = screen.getByRole('button', { name: /دخول إلى لوحة التحكم/ })
    expect(btn).not.toBeDisabled()
  })

  it('المحاولة الخامسة: تظهر رسالة القفل فوراً، ونفس رسالة الرفض الخارجية (Enumeration)', async () => {
    mockSignIn.mockRejectedValue(new Error('Invalid login credentials'))
    renderLogin()
    for (let i = 1; i <= 5; i++) {
      await act(async () => { fillAndSubmit('owner@example.com', 'wrong') })
    }
    expect(mockSignIn).toHaveBeenCalledTimes(5)
    // كل نداء لـsignIn بنفس البيانات المُدخلة فعلياً — لا فرع خاص أو تخمين من الواجهة.
    for (const call of mockSignIn.mock.calls) {
      expect(call).toEqual(['owner@example.com', 'wrong'])
    }
    // رسالة toast.error الخارجية مطابقة تماماً في كل الخمس محاولات — لا كشف تدريجي لأي معلومة.
    expect(mockToastError.mock.calls.every((c) => c[0] === 'البريد أو كلمة المرور غير صحيحة')).toBe(true)

    expect(screen.getByRole('alert')).toHaveTextContent('محاولات تسجيل الدخول كثيرة')
    expect(screen.getByRole('button', { name: /غير متاح مؤقتاً/ })).toBeDisabled()
  })
})

describe('Login — أثناء القفل (سيناريوهات 4-5-6)', () => {
  it('الزر معطّل فعلياً ولا يُرسل أي طلب HTTP إضافي أثناء العدّاد', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockSignIn.mockRejectedValue(new Error('Invalid login credentials'))
    renderLogin()
    for (let i = 1; i <= 5; i++) {
      await act(async () => { fillAndSubmit('owner@example.com', 'wrong') })
    }
    expect(mockSignIn).toHaveBeenCalledTimes(5)

    // محاولة سادسة أثناء القفل — يجب ألا تصل إلى signIn إطلاقاً (الحارس داخل handleLogin نفسه).
    await act(async () => { fillAndSubmit('owner@example.com', 'maybe-correct-now') })
    expect(mockSignIn).toHaveBeenCalledTimes(5)
    expect(screen.getByRole('button', { name: /غير متاح مؤقتاً/ })).toBeDisabled()
  })

  it('العدّاد يتناقص بصريّاً مع الوقت', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockSignIn.mockRejectedValue(new Error('Invalid login credentials'))
    renderLogin()
    for (let i = 1; i <= 5; i++) {
      await act(async () => { fillAndSubmit('owner@example.com', 'wrong') })
    }
    const before = screen.getByRole('alert').textContent
    await act(async () => { vi.advanceTimersByTime(10_000) })
    const after = screen.getByRole('alert').textContent
    expect(after).not.toBe(before)
  })
})

describe('Login — انتهاء القفل (سيناريوهات 7-8)', () => {
  it('بعد 15 دقيقة: الزر يعود يعمل وتختفي رسالة القفل، ومحاولة جديدة تصل للسيرفر', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockSignIn.mockRejectedValue(new Error('Invalid login credentials'))
    renderLogin()
    for (let i = 1; i <= 5; i++) {
      await act(async () => { fillAndSubmit('owner@example.com', 'wrong') })
    }
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await act(async () => { vi.advanceTimersByTime(15 * 60 * 1000 + 1000) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /دخول إلى لوحة التحكم/ })).not.toBeDisabled()

    mockSignIn.mockResolvedValueOnce({ data: { session: { user: { id: 'u1', user_metadata: {} } } } })
    mockCompleteAuthSession.mockResolvedValue({ restaurant: null, destination: '/dashboard' })
    await act(async () => { fillAndSubmit('owner@example.com', 'CorrectPass123!') })
    expect(mockSignIn).toHaveBeenCalledTimes(6)
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
  })
})

describe('Login — email not confirmed لا يُحتسب كفشل قفل', () => {
  it('كلمة مرور صحيحة لحساب غير مؤكَّد لا تُقدِّم محاولة فاشلة للعدّاد المحلي', async () => {
    mockSignIn
      .mockRejectedValueOnce(new Error('Invalid login credentials'))
      .mockRejectedValueOnce(new Error('Invalid login credentials'))
      .mockRejectedValueOnce(new Error('Invalid login credentials'))
      .mockRejectedValueOnce(new Error('Invalid login credentials'))
      .mockRejectedValueOnce(new Error('Email not confirmed'))
    renderLogin()
    for (let i = 1; i <= 4; i++) {
      await act(async () => { fillAndSubmit('owner@example.com', 'wrong') })
    }
    await act(async () => { fillAndSubmit('owner@example.com', 'CorrectButUnconfirmed1!') })
    // الفشل الخامس هنا هو email_not_confirmed — أي كلمة المرور كانت صحيحة — فلا قفل.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /دخول إلى لوحة التحكم/ })).not.toBeDisabled()
  })
})
