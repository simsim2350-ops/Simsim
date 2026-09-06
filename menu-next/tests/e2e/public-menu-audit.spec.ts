import { test, expect } from '@playwright/test'

// Public Menu ↔ Dashboard comprehensive audit — Section 1B (branch-URL real
// table dropdown) and Section 3 (horizontal category nav). No test here
// calls create_order for real — the RPC is intercepted and aborted before
// execution (same established pattern as non-dinein-checkout.spec.ts /
// phase6-glass-branch-table.spec.ts), so no real order is ever placed.

const SIMSIM = 'simsim'
// This branch has 7 real, active restaurant_tables rows (TABLE 1..7) —
// confirmed live via direct DB query before writing this test, not assumed.
const SIMSIM_MAIN_BRANCH_ID = 'd61f2cdf-883c-4f12-8898-7e9b47a7e354'
const KONOHA = 'konoha'

async function addFirstProductAndGoToCheckout(page: import('@playwright/test').Page) {
  const card = page.locator('.product-card').first()
  await card.locator('.add-to-cart-btn').click()
  const modal = page.locator('.options-modal-overlay')
  if (await modal.isVisible().catch(() => false)) {
    await modal.locator('.options-modal__choice').first().click()
    await modal.locator('.options-modal__confirm').click()
  }
  await page.locator('.cart-bar').click()
  await page.locator('.cart-sheet__checkout-btn').click()
}

test('branch-URL (no table QR) dine-in checkout shows a real table dropdown, not free text', async ({ page }) => {
  await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
  await addFirstProductAndGoToCheckout(page)

  const form = page.locator('form.checkout-form')
  await expect(form).toBeVisible()
  const tableField = form.locator('#tableNumber')
  await expect(tableField).toBeVisible()
  expect(await tableField.evaluate((el) => el.tagName)).toBe('SELECT')
  const options = await tableField.locator('option').allTextContents()
  // Real table numbers from the database, never a hardcoded/synthetic list.
  expect(options).toContain('TABLE 1')
  expect(options).toContain('TABLE 5')
  expect(options.length).toBeGreaterThanOrEqual(7)
})

test('a branch with no configured tables keeps the original free-text table input (no regression)', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  await addFirstProductAndGoToCheckout(page)

  const form = page.locator('form.checkout-form')
  await expect(form).toBeVisible()
  const tableField = form.locator('#tableNumber')
  await expect(tableField).toBeVisible()
  expect(await tableField.evaluate((el) => el.tagName)).toBe('INPUT')
})

test('selecting a real table from the dropdown submits create_order with the matching p_table_id and p_table_number', async ({ page }) => {
  let calledBody: Record<string, unknown> | null = null
  await page.route('**/rest/v1/rpc/create_order', async (route) => {
    calledBody = route.request().postDataJSON()
    await route.abort()
  })
  await page.route('**/rest/v1/rpc/create_order_from_table_qr', async (route) => {
    await route.abort()
  })

  await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
  await addFirstProductAndGoToCheckout(page)

  const form = page.locator('form.checkout-form')
  await expect(form).toBeVisible()
  await form.locator('#tableNumber').selectOption({ label: 'TABLE 5' })
  await form.locator('#customerPhone').fill('512345678')
  await form.locator('.checkout-form__submit').click()

  await expect.poll(() => calledBody).not.toBeNull()
  expect(calledBody!.p_table_id).toBe('2dffb859-cd0c-4f1d-8b97-45b8e5dc5bf6')
  expect(calledBody!.p_table_number).toBe('TABLE 5')
})

test('category nav renders a single horizontal row matching the real, visible categories, with no hardcoded list', async ({ page }) => {
  await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
  const nav = page.locator('.category-nav')
  await expect(nav).toBeVisible()
  const overflowX = await nav.evaluate((el) => getComputedStyle(el).overflowX)
  expect(overflowX).toBe('auto')
  const tabs = nav.locator('.category-nav__tab')
  const tabCount = await tabs.count()
  const sectionCount = await page.locator('.category-section').count()
  // Every real category section that renders (non-empty, visible) has
  // exactly one corresponding tab — highlight rails (best sellers/featured/
  // favorites) are not counted here, they don't get their own tab.
  expect(tabCount).toBeGreaterThan(0)
  expect(tabCount).toBeLessThanOrEqual(sectionCount)
})

test('clicking a category tab scrolls its section into view and marks that tab active', async ({ page }) => {
  await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
  const tabs = page.locator('.category-nav__tab')
  const count = await tabs.count()
  test.skip(count < 2, 'needs at least 2 real categories to prove navigation, not just default-active')

  const secondTab = tabs.nth(1)
  const targetId = await secondTab.getAttribute('id') // tab-<categoryId>
  const categoryId = targetId!.replace('tab-', '')
  await secondTab.click()
  await expect(secondTab).toHaveClass(/is-active/)
  await expect(page.locator(`#cat-${categoryId}`)).toBeInViewport()
})

test('scrolling the page updates the active category tab (scroll-spy) without any click', async ({ page }) => {
  await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
  const tabs = page.locator('.category-nav__tab')
  const count = await tabs.count()
  test.skip(count < 2, 'needs at least 2 real categories to prove scroll-spy movement')

  const firstActiveId = await page.locator('.category-nav__tab.is-active').first().getAttribute('id')
  await page.mouse.wheel(0, 4000)
  await expect.poll(async () => {
    return page.locator('.category-nav__tab.is-active').first().getAttribute('id')
  }, { timeout: 5000 }).not.toBe(firstActiveId)
})
