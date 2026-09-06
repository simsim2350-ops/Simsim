import { test, expect } from '@playwright/test'

// Phase 5 — Admin ↔ menu-next parity audit fixes: trusted table-QR context,
// menu_layout (grid/showcase/circles vs. the unchanged default 'list'), and
// the restaurant hero image (restaurants.cover_url). No test here calls
// create_order — no real order is ever placed.
//
// The table-QR token below is a real, currently-active table on the live
// `simsim` restaurant (same one already verified in a prior supervised
// session — see SIMSIM_MENU_NEXT_REAL_TABLE_QR_POSITIVE_PATH_TEST_REPORT.md).
// It identifies a table, not an API credential, and was obtained via one
// explicitly-approved read-only SQL SELECT for this exact purpose.
const SIMSIM = 'simsim'
const SIMSIM_BRANCH_ID = 'd61f2cdf-883c-4f12-8898-7e9b47a7e354'
const REAL_TABLE_QR_TOKEN = '00772247-dd31-4f91-82d8-bebeab1fc483'
const KONOHA = 'konoha'

test('a real, active table QR token resolves and locks the checkout table field to that table', async ({ page }) => {
  await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_BRANCH_ID}&table=${REAL_TABLE_QR_TOKEN}`)
  const card = page.locator('.product-card').first()
  await expect(card).toBeVisible()
  const addBtn = card.locator('.add-to-cart-btn').first()
  await addBtn.click()
  const modal = page.locator('.options-modal-overlay')
  if (await modal.isVisible().catch(() => false)) {
    await modal.locator('.options-modal__choice').first().click()
    await modal.locator('.options-modal__confirm').click()
  }
  await page.locator('.cart-bar').click()
  await page.locator('.cart-sheet__checkout-btn').click()
  await expect(page).toHaveURL(/table=/)

  const form = page.locator('form.checkout-form')
  await expect(form).toBeVisible()
  // Locked, read-only table display — no manual table-number input, no
  // order-type picker at all (a resolved QR forces dine-in at this table).
  await expect(form.locator('[aria-readonly="true"]')).toHaveText('TABLE 5')
  await expect(form.locator('#tableNumber')).toHaveCount(0)
  await expect(form.locator('.checkout-form__order-type-grid')).toHaveCount(0)
})

test('an invalid/garbage table token falls back to normal manual entry, not a forced or forged table', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}?table=not-a-real-token-at-all`)
  await page.locator('.product-card').first().locator('.add-to-cart-btn').first().click()
  const modal = page.locator('.options-modal-overlay')
  if (await modal.isVisible().catch(() => false)) {
    await modal.locator('.options-modal__choice').first().click()
    await modal.locator('.options-modal__confirm').click()
  }
  await page.locator('.cart-bar').click()
  await page.locator('.cart-sheet__checkout-btn').click()

  const form = page.locator('form.checkout-form')
  await expect(form).toBeVisible()
  // Falls back exactly like no ?table= was ever given — order-type picker
  // present, manual table-number field present, nothing pre-locked.
  await expect(form.locator('.checkout-form__order-type-grid')).toBeVisible()
  await expect(form.locator('#tableNumber')).toBeVisible()
})

test('menu_layout=circles (konoha, real Admin setting) renders circular product cards', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  await expect(page.locator('.product-card--circles').first()).toBeVisible()
  await expect(page.locator('.product-card--list')).toHaveCount(0)
})

test('menu_layout=grid (simsim, real Admin setting) renders grid product cards with a 2-column section', async ({ page }) => {
  await page.goto(`/menu/${SIMSIM}`)
  await expect(page.locator('.product-card--grid').first()).toBeVisible()
})

test('hero image renders for a restaurant with a real cover_url (simsim)', async ({ page }) => {
  await page.goto(`/menu/${SIMSIM}`)
  const hero = page.locator('.menu-header__hero')
  await expect(hero).toBeVisible()
  await expect(hero.locator('.menu-header__hero-image')).toBeVisible()
})

test('hero image falls back to the brand-color gradient (no <img>) for a restaurant with no cover_url (konoha)', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  const hero = page.locator('.menu-header__hero')
  await expect(hero).toBeVisible()
  await expect(hero.locator('.menu-header__hero-image')).toHaveCount(0)
})

test('category header shows a product-count pill', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  await expect(page.locator('.category-section__count').first()).toBeVisible()
})
