// @vitest-environment happy-dom
//
// StaffLogin lockout UX — mirrors Login.test.jsx's core scenarios for the
// staff login form, keyed on the actual constructed account_key
// (`${username}.${slug}@staff.simsim.app`) rather than a raw email field.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup, screen, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import StaffLogin from './StaffLogin'

const { mockSignIn, mockFetchRestaurant, mockToastError, mockToastSuccess, mockNavigate, mockFrom, mockGetUser, mockSignOut } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockFetchRestaurant: vi.fn().mockResolvedValue(null),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockNavigate: vi.fn(),
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
  mockSignOut: vi.fn().mockResolvedValue({}),
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ signIn: mockSignIn, fetchRestaurant: mockFetchRestaurant }),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    auth: { getUser: mockGetUser, signOut: mockSignOut },
  },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign((...args) => {}, { error: mockToastError, success: mockToastSuccess }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function chain(resolvedValue) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve(resolvedValue),
  }
  return builder
}

function renderStaffLogin() {
  return render(
    <MemoryRouter initialEntries={['/staff-login/simsim']}>
      <Routes>
        <Route path="/staff-login/:slug" element={<StaffLogin />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  mockFrom.mockImplementation((table) => {
    if (table === 'restaurants') return chain({ data: { name: 'سمسم', logo_url: null, brand_color: '#FF6A00', slug: 'simsim' } })
    if (table === 'restaurant_members') return chain({ data: { allowed_pages: ['all'], is_active: true } })
    return chain({ data: null })
  })
  mockGetUser.mockResolvedValue({ data: { user: { id: 'staff-1' } } })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function fillAndSubmit(username, password) {
  fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: username } })
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: password } })
  fireEvent.submit(screen.getByPlaceholderText('username').closest('form'))
}

describe('StaffLogin — تسجيل دخول طبيعي', () => {
  it('بيانات صحيحة → نجاح وتوجيه', async () => {
    mockSignIn.mockResolvedValue({})
    renderStaffLogin()
    await waitFor(() => expect(screen.getByPlaceholderText('username')).toBeInTheDocument())
    await act(async () => { await fillAndSubmit('waiter1', 'CorrectPass123!') })
    expect(mockSignIn).toHaveBeenCalledWith('waiter1.simsim@staff.simsim.app', 'CorrectPass123!')
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled())
  })
})

describe('StaffLogin — القفل بعد 5 محاولات فاشلة', () => {
  it('المحاولات 1-4 بدون قفل، والخامسة تُظهر رسالة القفل وتعطّل الزر', async () => {
    mockSignIn.mockRejectedValue(new Error('Invalid login credentials'))
    renderStaffLogin()
    await waitFor(() => expect(screen.getByPlaceholderText('username')).toBeInTheDocument())

    for (let i = 1; i <= 4; i++) {
      await act(async () => { await fillAndSubmit('waiter1', 'wrong') })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    }
    await act(async () => { await fillAndSubmit('waiter1', 'wrong') })
    expect(mockSignIn).toHaveBeenCalledTimes(5)
    expect(screen.getByRole('alert')).toHaveTextContent('محاولات تسجيل الدخول كثيرة')
    expect(screen.getByRole('button', { name: /غير متاح مؤقتاً/ })).toBeDisabled()
  })

  it('محاولة أثناء القفل لا تصل إلى signIn، وبعد انتهاء القفل تعود تعمل', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockSignIn.mockRejectedValue(new Error('Invalid login credentials'))
    renderStaffLogin()
    await act(async () => { await Promise.resolve() }) // flush initial restaurant fetch

    for (let i = 1; i <= 5; i++) {
      await act(async () => { await fillAndSubmit('waiter1', 'wrong') })
    }
    expect(mockSignIn).toHaveBeenCalledTimes(5)

    await act(async () => { await fillAndSubmit('waiter1', 'now-correct') })
    expect(mockSignIn).toHaveBeenCalledTimes(5) // لم يصل السادس

    await act(async () => { vi.advanceTimersByTime(15 * 60 * 1000 + 1000) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    mockSignIn.mockResolvedValueOnce({})
    await act(async () => { await fillAndSubmit('waiter1', 'CorrectPass123!') })
    expect(mockSignIn).toHaveBeenCalledTimes(6)
  })
})
