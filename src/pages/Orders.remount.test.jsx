// @vitest-environment happy-dom
//
// Phase 3 root-cause regression test — src/pages/Orders.jsx.
//
// WHAT THIS TESTS: before the Phase 3 fix, OrderCard was defined *inside*
// Orders()'s render body, so every re-render of Orders() (its own
// setInterval(20s) tick or any Realtime event) created a brand-new function
// identity for OrderCard, forcing React to unmount+remount every visible
// order card. This test proves the fix by rendering the (now module-level,
// exported) OrderCard inside a harness that re-renders it exactly the way
// Orders() does on a timer/Realtime tick — passing a NEW `order` object
// reference and changed `now`/`th` props each time — and asserting the
// underlying DOM node's identity survives that re-render, and that a touch
// gesture spanning such a re-render still completes correctly.
//
// WHAT THIS DOES NOT TEST (being explicit per the audit's own standard):
// this does not drive a real browser touch screen, a real Supabase Realtime
// event, or Orders() itself end-to-end — it is a component-level regression
// test against the exact reconciliation mechanism (component identity
// across re-render), not a full browser/E2E reproduction. See
// SIMSIM_PHASE_3_CLOSEOUT_EXECUTION_REPORT.md for that distinction.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { useState } from 'react'

// First RTL-based test in this codebase — no global auto-cleanup is wired
// up (see src/test/setup.js), so each render() would otherwise leak into
// the next test's document.body. Explicit per-test cleanup, same as RTL's
// own documented pattern for setups without the auto-cleanup import.
afterEach(cleanup)

// Orders.jsx imports the real supabase client eagerly at module scope —
// same reason src/components/PrintJobsPanel.test.js mocks it: constructing
// a real client under this test runner throws before any test body runs,
// and OrderCard itself never touches supabase.
vi.mock('../lib/supabase', () => ({ supabase: {} }))

import { OrderCard } from './Orders.jsx'

const baseOrder = {
  id: 'order-1',
  status: 'pending',
  order_number: '#0001',
  created_at: new Date().toISOString(),
  items: [{ name: 'شباتي', qty: 1, emoji: '🍽️' }],
  total: 25,
  type: 'dine_in',
  customer_name: 'زبون تجريبي',
}
const th = { warn: 10, late: 20 }

// Harness mirrors exactly what Orders() does to OrderCard on every tick:
// re-renders with a *new* order object reference and a changed `now`, the
// same shape as the real setInterval(() => setNow(Date.now()), 20000) tick.
function Harness({ onAdvance, onCancel, onSelect }) {
  const [now, setNow] = useState(1_700_000_000_000)
  return (
    <div>
      <button data-testid="simulate-tick" onClick={() => setNow((n) => n + 20_000)}>tick</button>
      <OrderCard
        order={{ ...baseOrder }}
        now={now}
        th={th}
        isVIP={false}
        onAdvance={onAdvance}
        onCancel={onCancel}
        onSelect={onSelect}
      />
    </div>
  )
}

describe('OrderCard — module-level identity survives parent re-render (Phase 3 root-cause fix)', () => {
  it('keeps the same DOM node across a re-render that mirrors the 20s timer/Realtime tick', () => {
    const { getByTestId, container } = render(<Harness onAdvance={() => {}} onCancel={() => {}} onSelect={() => {}} />)
    const cardBefore = container.firstChild.children[1] // OrderCard's own root <div>

    fireEvent.click(getByTestId('simulate-tick')) // forces Orders()-style re-render with new order ref + new now

    const cardAfter = container.firstChild.children[1]
    expect(cardAfter).toBe(cardBefore) // same node = no unmount/remount happened
  })

  it('completes a touch gesture that spans a mid-gesture re-render (simulated tick between touchstart and touchend)', () => {
    const onAdvance = vi.fn()
    const onCancel = vi.fn()
    const { getByTestId, container } = render(
      <Harness onAdvance={onAdvance} onCancel={onCancel} onSelect={() => {}} />
    )
    const card = container.querySelectorAll('div')[1] // outer div wrapping OrderCard's root element

    // touchstart at x=200 (order.status is 'pending', canAdvance is true since STATUS.pending.next='preparing')
    fireEvent.touchStart(card, { touches: [{ clientX: 200, clientY: 100 }] })

    // Mid-gesture: the exact moment a 20s timer tick or a Realtime event would
    // have previously destroyed and recreated this DOM node, resetting the
    // `touch` ref that tracks the gesture back to {x:0,y:0,sw:false}.
    fireEvent.click(getByTestId('simulate-tick'))

    // touchend far to the left (dx = 200-200=0 is wrong on purpose — use a
    // real leftward swipe: start 200, end 100 → dx=-100, |dx|>70, |dy|<40).
    fireEvent.touchEnd(card, { changedTouches: [{ clientX: 100, clientY: 100 }] })

    expect(onAdvance).toHaveBeenCalledTimes(1) // gesture survived the mid-flight re-render
    expect(onCancel).not.toHaveBeenCalled()
  })
})
