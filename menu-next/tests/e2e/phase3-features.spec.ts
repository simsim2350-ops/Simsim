import { test, expect } from '@playwright/test'

// Phase 3 — functional parity migration (Loyalty, Coupons, Smart Cart
// Recommendations, Multi-Order Tracking, Post-Order Rating, WhatsApp-about-
// order, Reorder). Like checkout.spec.ts, this suite never calls create_order
// (no real order is ever placed against real restaurant data) — where a
// feature only activates once a real order exists (My Orders, Reorder,
// Rating, WhatsApp), a realistic-but-synthetic order record is injected
// directly into localStorage instead (via addInitScript, before the page
// under test ever loads), using real branch/product ids so Reorder's
// product-matching query still exercises the real, unchanged products table.
// cancel_order_by_customer/submit_review are never invoked against this
// synthetic record (its accessToken is null, which the app's own guard
// clauses already short-circuit before any RPC call).
//
// Coupon/cart-sheet checks use `konoha` — the same restaurant checkout.spec.ts
// already uses for product-card interaction, kept for consistency. My Orders
// checks use `simsim`, the one active restaurant with a real phone on file,
// needed to verify the WhatsApp button uses real data, not a placeholder.

const KONOHA = 'konoha'
const SIMSIM = 'simsim'
const SIMSIM_BRANCH_ID = 'd61f2cdf-883c-4f12-8898-7e9b47a7e354'
const SIMSIM_PRODUCT_ID = '53de5d1d-0b05-4aba-8cda-b7c4f9c71689'

test('coupon field shows a client-side error for an invalid code, without submitting the order', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  await page.locator('.product-card').first().locator('.add-to-cart-btn').click()
  const modal = page.locator('.options-modal-overlay')
  if (await modal.isVisible().catch(() => false)) {
    await modal.locator('.options-modal__choice').first().click()
    await modal.locator('.options-modal__confirm').click()
  }
  await page.locator('.cart-bar').click()
  await page.locator('.cart-sheet__checkout-btn').click()

  const form = page.locator('form.checkout-form')
  await expect(form).toBeVisible()
  await form.locator('#couponCode').fill('NOTAREALCODE123')
  await form.locator('.checkout-form__coupon-apply').click()
  await expect(form.locator('.checkout-form__section:has(#couponCode) .checkout-form__error')).toBeVisible({ timeout: 15000 })
  await expect(form.locator('.checkout-form__submit')).not.toHaveText(/submitting|جارٍ إرسال/i)
})

test('cart sheet with an item renders without crashing (recommendations row optional)', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  await page.locator('.product-card').first().locator('.add-to-cart-btn').click()
  const modal = page.locator('.options-modal-overlay')
  if (await modal.isVisible().catch(() => false)) {
    await modal.locator('.options-modal__choice').first().click()
    await modal.locator('.options-modal__confirm').click()
  }
  await page.locator('.cart-bar').click()
  await expect(page.locator('.cart-sheet')).toBeVisible()
  await expect(page.locator('pre, .error-stack')).toHaveCount(0)
})

test('header exposes a My Orders entry point', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  const link = page.locator(`a[href="/menu/${KONOHA}/orders"]`)
  await expect(link).toBeVisible()
  await link.scrollIntoViewIfNeeded()
  await link.click({ force: true })
  await expect(page).toHaveURL(new RegExp(`/menu/${KONOHA}/orders`))
})

test('My Orders page: empty state with no crash', async ({ page }) => {
  await page.addInitScript((slug) => localStorage.removeItem(`simsim_orders_${slug}`), SIMSIM)
  await page.goto(`/menu/${SIMSIM}/orders`)
  await expect(page.locator('.my-orders')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('pre, .error-stack')).toHaveCount(0)
})

test('My Orders: a completed synthetic order shows reorder, rating, and WhatsApp; reorder adds real items to the cart', async ({ page }) => {
  const order = {
    id: 'e2e-test-completed-order',
    orderNumber: 'E2E-TEST-1',
    status: 'completed',
    items: [{ id: SIMSIM_PRODUCT_ID, qty: 2, unavailable: false }],
    total: 10,
    tableNumber: null,
    createdAt: Date.now(),
    accessToken: null,
    branchId: SIMSIM_BRANCH_ID,
  }
  await page.addInitScript(
    ({ slug, order }) => localStorage.setItem(`simsim_orders_${slug}`, JSON.stringify([order])),
    { slug: SIMSIM, order }
  )

  await page.goto(`/menu/${SIMSIM}/orders`)
  const card = page.locator('.my-orders__card').first()
  await expect(card).toBeVisible({ timeout: 15000 })
  await expect(card.locator('.my-orders__reorder-btn')).toBeVisible()
  await expect(card.locator('.my-orders__star')).toHaveCount(5)
  // simsim (the restaurant, not just the app) has a real phone on file — the
  // WhatsApp button must render using it, not a placeholder.
  const waLink = card.locator('.my-orders__wa-btn')
  await expect(waLink).toBeVisible()
  await expect(waLink).toHaveAttribute('href', /^https:\/\/wa\.me\/966551804564\?text=/)

  await card.locator('.my-orders__reorder-btn').click()
  await expect(page).toHaveURL(new RegExp(`/menu/${SIMSIM}(\\?|$)`), { timeout: 15000 })
  await expect(page.locator('.cart-bar')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.cart-bar__count')).toHaveText('2')
})

test('My Orders: a pending synthetic order (no access token) shows a cancel button that no-ops safely', async ({ page }) => {
  const order = {
    id: 'e2e-test-pending-order',
    orderNumber: 'E2E-TEST-2',
    status: 'pending',
    items: [{ id: SIMSIM_PRODUCT_ID, qty: 1, unavailable: false }],
    total: 5,
    tableNumber: '3',
    createdAt: Date.now(),
    accessToken: null,
    branchId: SIMSIM_BRANCH_ID,
  }
  await page.addInitScript(
    ({ slug, order }) => localStorage.setItem(`simsim_orders_${slug}`, JSON.stringify([order])),
    { slug: SIMSIM, order }
  )

  await page.goto(`/menu/${SIMSIM}/orders`)
  const card = page.locator('.my-orders__card').first()
  await expect(card).toBeVisible({ timeout: 15000 })
  const cancelBtn = card.locator('.my-orders__cancel-btn')
  await expect(cancelBtn).toBeVisible()
  await cancelBtn.click()
  // No accessToken -> cancelOrderByCustomer's own guard returns 'failed'
  // before any network call; the order must remain exactly as it was, not
  // silently flip to cancelled on a client-only guess.
  await expect(card.locator('.my-orders__status--pending')).toBeVisible()
})
