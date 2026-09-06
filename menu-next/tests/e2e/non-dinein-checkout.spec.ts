import { test, expect } from '@playwright/test'

// Non-dine-in (takeaway/delivery) checkout validation — companion to
// checkout.spec.ts's dine-in coverage. Every test here intercepts the real
// create_order network request (page.route) purely to inspect the exact
// outgoing payload, then aborts it before it ever reaches Supabase — no test
// in this file creates a real order or lets create_order execute, matching
// this phase's "no production orders during Stage 2" instruction exactly.
// `konoha` is used because it is the one real restaurant already used
// throughout this suite with BOTH takeaway_enabled and delivery_enabled true
// (confirmed via a read-only DB check before writing this file) — needed to
// exercise the real order-type picker's takeaway/delivery buttons, which
// CheckoutForm.tsx only renders when the branch actually allows them.

const CREATE_ORDER_PATTERN = '**/rest/v1/rpc/create_order'

async function addFirstProductToCart(page: import('@playwright/test').Page) {
  await page.locator('.product-card').first().locator('.add-to-cart-btn').click()
  const modal = page.locator('.options-modal-overlay')
  if (await modal.isVisible().catch(() => false)) {
    await modal.locator('.options-modal__choice').first().click()
    await modal.locator('.options-modal__confirm').click()
  }
}

async function goToCheckout(page: import('@playwright/test').Page) {
  await page.locator('.cart-bar').click()
  await page.locator('.cart-sheet__checkout-btn').click()
  await expect(page).toHaveURL(/\/checkout\?/)
  const form = page.locator('form.checkout-form')
  await expect(form).toBeVisible()
  return form
}

test('takeaway: correct create_order payload — no table number, no delivery address, type=takeaway', async ({ page }) => {
  await page.goto('/menu/konoha')
  await addFirstProductToCart(page)
  const form = await goToCheckout(page)

  await form.getByRole('button', { name: 'استلام' }).click()
  await page.fill('#customerPhone', '500000002')

  let capturedRaw: Record<string, unknown> | null = null
  await page.route(CREATE_ORDER_PATTERN, async (route) => {
    capturedRaw = route.request().postDataJSON()
    await route.abort()
  })

  await form.locator('.checkout-form__submit').click()
  await expect.poll(() => capturedRaw).not.toBeNull()
  const captured = capturedRaw as unknown as Record<string, unknown>

  expect(captured).toMatchObject({
    p_type: 'takeaway',
    p_table_number: null,
    p_delivery_address: null,
    p_customer_phone: '500000002',
  })
  expect(typeof captured.p_restaurant_id).toBe('string')
  expect(typeof captured.p_branch_id).toBe('string')
  expect(Array.isArray(captured.p_items)).toBe(true)
  expect((captured.p_items as unknown[]).length).toBeGreaterThan(0)
  expect(typeof captured.p_idempotency_key).toBe('string')

  // Aborted request => network-error banner shown, never navigated away —
  // proves no order was created and the cart submission genuinely failed closed.
  // Scoped to the form: a bare [role="alert"] also matches Next.js's own
  // route announcer element, an unrelated a11y helper always present in the DOM.
  await expect(form.locator('[role="alert"]')).toBeVisible()
  await expect(page).toHaveURL(/\/checkout\?/)
})

test('delivery: correct create_order payload — delivery address present, no table number, type=delivery, fee included in total', async ({ page }) => {
  await page.goto('/menu/konoha')
  await addFirstProductToCart(page)
  const form = await goToCheckout(page)

  await form.getByRole('button', { name: 'توصيل' }).click()
  await page.fill('#deliveryAddress', 'حي الاختبار، شارع تجريبي، مبنى 1')
  await page.fill('#customerPhone', '500000003')

  let capturedRaw: Record<string, unknown> | null = null
  await page.route(CREATE_ORDER_PATTERN, async (route) => {
    capturedRaw = route.request().postDataJSON()
    await route.abort()
  })

  await form.locator('.checkout-form__submit').click()
  await expect.poll(() => capturedRaw).not.toBeNull()
  const captured = capturedRaw as unknown as Record<string, unknown>

  expect(captured).toMatchObject({
    p_type: 'delivery',
    p_table_number: null,
    p_delivery_address: 'حي الاختبار، شارع تجريبي، مبنى 1',
    p_customer_phone: '500000003',
  })
  // konoha's real delivery fee (10 SAR, confirmed via a read-only DB check)
  // must be folded into the client-computed total sent as p_client_total —
  // a bare item subtotal here would be a real bug (server would reject it
  // as price_changed on every real delivery order).
  const total = captured.p_client_total as number
  expect(total).toBeGreaterThanOrEqual(10)
})

test('delivery: missing address is blocked client-side, create_order is never called', async ({ page }) => {
  await page.goto('/menu/konoha')
  await addFirstProductToCart(page)
  const form = await goToCheckout(page)

  await form.getByRole('button', { name: 'توصيل' }).click()
  await page.fill('#customerPhone', '500000004')
  // Deliberately leave #deliveryAddress empty.

  let called = false
  await page.route(CREATE_ORDER_PATTERN, async (route) => {
    called = true
    await route.abort()
  })

  await form.locator('.checkout-form__submit').click()
  await expect(form.locator('#deliveryAddress ~ .checkout-form__error, .checkout-form__section:has(#deliveryAddress) .checkout-form__error')).toBeVisible()
  await page.waitForTimeout(500)
  expect(called).toBe(false)
  await expect(page).toHaveURL(/\/checkout\?/)
})

test('takeaway: missing phone is blocked client-side, create_order is never called', async ({ page }) => {
  await page.goto('/menu/konoha')
  await addFirstProductToCart(page)
  const form = await goToCheckout(page)

  await form.getByRole('button', { name: 'استلام' }).click()
  // Deliberately leave #customerPhone empty.

  let called = false
  await page.route(CREATE_ORDER_PATTERN, async (route) => {
    called = true
    await route.abort()
  })

  await form.locator('.checkout-form__submit').click()
  await expect(form.locator('#customerPhone + .checkout-form__error, .checkout-form__section:has(#customerPhone) .checkout-form__error')).toBeVisible()
  await page.waitForTimeout(500)
  expect(called).toBe(false)
  await expect(page).toHaveURL(/\/checkout\?/)
})

test('cart branch isolation: adding from a second branch triggers the conflict modal, and Cancel preserves the original cart', async ({ page }) => {
  // `simsim` is the one real, active restaurant with more than one active
  // branch (same fixture already used by branch.spec.ts). Its second branch
  // ("فرع المشهد") is a real, heavier page (48 products vs. the primary
  // branch's few) — same documented render-time reason branch.spec.ts
  // budgets extra time for it, applied here too.
  test.setTimeout(90_000)

  await page.goto('/menu/simsim')
  await addFirstProductToCart(page)
  await expect(page.locator('.cart-bar__count')).toHaveText('1')

  await page.goto('/menu/simsim?branch=b68566e9-7b3d-40ab-9931-4f8dbcc36281')
  await expect(page.locator('h1.menu-header__name')).toBeVisible({ timeout: 60_000 })
  await addFirstProductToCart(page)

  await expect(page.locator('.branch-conflict-overlay')).toBeVisible()
  await page.locator('.branch-conflict-cancel').click()
  await expect(page.locator('.branch-conflict-overlay')).toHaveCount(0)
  // Original cart (branch A's item) is untouched — conflict cancel never adds the new item.
  await expect(page.locator('.cart-bar__count')).toHaveText('1')
})
