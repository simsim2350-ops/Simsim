import { test, expect } from '@playwright/test'

// STEP 13 — responsive smoke checks only (no pixel-perfect visual testing).
// Runs once per Playwright project — this file is viewport-agnostic; the
// actual widths (360/390/430/desktop) come from playwright.config.ts's
// `projects` array, so `npx playwright test` exercises all four automatically.

async function hasHorizontalOverflow(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
}

test('menu page has no horizontal overflow at this viewport', async ({ page }) => {
  await page.goto('/menu/konoha')
  expect(await hasHorizontalOverflow(page)).toBe(false)
})

test('cart bar stays visible, on-screen, and clickable at this viewport', async ({ page }) => {
  await page.goto('/menu/konoha')
  await page.locator('.product-card').first().locator('.add-to-cart-btn').click()
  const modal = page.locator('.options-modal-overlay')
  if (await modal.isVisible().catch(() => false)) {
    await modal.locator('.options-modal__choice').first().click()
    await modal.locator('.options-modal__confirm').click()
  }

  const bar = page.locator('.cart-bar')
  await expect(bar).toBeVisible()
  const box = await bar.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  if (box && viewport) {
    expect(box.x).toBeGreaterThanOrEqual(-1)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  }
  await expect(bar).toBeEnabled()
})

test('cart sheet and options modal stay within the viewport (no horizontal overflow) when open', async ({ page }) => {
  await page.goto('/menu/konoha')
  await page.locator('.product-card').first().locator('.add-to-cart-btn').click()

  const modal = page.locator('.options-modal-overlay')
  if (await modal.isVisible().catch(() => false)) {
    expect(await hasHorizontalOverflow(page)).toBe(false)
    await modal.locator('.options-modal__choice').first().click()
    await modal.locator('.options-modal__confirm').click()
  }

  await page.locator('.cart-bar').click()
  await expect(page.locator('.cart-sheet')).toBeVisible()
  expect(await hasHorizontalOverflow(page)).toBe(false)
})
