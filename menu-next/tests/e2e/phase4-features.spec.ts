import { test, expect } from '@playwright/test'

// Phase 4 — Banners/Offers (#2b) and per-product companion recommendations
// (#3b). No test here calls create_order (no real order is ever placed).
//
// `konoha` has zero banners/coupons/companion rules (confirmed via a direct
// read against the live database) — used as the "these features are
// genuinely absent, must not crash or show anything" baseline.
//
// `simsim` has real, active `product_recommendations` rows (no expiry concept
// on that table, so always live) — used to verify the actual companion
// feature against real production data. Its `banners`/`coupons` rows are, at
// the time this suite was written, time-expired (their own real `ends_at`/
// `expires_at` are in the past) — the offers-drawer/badge tests below verify
// the *code path* (fetch + filter runs without crashing, badge correctly
// stays hidden when nothing is currently active) rather than the visual
// "drawer full of active offers" state, since no restaurant currently has
// non-expired banner/coupon data to test that state against without writing
// synthetic rows to the real database (not done, per this phase's own
// no-mock-data rule).

const KONOHA = 'konoha'
const SIMSIM = 'simsim'

test('menu with zero banners/offers/companions: no badge, no crash', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('pageerror', (err) => consoleErrors.push(err.message))
  await page.goto(`/menu/${KONOHA}`)
  await expect(page.locator('.product-card').first()).toBeVisible()
  await expect(page.locator('.menu-header__action-icon--badge')).toHaveCount(0)
  await expect(page.locator('pre, .error-stack')).toHaveCount(0)
  expect(consoleErrors).toEqual([])
})

test('menu for a restaurant with real (currently expired) banner/coupon rows: fetch+filter runs without crashing, badge stays hidden', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('pageerror', (err) => consoleErrors.push(err.message))
  const res = await page.goto(`/menu/${SIMSIM}`)
  expect(res?.status()).toBe(200)
  await expect(page.locator('.product-card').first()).toBeVisible()
  // Real rows exist but are expired as of writing — the badge must reflect
  // that (0 active), proving the starts_at/ends_at/expires_at filter is
  // actually being applied, not just "always show if any row exists".
  await expect(page.locator('.menu-header__action-icon--badge')).toHaveCount(0)
  await expect(page.locator('pre, .error-stack')).toHaveCount(0)
  expect(consoleErrors).toEqual([])
})

test('a real, active companion recommendation renders inside the product modal and is addable', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('pageerror', (err) => consoleErrors.push(err.message))
  await page.goto(`/menu/${SIMSIM}`)

  // "بيض مسلوق ساده" — real product with zero options but a real, active
  // product_recommendations rule (confirmed via a direct database read).
  // Its options-less-ness is the point: the tap must now open the modal
  // (Phase 4's one intentional behavior change — see AddToCartButton.tsx)
  // specifically because it has a companion rule, not because of options.
  const card = page.locator('.product-card', { hasText: 'بيض مسلوق ساده' }).first()
  await expect(card).toBeVisible()
  await card.locator('.add-to-cart-btn').click()

  const modal = page.locator('.options-modal-overlay')
  await expect(modal).toBeVisible()
  // No option groups on this product — confirms the modal opened for the
  // companion rule, not for options.
  await expect(modal.locator('.options-modal__group')).toHaveCount(0)
  await expect(modal.locator('.options-modal__companions')).toBeVisible()
  const companion = modal.locator('.options-modal__companion').first()
  await expect(companion).toBeVisible()

  // Tapping a companion adds it directly without closing this modal (same
  // "دون إغلاق هذه النافذة" behavior as the old ProductModal.jsx).
  await companion.click()
  await expect(modal).toBeVisible()

  await modal.locator('.options-modal__close').click()
  await expect(page.locator('.cart-bar')).toBeVisible()
  expect(consoleErrors).toEqual([])
})

test('a product with neither options nor companions still adds instantly (unchanged fast path)', async ({ page }) => {
  await page.goto(`/menu/${SIMSIM}`)
  // "شباتي لبنه زعتر" — real product confirmed to have empty options AND no
  // companion rule (not one of the source products in product_recommendations).
  // Must keep the exact pre-Phase-4 instant-add behavior.
  const card = page.locator('.product-card', { hasText: 'شباتي لبنه زعتر' }).first()
  await expect(card).toBeVisible()
  await card.locator('.add-to-cart-btn').click()
  await expect(page.locator('.options-modal-overlay')).toHaveCount(0)
  await expect(page.locator('.cart-bar')).toBeVisible()
})
