// @vitest-environment happy-dom
//
// Phase 1 of the Orders.jsx coverage remediation (see
// SIMSIM_ORDERS_COVERAGE_REMEDIATION_TEST_PLAN.md). Behavior-level tests for
// the exported OrderCard component: what it renders, and what its touch/click
// handlers do — not a re-test of the DOM-identity regression already covered
// by Orders.remount.test.jsx. Kept in its own file per that plan (P1 item —
// avoid growing the remount-regression file into a catch-all).

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)

// Same reason as Orders.remount.test.jsx: Orders.jsx imports the real
// supabase client eagerly at module scope; OrderCard itself never touches it.
vi.mock('../lib/supabase', () => ({ supabase: {} }))

import { OrderCard } from './Orders.jsx'

const NOW = 1_700_000_000_000
const TH = { warn: 10, late: 20 }
const minutesAgo = (mins) => new Date(NOW - mins * 60_000).toISOString()

const baseOrder = {
  id: 'order-1',
  status: 'pending',
  order_number: '#0099',
  created_at: minutesAgo(5),
  items: [{ name: 'شباتي', qty: 1, emoji: '🍽️' }],
  total: 47,
  type: 'dine_in',
  customer_name: 'أحمد',
}

function renderCard(orderOverrides = {}, { isVIP = false, onAdvance = vi.fn(), onCancel = vi.fn(), onSelect = vi.fn() } = {}) {
  const order = { ...baseOrder, ...orderOverrides }
  const utils = render(
    <OrderCard order={order} now={NOW} th={TH} isVIP={isVIP} onAdvance={onAdvance} onCancel={onCancel} onSelect={onSelect} />
  )
  return { ...utils, order, onAdvance, onCancel, onSelect, card: utils.container.firstChild }
}

describe('OrderCard — basic rendering', () => {
  it('shows order number, customer name, items, and total', () => {
    const { getByText } = renderCard({
      order_number: '#0099',
      customer_name: 'أحمد',
      items: [{ name: 'شباتي', qty: 2, emoji: '🍽️' }],
      total: 47,
    })
    expect(getByText('#0099')).toBeInTheDocument()
    expect(getByText('أحمد')).toBeInTheDocument()
    expect(getByText(/شباتي/)).toBeInTheDocument()
    expect(getByText('×2')).toBeInTheDocument()
    expect(getByText('47 ﷼')).toBeInTheDocument()
  })

  // OrderCard has no separate status-label text (NOT FOUND — verified by reading
  // the source: `s.label` is never rendered here, only used for the border color).
  // The order's current status IS represented, via the status-specific action
  // button label (STATUS[order.status].nextLabel).
  it('represents the order status (pending) via the status-specific action button label', () => {
    expect(renderCard({ status: 'pending' }).getByText('✓ قبول وتحضير')).toBeInTheDocument()
  })

  it('represents the order status (preparing) via the status-specific action button label', () => {
    expect(renderCard({ status: 'preparing' }).getByText('✅ جاهز')).toBeInTheDocument()
  })

  it('represents the order status (ready) via the status-specific action button label', () => {
    expect(renderCard({ status: 'ready' }).getByText('🎉 تم التسليم')).toBeInTheDocument()
  })

  it('shows the elapsed-time badge for an active status (preparing)', () => {
    expect(renderCard({ status: 'preparing', created_at: minutesAgo(5) }).getByText('🕐 5 د')).toBeInTheDocument()
  })

  it('does not show the elapsed-time badge for a completed order', () => {
    expect(renderCard({ status: 'completed', created_at: minutesAgo(5) }).queryByText(/🕐/)).not.toBeInTheDocument()
  })

  it('does not show the elapsed-time badge for a cancelled order', () => {
    expect(renderCard({ status: 'cancelled', created_at: minutesAgo(5) }).queryByText(/🕐/)).not.toBeInTheDocument()
  })
})

describe('OrderCard — fresh order classification', () => {
  it('shows a "جديد" badge for a pending order created less than 2 minutes ago', () => {
    expect(renderCard({ status: 'pending', created_at: minutesAgo(1) }).getByText('جديد')).toBeInTheDocument()
  })

  it('does not show "جديد" for a pending order older than 2 minutes', () => {
    expect(renderCard({ status: 'pending', created_at: minutesAgo(5) }).queryByText('جديد')).not.toBeInTheDocument()
  })

  it('does not show "جديد" for a non-pending order even if very recent', () => {
    expect(renderCard({ status: 'preparing', created_at: minutesAgo(1) }).queryByText('جديد')).not.toBeInTheDocument()
  })
})

describe('OrderCard — VIP classification', () => {
  it('shows the VIP star when isVIP is true', () => {
    expect(renderCard({}, { isVIP: true }).getByTitle('عميل VIP')).toBeInTheDocument()
  })

  it('does not show the VIP star when isVIP is false', () => {
    expect(renderCard({}, { isVIP: false }).queryByTitle('عميل VIP')).not.toBeInTheDocument()
  })
})

describe('OrderCard — time classification (fresh/warn/late elapsed-time coloring)', () => {
  it('uses the normal (green-family) color before the warn threshold', () => {
    const { getByText } = renderCard({ status: 'preparing', created_at: minutesAgo(5) })
    expect(getByText('🕐 5 د').getAttribute('style')).toContain('#059669')
  })

  it('uses the warn (amber) color between the warn and late thresholds', () => {
    const { getByText } = renderCard({ status: 'preparing', created_at: minutesAgo(12) })
    expect(getByText('🕐 12 د').getAttribute('style')).toContain('#B45309')
  })

  it('uses the late (red) color, a red card border, and the pulse animation at/after the late threshold', () => {
    const { getByText, card } = renderCard({ status: 'preparing', created_at: minutesAgo(25) })
    expect(getByText('🕐 25 د').getAttribute('style')).toContain('#DC2626')
    expect(card.getAttribute('style')).toContain('#DC2626') // border-right turns red
    expect(card.getAttribute('style')).toContain('latePulse')
  })

  it('does not apply late styling to a non-active status even past the late threshold', () => {
    const { card } = renderCard({ status: 'completed', created_at: minutesAgo(25) })
    expect(card.getAttribute('style')).not.toContain('latePulse')
  })
})

// NOT FOUND: OrderCard has no dedicated "cancel" <button> element (verified by
// reading the source — the only <button> in OrderCard is the status-advance
// action, gated by STATUS[order.status]?.next). Cancellation from OrderCard is
// reachable exclusively via the right-swipe gesture, covered below and under
// "swipe right on a non-pending order". This section instead covers the one
// action button OrderCard does have, and its own real visibility gating.
describe('OrderCard — advance-action button visibility', () => {
  it('shows the advance button when the status has a next transition', () => {
    expect(renderCard({ status: 'pending' }).getByRole('button', { name: '✓ قبول وتحضير' })).toBeInTheDocument()
  })

  it('does not show any action button when the status has no next transition (completed)', () => {
    expect(renderCard({ status: 'completed' }).queryByRole('button')).not.toBeInTheDocument()
  })

  it('does not show any action button for a cancelled order', () => {
    expect(renderCard({ status: 'cancelled' }).queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('OrderCard — swipe right on a pending order', () => {
  it('calls onCancel (not onAdvance) for a rightward swipe on a pending order', () => {
    const onAdvance = vi.fn()
    const onCancel = vi.fn()
    const { card, order } = renderCard({ status: 'pending' }, { onAdvance, onCancel })

    fireEvent.touchStart(card, { touches: [{ clientX: 100, clientY: 100 }] })
    fireEvent.touchEnd(card, { changedTouches: [{ clientX: 200, clientY: 100 }] }) // dx=+100, dy=0

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledWith(order)
    expect(onAdvance).not.toHaveBeenCalled()
  })
})

describe('OrderCard — click to select', () => {
  it('calls onSelect with the order when clicked without a preceding swipe', () => {
    const onSelect = vi.fn()
    const { card, order } = renderCard({}, { onSelect })

    fireEvent.click(card)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(order)
  })
})

// ---- P1 ----

describe('OrderCard — order metadata icons (P1)', () => {
  it('shows the type chip for a non-default order type', () => {
    expect(renderCard({ type: 'delivery' }).getByText('🛵 توصيل')).toBeInTheDocument()
  })

  it('shows the table number for a dine-in order', () => {
    expect(renderCard({ type: 'dine_in', table_name: '5' }).getByText(/طاولة 5/)).toBeInTheDocument()
  })

  it('shows the QR badge when the order source is "qr"', () => {
    expect(renderCard({ source: 'qr' }).getByText(/QR/)).toBeInTheDocument()
  })

  it('shows the coupon icon when the order has a coupon_code', () => {
    expect(renderCard({ coupon_code: 'SAVE10' }).getByTitle('يحتوي كوبون')).toBeInTheDocument()
  })

  it('shows the notes icon and the notes banner text when the order has notes', () => {
    const { getByTitle, getByText } = renderCard({ notes: 'بدون بصل' })
    expect(getByTitle('ملاحظة من الزبون')).toBeInTheDocument()
    expect(getByText(/بدون بصل/)).toBeInTheDocument()
  })
})

describe('OrderCard — items overflow (P1)', () => {
  it('shows only the first 3 items plus a "+N أخرى" summary when there are more than 3', () => {
    const items = [
      { name: 'شباتي', qty: 1 },
      { name: 'كبسة', qty: 1 },
      { name: 'سلطة', qty: 1 },
      { name: 'عصير', qty: 2 },
      { name: 'حلا', qty: 1 },
    ]
    const { getByText, queryByText } = renderCard({ items })
    expect(getByText(/شباتي/)).toBeInTheDocument()
    expect(getByText(/كبسة/)).toBeInTheDocument()
    expect(getByText(/سلطة/)).toBeInTheDocument()
    expect(queryByText(/عصير/)).not.toBeInTheDocument()
    expect(getByText('+2 أصناف أخرى…')).toBeInTheDocument()
  })
})

describe('OrderCard — swipe right on a non-pending order (P1)', () => {
  it('does not call onCancel (or onAdvance) for a rightward swipe when the order is not pending', () => {
    const onAdvance = vi.fn()
    const onCancel = vi.fn()
    const { card } = renderCard({ status: 'preparing' }, { onAdvance, onCancel })

    fireEvent.touchStart(card, { touches: [{ clientX: 100, clientY: 100 }] })
    fireEvent.touchEnd(card, { changedTouches: [{ clientX: 200, clientY: 100 }] })

    expect(onCancel).not.toHaveBeenCalled()
    expect(onAdvance).not.toHaveBeenCalled() // a rightward swipe never advances, regardless of status
  })
})

describe('OrderCard — advance button stops click propagation (P1)', () => {
  it('calls onAdvance and does NOT call onSelect when the advance button is clicked directly', () => {
    const onAdvance = vi.fn()
    const onSelect = vi.fn()
    const { getByRole } = renderCard({ status: 'pending' }, { onAdvance, onSelect })

    fireEvent.click(getByRole('button', { name: '✓ قبول وتحضير' }))

    expect(onAdvance).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
