/**
 * Phase 2 — Task 2.3
 * E2E: Staff login → orders view → status update
 *
 * Staff login uses a synthesized email: {username}.{slug}@staff.simsim.app
 * Credentials must come from env vars — never hard-coded.
 *
 * Required env vars:
 *   E2E_BASE_URL              — defaults to https://simsimmenu.com
 *   E2E_STAFF_SLUG            — restaurant slug (e.g. "demo") — used in /staff-login/:slug URL
 *   E2E_STAFF_USERNAME        — staff account username (login form field)
 *   E2E_STAFF_PASSWORD        — staff account password
 *   E2E_TEST_ORDER_NUMBER     — order_number value to search for (e.g. "1001") — required for 2.3-C
 *   E2E_TEST_ORDER_INITIAL_STATUS — expected initial status: "pending"|"preparing"|"ready" (default: "pending")
 *   E2E_ALLOW_STATUS_UPDATE   — set to "true" to enable 2.3-D+E (advances status + undoes within 60s)
 *
 * Owner actions required before running:
 *   1. Create a staff account in Supabase Auth + restaurant_members with 'orders' in allowed_pages
 *   2. Provide a test order in known initial status via E2E_TEST_ORDER_NUMBER
 *   3. Set GitHub Actions secrets for the above env vars
 */

import { test, expect, type Page } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL ?? 'https://simsimmenu.com'
const STAFF_SLUG = process.env.E2E_STAFF_SLUG ?? ''
const STAFF_USERNAME = process.env.E2E_STAFF_USERNAME ?? ''
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? ''
const TEST_ORDER_NUMBER = process.env.E2E_TEST_ORDER_NUMBER ?? ''
const INITIAL_STATUS = process.env.E2E_TEST_ORDER_INITIAL_STATUS ?? 'pending'
const ALLOW_STATUS_UPDATE = process.env.E2E_ALLOW_STATUS_UPDATE === 'true'

/** Staff status model — mirrors Orders.jsx STATUS constant */
const STATUS_LABEL: Record<string, string> = {
  pending:   'انتظار',
  preparing: 'قيد التحضير',
  ready:     'جاهز',
  completed: 'مكتمل',
  cancelled: 'ملغي',
}

/** Advance button label for each status — mirrors STATUS[x].nextLabel */
const STATUS_NEXT_LABEL: Record<string, string> = {
  pending:   'قبول وتحضير',   // full: "✓ قبول وتحضير"
  preparing: 'جاهز',           // full: "✅ جاهز"
  ready:     'تم التسليم',     // full: "🎉 تم التسليم"
}

/** Toast message after advancing — mirrors msgs in advanceOrder() */
const STATUS_ADVANCE_TOAST: Record<string, string> = {
  preparing: 'بدأ التحضير',
  ready:     'الطلب جاهز',
  completed: 'تم التسليم',
}

const hasStaffCreds = !!(STAFF_SLUG && STAFF_USERNAME && STAFF_PASSWORD)
const hasOrderNumber = hasStaffCreds && !!TEST_ORDER_NUMBER
const hasStatusUpdate = hasOrderNumber && ALLOW_STATUS_UPDATE

/**
 * Log in as staff via /staff-login/:slug.
 * StaffLogin.jsx form:
 *   - username field: input[placeholder="username"] (no type, direction:ltr)
 *   - password field: input[type="password"]
 *   - submit button: button[type="submit"] with text "دخول ←"
 * After successful login: redirected away from /staff-login (to /orders if allowed)
 */
async function staffLogin(page: Page): Promise<void> {
  await page.goto(`${BASE}/staff-login/${STAFF_SLUG}`)
  await page.waitForLoadState('domcontentloaded')
  // Wait for restaurant info to load (the login card renders after fetching restaurant by slug)
  await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 10_000 })
  await page.locator('input[placeholder="username"]').fill(STAFF_USERNAME)
  await page.locator('input[type="password"]').fill(STAFF_PASSWORD)
  await page.locator('button[type="submit"]').click()
  // After login: navigates away from staff-login (to /orders or first allowed page)
  await expect(page).not.toHaveURL(/\/staff-login/, { timeout: 15_000 })
}

/**
 * Log in as staff and navigate to /orders.
 * After login the staff is usually auto-redirected to /orders, but we navigate explicitly to be safe.
 */
async function staffLoginAndGoToOrders(page: Page): Promise<void> {
  await staffLogin(page)
  if (!page.url().includes('/orders')) {
    await page.goto(`${BASE}/orders`)
  }
  await page.waitForLoadState('networkidle')
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.3-A: Staff login
// ─────────────────────────────────────────────────────────────────────────────
test.describe('2.3-A — staff login', () => {
  test.skip(!hasStaffCreds, 'E2E_STAFF_SLUG, E2E_STAFF_USERNAME, or E2E_STAFF_PASSWORD not set — skipping 2.3-A')

  test('staff login succeeds and redirects away from /staff-login', async ({ page }) => {
    await page.goto(`${BASE}/staff-login/${STAFF_SLUG}`)
    await page.waitForLoadState('domcontentloaded')

    // Restaurant card loads — "دخول الموظفين" eyebrow text visible
    await expect(page.getByText('دخول الموظفين')).toBeVisible({ timeout: 10_000 })

    // Submit button visible before filling
    await expect(page.locator('button[type="submit"]')).toBeVisible()

    // Fill form
    await page.locator('input[placeholder="username"]').fill(STAFF_USERNAME)
    await page.locator('input[type="password"]').fill(STAFF_PASSWORD)
    await page.locator('button[type="submit"]').click()

    // Should redirect away from /staff-login
    await expect(page).not.toHaveURL(/\/staff-login/, { timeout: 15_000 })

    // Should NOT show error state (notFound div with 🔍)
    const url = page.url()
    expect(url).not.toContain('/staff-login')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2.3-B: Orders page renders
// ─────────────────────────────────────────────────────────────────────────────
test.describe('2.3-B — orders page loads after staff login', () => {
  test.skip(!hasStaffCreds, 'Staff credentials not set — skipping 2.3-B')

  test('orders page renders with search box and kanban/table view', async ({ page }) => {
    await staffLoginAndGoToOrders(page)

    // Orders page: search input with distinctive placeholder
    const searchInput = page.locator('input[placeholder="🔍 بحث برقم الطلب/العميل/الجوال"]')
    await expect(searchInput).toBeVisible({ timeout: 10_000 })

    // Filter tabs visible — "🔥 النشطة" or "📋 الكل" tab
    await expect(page.getByText(/الكل|النشطة/)).toBeVisible({ timeout: 6_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2.3-C: Search for test order, open detail modal, verify status
// ─────────────────────────────────────────────────────────────────────────────
test.describe('2.3-C — find test order and verify status in detail modal', () => {
  test.skip(!hasOrderNumber, 'E2E_TEST_ORDER_NUMBER or staff credentials not set — skipping 2.3-C')

  test('search order by number, open modal, verify initial status', async ({ page }) => {
    await staffLoginAndGoToOrders(page)

    // Switch to "all" tab to see orders regardless of active/completed state
    // Tab text: "📋 الكل (...)" — click by partial text
    await page.getByText(/📋 الكل/).click()

    // Type order number in search box
    const searchInput = page.locator('input[placeholder="🔍 بحث برقم الطلب/العميل/الجوال"]')
    await searchInput.fill(TEST_ORDER_NUMBER)

    // Order card appears in kanban — order_number text visible
    await expect(page.getByText(TEST_ORDER_NUMBER, { exact: true }).first()).toBeVisible({ timeout: 8_000 })

    // Click the order card to open detail modal
    // Kanban card: onClick={() => setSelectedOrder(order)} — clicking order_number span bubbles up
    await page.getByText(TEST_ORDER_NUMBER, { exact: true }).first().click()

    // Detail modal opens — order number appears in modal header (a second occurrence)
    // Modal also shows the status badge: STATUS[order.status].label
    await expect(page.getByText(TEST_ORDER_NUMBER, { exact: true })).toHaveCount(2, { timeout: 6_000 })

    // Verify status badge shows the expected initial status label
    const expectedLabel = STATUS_LABEL[INITIAL_STATUS] || STATUS_LABEL.pending
    // The status badge is in the modal header alongside the order number
    // Use last() to avoid matching the kanban column header which may have similar text
    await expect(page.getByText(expectedLabel).last()).toBeVisible({ timeout: 6_000 })

    // If status has a next step: advance button should be visible in modal
    if (STATUS_NEXT_LABEL[INITIAL_STATUS]) {
      const advanceRegex = new RegExp(STATUS_NEXT_LABEL[INITIAL_STATUS])
      // There may be 2 buttons (kanban card + modal) — both are valid; just check one is visible
      await expect(page.getByRole('button', { name: advanceRegex }).first()).toBeVisible({ timeout: 4_000 })
    }

    // Close modal by clicking ✕ button
    await page.getByRole('button', { name: '✕' }).click()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2.3-D+E: Advance order status + undo within 60s (cleanup)
//           Gated behind E2E_ALLOW_STATUS_UPDATE=true
// ─────────────────────────────────────────────────────────────────────────────
test.describe('2.3-D+E — advance order status + undo (cleanup)', () => {
  test.skip(
    !hasStatusUpdate,
    'E2E_TEST_ORDER_NUMBER, staff credentials, or E2E_ALLOW_STATUS_UPDATE=true not set — skipping 2.3-D+E',
  )

  test('advance order status then undo — net zero production change', async ({ page }) => {
    // Guard: only pending, preparing, ready have a valid next step
    if (!STATUS_NEXT_LABEL[INITIAL_STATUS]) {
      console.warn(`2.3-D+E: status "${INITIAL_STATUS}" has no next step — cannot advance. Skipping.`)
      test.skip()
      return
    }

    await staffLoginAndGoToOrders(page)

    // Switch to "all" to ensure order is visible regardless of active/completed filter
    await page.getByText(/📋 الكل/).click()

    // Search for test order
    const searchInput = page.locator('input[placeholder="🔍 بحث برقم الطلب/العميل/الجوال"]')
    await searchInput.fill(TEST_ORDER_NUMBER)
    await expect(page.getByText(TEST_ORDER_NUMBER, { exact: true }).first()).toBeVisible({ timeout: 8_000 })

    // Open detail modal
    await page.getByText(TEST_ORDER_NUMBER, { exact: true }).first().click()
    await expect(page.getByText(TEST_ORDER_NUMBER, { exact: true })).toHaveCount(2, { timeout: 6_000 })

    // Verify initial status label before advancing
    const initialLabel = STATUS_LABEL[INITIAL_STATUS]
    await expect(page.getByText(initialLabel).last()).toBeVisible({ timeout: 6_000 })

    // ── 2.3-D: Advance the order status ───────────────────────────────────────
    // The advance button in the modal shows STATUS[order.status].nextLabel
    // Both the kanban card and the modal have this button — use .last() to target modal
    const advanceRegex = new RegExp(STATUS_NEXT_LABEL[INITIAL_STATUS])
    const advanceBtn = page.getByRole('button', { name: advanceRegex })
    await expect(advanceBtn.first()).toBeVisible({ timeout: 4_000 })
    // Click the LAST instance = modal button (modal rendered after kanban DOM)
    await advanceBtn.last().click()

    // Wait for undo toast to appear — confirms DB update succeeded
    // showUndo() renders a toast with "↩ تراجع" button (duration: 60s)
    const undoBtn = page.getByRole('button', { name: /تراجع/ })
    await expect(undoBtn).toBeVisible({ timeout: 10_000 })

    // Verify the advance button for the NEW status is now visible in modal
    // (realtime subscription updates selectedOrder → modal re-renders with new status)
    // After pending→preparing, next advance shows "✅ جاهز"
    const nextStatus = INITIAL_STATUS === 'pending' ? 'preparing'
      : INITIAL_STATUS === 'preparing' ? 'ready'
      : INITIAL_STATUS === 'ready' ? 'completed'
      : null
    if (nextStatus && STATUS_NEXT_LABEL[nextStatus]) {
      const nextAdvanceRegex = new RegExp(STATUS_NEXT_LABEL[nextStatus])
      await expect(page.getByRole('button', { name: nextAdvanceRegex }).first()).toBeVisible({ timeout: 10_000 })
    }

    // ── 2.3-E: Undo the status change within 60s (cleanup) ───────────────────
    // The toast undo button reverts: nextStatus → INITIAL_STATUS
    // state_machine allows undo transitions within 60s (ADR-50/D-09)
    await undoBtn.click()

    // Wait for undo success toast: "تم التراجع ↩"
    await expect(page.getByText(/تم التراجع/)).toBeVisible({ timeout: 10_000 })

    // Verify original advance button is back in modal (status restored)
    await expect(page.getByRole('button', { name: advanceRegex }).first()).toBeVisible({ timeout: 10_000 })
  })
})
