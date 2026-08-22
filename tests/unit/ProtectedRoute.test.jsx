// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// mock useAuthStore — ProtectedRoute reads from it directly
vi.mock('../../src/store/authStore', () => ({
  useAuthStore: vi.fn(),
}))

import { useAuthStore } from '../../src/store/authStore'
import ProtectedRoute from '../../src/components/ProtectedRoute'

function renderInRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProtectedRoute', () => {
  it('UT-PR-001: يعرض شاشة التحميل (role=status) عندما loading=true', () => {
    useAuthStore.mockReturnValue({
      user: null,
      loading: true,
      authState: 'INITIALIZING',
      authError: null,
      bootstrapStage: 'AUTH_SESSION',
      initialize: vi.fn(),
    })
    renderInRouter(<ProtectedRoute><div>protected</div></ProtectedRoute>)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('protected')).not.toBeInTheDocument()
  })

  it('UT-PR-002: يوجّه إلى /login عندما لا يوجد مستخدم وloading=false', () => {
    useAuthStore.mockReturnValue({
      user: null,
      loading: false,
      authState: 'UNAUTHENTICATED',
      authError: null,
      bootstrapStage: 'AUTH_SESSION',
      initialize: vi.fn(),
    })
    // Navigate يُقدَّم داخل MemoryRouter — لا يمكن التحقق من مسار التوجيه إلا
    // بالتأكد أن المحتوى المحمي لم يُعرَض
    renderInRouter(<ProtectedRoute><div>protected content</div></ProtectedRoute>)
    expect(screen.queryByText('protected content')).not.toBeInTheDocument()
  })

  it('UT-PR-003: يعرض children عندما يكون المستخدم مُصادَقاً وloading=false', () => {
    useAuthStore.mockReturnValue({
      user: { id: 'u1', email: 'owner@example.com' },
      loading: false,
      authState: 'READY',
      authError: null,
      bootstrapStage: 'READY',
      initialize: vi.fn(),
    })
    renderInRouter(<ProtectedRoute><div>dashboard content</div></ProtectedRoute>)
    expect(screen.getByText('dashboard content')).toBeInTheDocument()
  })

  it('UT-PR-004: يعرض شاشة خطأ (role=alert) عندما authState=ERROR', () => {
    useAuthStore.mockReturnValue({
      user: null,
      loading: false,
      authState: 'ERROR',
      authError: { code: 'BOOTSTRAP_FAILED' },
      bootstrapStage: 'ERROR',
      initialize: vi.fn(),
    })
    renderInRouter(<ProtectedRoute><div>protected</div></ProtectedRoute>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('protected')).not.toBeInTheDocument()
  })
})
