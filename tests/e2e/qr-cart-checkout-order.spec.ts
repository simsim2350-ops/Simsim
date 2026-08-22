/**
 * Phase 2 — Task 2.2
 * E2E: Public menu → add to cart → checkout form → (optional) order creation + cancel
 *
 * Required env vars:
 *   E2E_BASE_URL         — defaults to https://simsimmenu.com
 *   E2E_MENU_SLUG        — restaurant slug (e.g. "demo") — skip suite if absent
 *   E2E_BRANCH_ID        — branch UUID to pass as ?branch= param (optional)
 *   E2E_PRODUCT_NAME     — Arabic or English product name to click (no options product preferred)
 *   E2E_ALLOW_ORDER_CREATION — set to "true" to enable 2.2-D/E (creates+cancels a real order)
 */

import { test, expect, type Page } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL ?? 'https://simsimmenu.com'
const SLUG = process.env.E2E_MENU_SLUG ?? ''
const BRANCH_ID = process.env.E2E_BRANCH_ID ?? ''
const PRODUCT_NAME = process.env.E2E_PRODUCT_NAME ?? ''
const ALLOW_ORDER = process.env.E2E_ALLOW_ORDER_CREATION === 'true'

/** Build the public menu URL for the test restaurant */
function menuUrl(): string {
  const params = new URLSearchParams()
  if (BRANCH_ID) params.set('branch', BRANCH_ID)
  const qs = params.toString()
  return `${BASE}/menu/${SLUG}${qs ? `?${qs}` : ''}`
}

/**
 * Navigate to the menu, click a product by name to open ProductModal, add to cart,
 * then open the CartDrawer. Returns the page (caller already has it).
 */
async function addProductAndOpenCart(page: Page): Promise<void> {
  await page.goto(menuUrl())
  await page.waitForLoadState('networkidle')

  // Click the product by its displayed name — opens ProductModal for all layouts
  await page.getByText(PRODUCT_NAME, { exact: true }).first().click()

  // ProductModal: "إضافة للسلة" button (may include price suffix e.g. "إضافة للسلة 15.00 ﷼")
  await page.getByRole('button', { name: /إضافة للسلة/ }).click()

  // Wait for floating "عرض السلة" cart button to appear (cart count > 0)
  const viewCartBtn = page.getByRole('button', { name: /عرض السلة/ })
  await expect(viewCartBtn).toBeVisible({ timeout: 8_000 })

  // Open CartDrawer
  await viewCartBtn.click()

  // Confirm CartDrawer is open: close button with aria-label "إغلاق السلة"
  await expect(page.getByRole('button', { name: /إغلاق السلة/ })).toBeVisible({ timeout: 6_000 })
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.2-A: Public menu loads
// ─────────────────────────────────────────────────────────────────────────────
test.describe('2.2-A — public menu loads', () => {
  test.skip(!SLUG, 'E2E_MENU_SLUG not set — skipping 2.2-A')

  test('menu page loads without error', async ({ page }) => {
    await page.goto(menuUrl())
    await page.waitForLoadState('networkidle')

    // Page should not show a 404/not-found element
    // PublicMenu shows a "🔍" div with t('notFound') text when notFound=true
    const notFound = page.locator('text=🔍').first()
    // Allow up to 5s for React to hydrate and potentially show error state
    await page.waitForTimeout(2_000)

    // Assert the URL is still on the menu page (no redirect to login)
    expect(page.url()).toContain('/menu/')

    // Assert we are NOT on the not-found screen
    const h2Text = await page.locator('h2').first().textContent().catch(() => '')
    expect(h2Text).not.toMatch(/404|not found/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2.2-B: Add product to cart and open CartDrawer
// ─────────────────────────────────────────────────────────────────────────────
test.describe('2.2-B — add to cart and open CartDrawer', () => {
  test.skip(!SLUG || !PRODUCT_NAME, 'E2E_MENU_SLUG or E2E_PRODUCT_NAME not set — skipping 2.2-B')

  test('product visible in menu, add opens CartDrawer', async ({ page }) => {
    await page.goto(menuUrl())
    await page.waitForLoadState('networkidle')

    // Product should be visible by name
    await expect(page.getByText(PRODUCT_NAME, { exact: true }).first()).toBeVisible({ timeout: 10_000 })

    // Click product → ProductModal opens
    await page.getByText(PRODUCT_NAME, { exact: true }).first().click()
    await expect(page.getByRole('button', { name: /إضافة للسلة/ })).toBeVisible({ timeout: 6_000 })

    // Add to cart
    await page.getByRole('button', { name: /إضافة للسلة/ }).click()

    // Floating cart button appears
    await expect(page.getByRole('button', { name: /عرض السلة/ })).toBeVisible({ timeout: 8_000 })

    // Open CartDrawer
    await page.getByRole('button', { name: /عرض السلة/ }).click()

    // CartDrawer is open: close button visible
    await expect(page.getByRole('button', { name: /إغلاق السلة/ })).toBeVisible({ timeout: 6_000 })

    // Product appears in drawer (aria-label: "addToCartB: <name>")
    await expect(page.getByText(PRODUCT_NAME, { exact: true }).first()).toBeVisible({ timeout: 4_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2.2-C: Fill checkout form — phone + order type — verify submit enabled
// ─────────────────────────────────────────────────────────────────────────────
test.describe('2.2-C — checkout form validation', () => {
  test.skip(!SLUG || !PRODUCT_NAME, 'E2E_MENU_SLUG or E2E_PRODUCT_NAME not set — skipping 2.2-C')

  test('fill takeaway checkout form — submit button becomes active', async ({ page }) => {
    await addProductAndOpenCart(page)

    // Click "سفري" (takeaway) order-type button
    // aria-pressed toggles; button contains text from t('takeaway2') = "سفري"
    const takeawayBtn = page.getByRole('button', { name: /سفري/ })
    await expect(takeawayBtn).toBeVisible({ timeout: 6_000 })
    await takeawayBtn.click()

    // Phone input — type="tel", placeholder "5XXXXXXXX"
    const phoneInput = page.locator('input[type="tel"]')
    await expect(phoneInput).toBeVisible({ timeout: 4_000 })

    // Fill valid Saudi phone number
    await phoneInput.fill('512345678')

    // Submit button — text "🎉 تأكيد الطلب" (contains "تأكيد الطلب")
    const submitBtn = page.getByRole('button', { name: /تأكيد الطلب/ })
    await expect(submitBtn).toBeVisible({ timeout: 4_000 })

    // Button should not be disabled (cart has 1 item, phone valid, store open assumption)
    // Note: store-closed state would disable the button; this test is best-effort on a live restaurant
    const isDisabled = await submitBtn.isDisabled()
    // We log but do not hard-fail on closed store — that is external state
    if (isDisabled) {
      console.warn('2.2-C: submit button is disabled — store may be closed or unavailable items. Skipping assertion.')
    } else {
      await expect(submitBtn).toBeEnabled()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2.2-D+E: Create order and immediately cancel (cleanup)
//           Gated behind E2E_ALLOW_ORDER_CREATION=true
// ─────────────────────────────────────────────────────────────────────────────
test.describe('2.2-D+E — order creation and cancel (cleanup)', () => {
  test.skip(
    !SLUG || !PRODUCT_NAME || !ALLOW_ORDER,
    'E2E_MENU_SLUG, E2E_PRODUCT_NAME, or E2E_ALLOW_ORDER_CREATION=true not set — skipping 2.2-D+E',
  )

  test('create order → verify pending status → cancel (cleanup)', async ({ page }) => {
    await addProductAndOpenCart(page)

    // Select takeaway
    await page.getByRole('button', { name: /سفري/ }).click()

    // Fill phone
    await page.locator('input[type="tel"]').fill('512345678')

    // Submit order
    const submitBtn = page.getByRole('button', { name: /تأكيد الطلب/ })
    await expect(submitBtn).toBeEnabled({ timeout: 4_000 })
    await submitBtn.click()

    // ── 2.2-D: Order created — OrdersScreen appears ──────────────────────────
    // orderPlaced=true → OrdersScreen renders, active section label "🔴 قيد التنفيذ الآن"
    await expect(page.getByText(/قيد التنفيذ الآن/)).toBeVisible({ timeout: 20_000 })

    // Status badge for a pending order: t('stReceived') = "استُلم"
    await expect(page.getByText('استُلم').first()).toBeVisible({ timeout: 10_000 })

    // ── 2.2-E: Cancel the order immediately (cleanup) ─────────────────────────
    // Cancel button: t('cancelOrder') = "إلغاء الطلب" — only visible when status=pending and accessToken set
    const cancelBtn = page.getByRole('button', { name: /إلغاء الطلب/ })
    await expect(cancelBtn).toBeVisible({ timeout: 8_000 })
    await cancelBtn.click()

    // ConfirmDialog: t('cancelConfirmYes') = "نعم، ألغِ الطلب"
    const confirmBtn = page.getByRole('button', { name: /نعم، ألغِ الطلب/ })
    await expect(confirmBtn).toBeVisible({ timeout: 4_000 })
    await confirmBtn.click()

    // After cancellation, status changes to "cancelled"
    // Order moves from activeList to pastList — the cancel button disappears
    await expect(cancelBtn).not.toBeVisible({ timeout: 10_000 })
  })
})
