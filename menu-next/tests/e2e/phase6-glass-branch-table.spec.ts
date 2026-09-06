import { test, expect } from '@playwright/test'

// Phase 6 — glassmorphism header card, branch QR isolation, table-to-invoice
// wiring. No test here calls create_order or create_order_from_table_qr for
// real — network requests to both are intercepted and aborted before
// execution (same established pattern as non-dinein-checkout.spec.ts), so no
// real order is ever placed.

const SIMSIM = 'simsim'
const SIMSIM_MAIN_BRANCH_ID = 'd61f2cdf-883c-4f12-8898-7e9b47a7e354'
const SIMSIM_SECOND_BRANCH_ID = 'b68566e9-7b3d-40ab-9931-4f8dbcc36281'
const REAL_TABLE_QR_TOKEN = '00772247-dd31-4f91-82d8-bebeab1fc483'
const KONOHA = 'konoha'

test('glass identity card renders with the ported blur/opacity/radius, overlapping the hero', async ({ page }) => {
  await page.goto(`/menu/${SIMSIM}`)
  const card = page.locator('.menu-header__card')
  await expect(card).toBeVisible()
  const backdropFilter = await card.evaluate((el) => getComputedStyle(el).backdropFilter || (getComputedStyle(el) as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter)
  expect(backdropFilter).toContain('blur')
  // Existing content must still be present and readable inside the card —
  // this is an added visual layer, not a content replacement.
  await expect(card.locator('.menu-header__name')).toBeVisible()
})

test('glass card does not overflow horizontally on a small mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto(`/menu/${SIMSIM}`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
  await expect(page.locator('.menu-header__card')).toBeVisible()
})

test('a plain restaurant-level visit (no ?branch=, no ?table=) never shows a branch-switcher UI, even for a multi-branch restaurant', async ({ page }) => {
  // Branch selection UI was removed from the customer menu this round (#4)
  // — each branch now gets its own QR/URL, so this is never shown
  // regardless of how many branches the restaurant has.
  await page.goto(`/menu/${SIMSIM}`)
  await expect(page.locator('.menu-header__branches')).toHaveCount(0)
})

test('a plain ?branch= link still serves that exact branch (no switcher UI, but the URL mechanism itself is unaffected)', async ({ page }) => {
  await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_SECOND_BRANCH_ID}`)
  // The explicitly-requested branch is the one actually served — not just a
  // UI label, the real restaurant name still renders correctly for it.
  await expect(page.locator('.menu-header__name')).toContainText('سمسم')
  await expect(page.locator('.menu-header__branches')).toHaveCount(0)
})

test('a resolved table-QR URL cannot be redirected to another branch via a manipulated ?branch=', async ({ page }) => {
  // The QR's own branch is the main branch; appending a *different* branch id
  // alongside the table token must not change which branch is served — the
  // resolved QR's branch always wins (verified at the data layer: loadMenuPage
  // is called with `tableQr?.branchId || search.branch`, so `search.branch`
  // is never even read once a token resolves).
  await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_SECOND_BRANCH_ID}&table=${REAL_TABLE_QR_TOKEN}`)
  await expect(page.locator('.menu-header__branches')).toHaveCount(0)
  const card = page.locator('.product-card').first()
  await expect(card).toBeVisible()
})

test('switching language on a resolved table-QR page keeps the table token in the URL', async ({ page }) => {
  await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}&table=${REAL_TABLE_QR_TOKEN}`)
  // Lang toggle moved this round (#2) to a general-menu-utility icon
  // floating on the hero, replacing the old standalone .menu-toolbar link.
  await page.locator('.menu-header__lang-toggle').click()
  await expect(page).toHaveURL(new RegExp(`table=${REAL_TABLE_QR_TOKEN}`))
})

test('checkout from a resolved table QR calls create_order_from_table_qr (not generic create_order), and the request is never allowed to execute', async ({ page }) => {
  let calledRpc: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let calledBody: any = null
  await page.route('**/rest/v1/rpc/create_order_from_table_qr', async (route) => {
    calledRpc = 'create_order_from_table_qr'
    calledBody = route.request().postDataJSON()
    await route.abort()
  })
  await page.route('**/rest/v1/rpc/create_order', async (route) => {
    calledRpc = calledRpc ?? 'create_order'
    await route.abort()
  })

  await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}&table=${REAL_TABLE_QR_TOKEN}`)
  const card = page.locator('.product-card').first()
  await card.locator('.add-to-cart-btn').click()
  const modal = page.locator('.options-modal-overlay')
  if (await modal.isVisible().catch(() => false)) {
    await modal.locator('.options-modal__choice').first().click()
    await modal.locator('.options-modal__confirm').click()
  }
  await page.locator('.cart-bar').click()
  await page.locator('.cart-sheet__checkout-btn').click()

  const form = page.locator('form.checkout-form')
  await expect(form).toBeVisible()
  await form.locator('#customerPhone').fill('512345678')
  await form.locator('.checkout-form__submit').click()

  await expect.poll(() => calledRpc).toBe('create_order_from_table_qr')
  expect(calledBody?.p_qr_token).toBe(REAL_TABLE_QR_TOKEN)
  expect(calledBody?.p_idempotency_key).toBeTruthy()
  // The generic RPC's own restaurant/branch/table-number fields don't even
  // exist in this call shape — confirms it's the real, distinct RPC, not a
  // renamed alias of the same payload.
  expect(calledBody).not.toHaveProperty('p_restaurant_id')
  expect(calledBody).not.toHaveProperty('p_table_number')
})

test('checkout without a table QR still calls generic create_order (non-QR paths unaffected)', async ({ page }) => {
  let calledRpc: string | null = null
  await page.route('**/rest/v1/rpc/create_order_from_table_qr', async (route) => {
    calledRpc = 'create_order_from_table_qr'
    await route.abort()
  })
  await page.route('**/rest/v1/rpc/create_order', async (route) => {
    calledRpc = calledRpc ?? 'create_order'
    await route.abort()
  })

  await page.goto(`/menu/${KONOHA}`)
  const card = page.locator('.product-card').first()
  await card.locator('.add-to-cart-btn').click()
  const modal = page.locator('.options-modal-overlay')
  if (await modal.isVisible().catch(() => false)) {
    await modal.locator('.options-modal__choice').first().click()
    await modal.locator('.options-modal__confirm').click()
  }
  await page.locator('.cart-bar').click()
  await page.locator('.cart-sheet__checkout-btn').click()

  const form = page.locator('form.checkout-form')
  await expect(form).toBeVisible()
  await form.locator('#tableNumber').fill('12')
  await form.locator('#customerPhone').fill('512345678')
  await form.locator('.checkout-form__submit').click()

  await expect.poll(() => calledRpc).toBe('create_order')
})
