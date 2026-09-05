import { test, expect } from '@playwright/test'

// STEP 3 — real restaurant, real catalog. Uses a known-active, real restaurant
// (`konoha`) against the connected Supabase project (via this machine's own
// .env.local at test-server startup, never a value hardcoded here). This is
// the core "does the menu actually work" regression guard.

test('a real restaurant renders with categories, products, prices, and an image — not "not found"', async ({ page }) => {
  await page.goto('/menu/konoha')

  // Must never show the not-found empty state for a real, active restaurant.
  await expect(page.locator('.menu-empty')).toHaveCount(0)

  await expect(page.locator('h1.menu-header__name')).toBeVisible()
  const name = await page.locator('h1.menu-header__name').textContent()
  expect(name?.trim().length).toBeGreaterThan(0)

  // Real logo image, served from the correct Supabase storage project.
  await expect(page.locator('img.menu-header__logo')).toHaveCount(1)
  const logoSrc = await page.locator('img.menu-header__logo').getAttribute('src')
  expect(logoSrc).toMatch(/supabase\.co/)

  // At least one category, at least one product, with a real price.
  const categoryCount = await page.locator('.category-section').count()
  expect(categoryCount).toBeGreaterThan(0)

  const productCount = await page.locator('.product-card').count()
  expect(productCount).toBeGreaterThan(0)

  const firstPrice = await page.locator('.product-card__price').first().textContent()
  expect(firstPrice?.trim().length).toBeGreaterThan(0)
})
