// @vitest-environment happy-dom
//
// Phase 2 of the Orders.jsx coverage remediation (see
// SIMSIM_ORDERS_COVERAGE_REMEDIATION_TEST_PLAN.md and
// SIMSIM_ORDERS_COVERAGE_PHASE_1_EXECUTION_REPORT.md). Integration-level tests
// for the default-exported Orders() page itself — rendering and the
// business-critical async order actions — kept separate from
// Orders.ordercard.test.jsx (OrderCard-only) and Orders.remount.test.jsx
// (the DOM-identity regression test), per the plan's own guidance.
//
// This is the first test file in the repo to render Orders() as a page, so
// it builds its own minimal mocking infrastructure below (Supabase, authStore,
// AppShell, react-hot-toast, fetchBranches) rather than reusing an existing
// pattern that doesn't yet exist for this scope.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Orders() registers a page-wide `click`/`touchstart` listener (unlockAudio,
// Orders.jsx ~258-268) to unlock Web Audio on first user interaction — real
// production behavior, unrelated to anything under test here, but happy-dom
// has no AudioContext implementation and that listener has no try/catch (only
// playNewOrderSound/playReadySound do). Without this stub, ANY fireEvent.click
// anywhere in these tests throws. Stubbed here (test-file only) rather than
// touching Orders.jsx's real, unrelated production code.
beforeEach(() => {
  window.AudioContext = vi.fn(function FakeAudioContext() {
    this.state = 'suspended'
    this.resume = vi.fn()
    this.currentTime = 0
    this.createOscillator = () => ({ type: '', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() })
    this.createGain = () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() })
    this.destination = {}
  })
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

// ---- Supabase mock ----------------------------------------------------
// Orders() uses two shapes of supabase.from('orders') calls: a fetch chain
// (.select().eq().order().limit(N), awaited directly with no extra terminal
// call) and update chains (.update().eq()[.eq()|.in()].select(), also awaited
// directly). The real @supabase/supabase-js query builder is itself thenable
// at any point in the chain — every method below returns the same chainable
// object, and that object implements .then() so `await` resolves correctly
// regardless of which method was called last. Each resolution pops the next
// queued response, in the order supabase.from(...) chains are actually
// invoked by the code under test — this lets a single test control a
// sequence of distinct calls (e.g. advanceOrder's update, then its
// conflict-path re-fetch) without mocking away the real branching logic.
const { mockSupabase, queueSupabaseResponse, resetSupabaseMock, triggerRealtimeEvent } = vi.hoisted(() => {
  let queue = []
  let realtimeCallback = null

  function nextResponse() {
    return queue.length > 0 ? queue.shift() : { data: null, error: null }
  }

  function makeChain() {
    const chain = {}
    const chainId = Math.random().toString(36).slice(2, 7)
    for (const method of ['select', 'eq', 'order', 'limit', 'update', 'in', 'single']) {
      chain[method] = (...args) => { console.log('[CI-TRACE]', Date.now(), chainId, method, JSON.stringify(args)); return chain }
    }
    chain.then = (resolve, reject) => {
      console.log('[CI-TRACE]', Date.now(), chainId, 'then-called, queue-len-before-pop:', queue.length)
      return Promise.resolve(nextResponse()).then(
        (v) => { console.log('[CI-TRACE]', Date.now(), chainId, 'resolved:', JSON.stringify(v)); return resolve(v) },
        (e) => { console.log('[CI-TRACE]', Date.now(), chainId, 'rejected:', String(e)); return reject(e) },
      )
    }
    return chain
  }

  const mockSupabase = {
    from: () => makeChain(),
    channel: () => {
      const ch = {
        on: (_event, _filter, cb) => { realtimeCallback = cb; return ch },
        subscribe: () => ch,
      }
      return ch
    },
    removeChannel: () => {},
  }

  return {
    mockSupabase,
    queueSupabaseResponse: (res) => queue.push(res),
    resetSupabaseMock: () => { queue = []; realtimeCallback = null },
    triggerRealtimeEvent: (payload) => realtimeCallback?.(payload),
  }
})

vi.mock('../lib/supabase', () => ({ supabase: mockSupabase }))

// ---- authStore mock -----------------------------------------------------
// Orders() destructures { user, restaurant } from useAuthStore() but only
// ever reads restaurant.id (verified: `grep -n "\\buser\\b" src/pages/Orders.jsx`
// shows no other use of `user`). AppShell's own (separate) useAuthStore()
// usage never runs — AppShell itself is mocked below.
//
// The returned object must be referentially STABLE across renders — the real
// Zustand useAuthStore() returns the same store object reference between
// renders unless the underlying store state actually changes. A fresh object
// literal here (as this used to be) breaks that contract: Orders.jsx's
// useEffect(..., [restaurant]) treats a new reference as a changed dependency
// on every single render, re-firing fetchOrders()/subscribeOrders() each
// time — which then races the test's own queued Supabase responses on the
// shared response queue above. See SIMSIM_PR415_CI_DIAGNOSTIC_REPORT.md for
// the full investigation (this was confirmed locally: instrumenting the
// mock's supabase.from(...) calls showed extra, unintended fetchOrders()
// calls interleaved with the test's own intentional calls until this exact
// fix — a stable reference via vi.hoisted — was applied).
const { authValue } = vi.hoisted(() => ({
  authValue: { user: { id: 'user-1' }, restaurant: { id: 'restaurant-1', name: 'Test Restaurant' } },
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: () => authValue,
}))

// ---- AppShell pass-through mock ------------------------------------------
// AppShell pulls in nav permissions, feature flags, and NotificationsBell —
// none of that is in scope for testing Orders() itself. This stub still
// renders `title`, `actions`, and `children` (Orders() puts its mute/view
// buttons and live-order badges in `actions`/`title`, not `children`), so
// Orders()'s own output stays fully queryable.
vi.mock('../components/AppShell', () => ({
  default: ({ title, actions, children }) => (
    <div>
      <div>{title}</div>
      <div>{actions}</div>
      <div>{children}</div>
    </div>
  ),
}))

// ---- fetchBranches mock ---------------------------------------------------
vi.mock('../lib/branchesApi', () => ({ fetchBranches: vi.fn().mockResolvedValue([]) }))

// ---- react-hot-toast mock ---------------------------------------------------
// showUndo() calls the base `toast(...)` callable (render-prop form) on the
// advanceOrder/acceptFromBanner/acceptAllNew *success* paths; error paths
// call `toast.error(...)`. Both are asserted on below.
const mockToast = vi.hoisted(() => {
  const fn = vi.fn((...args) => { console.log('[CI-TRACE]', Date.now(), 'toast() base called', typeof args[0], JSON.stringify(args[1])) })
  fn.success = vi.fn((...args) => { console.log('[CI-TRACE]', Date.now(), 'toast.success', JSON.stringify(args)) })
  fn.error = vi.fn((...args) => { console.log('[CI-TRACE]', Date.now(), 'toast.error', JSON.stringify(args)) })
  fn.dismiss = vi.fn()
  return fn
})
vi.mock('react-hot-toast', () => ({ toast: mockToast }))

afterEach(() => {
  resetSupabaseMock()
  mockToast.mockClear()
  mockToast.success.mockClear()
  mockToast.error.mockClear()
  mockToast.dismiss.mockClear()
})

import Orders from './Orders.jsx'

const order = (overrides = {}) => ({
  id: `order-${Math.random().toString(36).slice(2)}`,
  status: 'pending',
  order_number: '#0001',
  created_at: new Date().toISOString(),
  items: [{ name: 'شباتي', qty: 1, emoji: '🍽️' }],
  total: 25,
  type: 'dine_in',
  customer_name: 'زبون تجريبي',
  ...overrides,
})

// Renders Orders() with a given initial `orders` fetch result. The first
// queued Supabase response always answers the mount-time fetchOrders() call.
function renderOrdersPage(initialOrders = []) {
  queueSupabaseResponse({ data: initialOrders, error: null })
  return render(
    <MemoryRouter>
      <Orders />
    </MemoryRouter>
  )
}

describe('Orders() — loading state (ORDERS-COV-040)', () => {
  it('shows the loading spinner before the initial fetch resolves', () => {
    const { getByText } = renderOrdersPage([])
    // Asserted synchronously, before the queued fetch promise's microtask
    // resolves — `loading` is still its initial `true` value at this point.
    expect(getByText('جارٍ التحميل...')).toBeInTheDocument()
  })

  it('replaces the spinner with the page content once the fetch resolves', async () => {
    const { getByText, findByText } = renderOrdersPage([])
    expect(getByText('جارٍ التحميل...')).toBeInTheDocument()
    // "🔥 النشطة (0)" is the default filter tab, only rendered once loading=false.
    await findByText(/🔥 النشطة/)
  })
})

describe('Orders() — empty state (ORDERS-COV-041)', () => {
  it('shows an empty-column message per visible Kanban column and no order cards, without crashing', async () => {
    const { findByText, getAllByText, queryByText } = renderOrdersPage([])
    await findByText(/🔥 النشطة/)

    // Default filter='active' → visibleCols = COLS minus 'completed' = pending/preparing/ready (3 columns).
    const emptyMessages = getAllByText('لا توجد طلبات')
    expect(emptyMessages).toHaveLength(3)
    expect(queryByText('#0001')).not.toBeInTheDocument()
  })
})

describe('Orders() — Kanban column placement (ORDERS-COV-042)', () => {
  it('places each order under its own status column, in the default (active) filter view', async () => {
    const pendingOrder = order({ status: 'pending', order_number: '#1001' })
    const preparingOrder = order({ status: 'preparing', order_number: '#1002' })
    const readyOrder = order({ status: 'ready', order_number: '#1003' })
    const completedOrder = order({ status: 'completed', order_number: '#1004' })
    const cancelledOrder = order({ status: 'cancelled', order_number: '#1005' })

    const { findByText, getByText, queryByText } = renderOrdersPage([
      pendingOrder, preparingOrder, readyOrder, completedOrder, cancelledOrder,
    ])
    await findByText(/🔥 النشطة/)

    // colOrders(key) strictly filters `o.status === key`, so an order can only
    // ever render under its own status's column — a match here is sufficient
    // proof of correct placement, not merely presence.
    expect(getByText('#1001')).toBeInTheDocument()
    expect(getByText('#1002')).toBeInTheDocument()
    expect(getByText('#1003')).toBeInTheDocument()

    // Default filter is 'active' → visibleCols excludes 'completed' entirely,
    // and 'cancelled' only appears under its own filter tab — neither column
    // is rendered at all in this view, so neither order's card can appear.
    expect(queryByText('#1004')).not.toBeInTheDocument()
    expect(queryByText('#1005')).not.toBeInTheDocument()
  })

  it('shows completed and cancelled orders once the "الكل" (all) filter tab is selected', async () => {
    const completedOrder = order({ status: 'completed', order_number: '#2001' })
    const cancelledOrder = order({ status: 'cancelled', order_number: '#2002' })

    const { findByText, getByText } = renderOrdersPage([completedOrder, cancelledOrder])
    await findByText(/🔥 النشطة/)

    fireEvent.click(getByText(/📋 الكل/))

    expect(getByText('#2001')).toBeInTheDocument()
    expect(getByText('#2002')).toBeInTheDocument()
  })
})

describe('Orders() — advanceOrder (ORDERS-COV-020/021/022, the PHASE-7-adjacent concurrency guard)', () => {
  it('020 — success: shows the success (undo) toast, not an error', async () => {
    console.log('[CI-TRACE]', Date.now(), '=== TEST 020 START (control) ===')
    const pendingOrder = order({ status: 'pending', order_number: '#3001' })
    const { getByRole, findByText } = renderOrdersPage([pendingOrder])
    await findByText(/🔥 النشطة/)

    // Second queued response answers advanceOrder's own .update().eq().eq().select() call.
    queueSupabaseResponse({ data: [{ ...pendingOrder, status: 'preparing' }], error: null })
    console.log('[CI-TRACE]', Date.now(), '020: about to click advance button')
    fireEvent.click(getByRole('button', { name: '✓ قبول وتحضير' }))
    console.log('[CI-TRACE]', Date.now(), '020: fireEvent.click returned')

    // showUndo() calls the base toast(renderProp, { duration: 60000 }) callable —
    // distinct from toast.error/.success, so its presence alone proves success.
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.any(Function), { duration: 60000 }))
    expect(mockToast.error).not.toHaveBeenCalled()
  })

  it('021 — conflict (order already changed): shows the specific "cancelled by customer" message, no false success, order leaves the active board', async () => {
    const pendingOrder = order({ status: 'pending', order_number: '#3002' })
    const { getByRole, findByText, queryByText } = renderOrdersPage([pendingOrder])
    await findByText(/🔥 النشطة/)

    // First response: the update matches no row (status already changed underneath it).
    queueSupabaseResponse({ data: [], error: null })
    // Second response: advanceOrder's own re-fetch reveals why.
    queueSupabaseResponse({ data: { ...pendingOrder, status: 'cancelled' } })

    fireEvent.click(getByRole('button', { name: '✓ قبول وتحضير' }))

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('🚫 هذا الطلب أُلغي من الزبون قبل قبوله'))
    expect(mockToast).not.toHaveBeenCalled() // no success (render-prop) toast fired

    // advanceOrder's conflict path calls setOrders() directly with the
    // re-fetched row (no Realtime needed for this particular path) — a
    // cancelled order isn't in the default 'active' filter's visible columns.
    await waitFor(() => expect(queryByText('#3002')).not.toBeInTheDocument())
  })

  it('022 — unexpected error: shows the generic fallback message, order stays put, page does not crash', async () => {
    console.log('[CI-TRACE]', Date.now(), '=== TEST 022 START ===')
    const pendingOrder = order({ status: 'pending', order_number: '#3003' })
    const { getByRole, findByText, getByText } = renderOrdersPage([pendingOrder])
    await findByText(/🔥 النشطة/)

    queueSupabaseResponse({ data: null, error: { message: 'network error' } })
    console.log('[CI-TRACE]', Date.now(), '022: about to click advance button')
    fireEvent.click(getByRole('button', { name: '✓ قبول وتحضير' }))
    console.log('[CI-TRACE]', Date.now(), '022: fireEvent.click returned')

    // transitionErrorMessage's generic-fallback branch (Orders.jsx ~37-38, the
    // one PHASE-7-adjacent branch not reachable via any pending-transition
    // test elsewhere) — a real, non-"invalid_order_transition" error message.
    // Bounded timeout bump (RTL default 1000ms → 3000ms), this assertion only:
    // observed flaky on GitHub Actions CI (Node 20) though never locally
    // (Node 24) even across repeated runs — the CI failure surfaces as
    // Vitest's own global per-test timeout rather than waitFor's own faster,
    // more specific timeout error, consistent with the underlying async chain
    // being correct but occasionally slower to settle under CI's scheduling
    // than this fixed budget allowed for. See
    // SIMSIM_PR415_CI_FLAKINESS_FIX_REPORT.md for the full investigation.
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('⚠️ حدث خطأ غير متوقع — حاول مرة أخرى'), { timeout: 3000 })
    expect(mockToast).not.toHaveBeenCalled()
    // Page did not crash — the order's own card is still rendered.
    expect(getByText('#3003')).toBeInTheDocument()
  })
})

// acceptFromBanner/acceptAllNew are only reachable through the new-order
// banner, whose `queue` state is populated exclusively by the Realtime INSERT
// handler (verified: no other code path calls setQueue with new items). There
// is no real WebSocket here — this invokes the exact callback function
// Orders() itself registered via supabase.channel().on(...), synchronously,
// with a synthetic payload. This is the same technique
// SIMSIM_ORDERS_COVERAGE_REMEDIATION_TEST_PLAN.md's Mocking Strategy
// section prescribed, not a WebSocket/network test.
describe('Orders() — acceptFromBanner (ORDERS-COV-023, a PHASE-7-documented fix)', () => {
  it('success: accepts the order from the banner and shows the order-specific success message', async () => {
    const { findByText, getByText, queryByText } = renderOrdersPage([])
    await findByText(/🔥 النشطة/)

    const newOrder = order({ status: 'pending', order_number: '#4001' })
    act(() => { triggerRealtimeEvent({ eventType: 'INSERT', new: newOrder }) })
    await waitFor(() => expect(getByText('قبول ✓')).toBeInTheDocument())

    queueSupabaseResponse({ data: [{ ...newOrder, status: 'preparing' }], error: null })
    fireEvent.click(getByText('قبول ✓'))

    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('👨‍🍳 تم قبول #4001'))
    expect(mockToast.error).not.toHaveBeenCalled()
    // The banner itself is dismissed immediately (dismissFromQueue), regardless of the outcome.
    expect(queryByText('قبول ✓')).not.toBeInTheDocument()
  })

  it('conflict: the customer already cancelled — the banner-specific message fires, not a false success', async () => {
    const { findByText, getByText } = renderOrdersPage([])
    await findByText(/🔥 النشطة/)

    const newOrder = order({ status: 'pending', order_number: '#4002' })
    act(() => { triggerRealtimeEvent({ eventType: 'INSERT', new: newOrder }) })
    await waitFor(() => expect(getByText('قبول ✓')).toBeInTheDocument())

    queueSupabaseResponse({ data: [], error: null }) // no matching row (already changed)
    fireEvent.click(getByText('قبول ✓'))

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('🚫 الطلب #4002 أُلغي من الزبون قبل قبوله'))
    expect(mockToast.success).not.toHaveBeenCalled()
  })
})

describe('Orders() — acceptAllNew (ORDERS-COV-024, a PHASE-7-documented fix)', () => {
  it('partial success: some orders accepted, some not — the count-specific message fires, not a blanket success', async () => {
    console.log('[CI-TRACE]', Date.now(), '=== TEST PARTIAL START ===')
    const { findByText, getByText } = renderOrdersPage([])
    await findByText(/🔥 النشطة/)

    const orderA = order({ status: 'pending', order_number: '#5001' })
    const orderB = order({ status: 'pending', order_number: '#5002' })
    const orderC = order({ status: 'pending', order_number: '#5003' })
    act(() => {
      triggerRealtimeEvent({ eventType: 'INSERT', new: orderA })
      triggerRealtimeEvent({ eventType: 'INSERT', new: orderB })
      triggerRealtimeEvent({ eventType: 'INSERT', new: orderC })
    })
    await waitFor(() => expect(getByText(/قبول الكل \(3\)/)).toBeInTheDocument())
    console.log('[CI-TRACE]', Date.now(), 'partial: banner shows (3), about to queue+click')

    // Only 2 of the 3 rows still matched status='pending' by the time the update ran.
    queueSupabaseResponse({ data: [{ ...orderA, status: 'preparing' }, { ...orderB, status: 'preparing' }], error: null })
    fireEvent.click(getByText(/قبول الكل \(3\)/))
    console.log('[CI-TRACE]', Date.now(), 'partial: fireEvent.click returned')

    // Bounded timeout bump — same CI-only flakiness as the 022 test above,
    // see SIMSIM_PR415_CI_FLAKINESS_FIX_REPORT.md.
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('👨‍🍳 تم قبول 2 من 3 طلب — تحقّق من الباقي'), { timeout: 3000 })
    expect(mockToast.error).not.toHaveBeenCalled()
  })

  it('zero accepted: none of the queued orders matched anymore — shows the failure message, not success', async () => {
    console.log('[CI-TRACE]', Date.now(), '=== TEST ZERO START ===')
    const { findByText, getByText } = renderOrdersPage([])
    await findByText(/🔥 النشطة/)

    const orderA = order({ status: 'pending', order_number: '#5004' })
    const orderB = order({ status: 'pending', order_number: '#5005' })
    act(() => {
      triggerRealtimeEvent({ eventType: 'INSERT', new: orderA })
      triggerRealtimeEvent({ eventType: 'INSERT', new: orderB })
    })
    await waitFor(() => expect(getByText(/قبول الكل \(2\)/)).toBeInTheDocument())
    console.log('[CI-TRACE]', Date.now(), 'zero: banner shows (2), about to queue+click')

    queueSupabaseResponse({ data: [], error: null })
    fireEvent.click(getByText(/قبول الكل \(2\)/))
    console.log('[CI-TRACE]', Date.now(), 'zero: fireEvent.click returned')

    // Bounded timeout bump — same CI-only flakiness as the 022 test above,
    // see SIMSIM_PR415_CI_FLAKINESS_FIX_REPORT.md.
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('🚫 تعذّر قبول الطلبات — تحقّق من الشاشة'), { timeout: 3000 })
    expect(mockToast.success).not.toHaveBeenCalled()
  })
})
