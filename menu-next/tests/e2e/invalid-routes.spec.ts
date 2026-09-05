import { test, expect } from '@playwright/test'

// STEP 12 — invalid input handling. Must never leak a raw error/stack trace
// to the customer, regardless of what nonsense is in the URL.

test('an invalid restaurant slug shows a clean not-found message, no stack trace', async ({ page }) => {
  const res = await page.goto('/menu/this-slug-does-not-exist-xyz-123')
  expect(res?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'المطعم غير موجود' })).toBeVisible()
  await expect(page.locator('pre, .error-stack')).toHaveCount(0)
  // Never a framework error overlay in a production build.
  await expect(page.locator('text=/Unhandled Runtime Error|TypeError:|at Object\\./')).toHaveCount(0)
})

test('an invalid restaurant slug on the checkout route also fails cleanly', async ({ page }) => {
  const res = await page.goto('/menu/this-slug-does-not-exist-xyz-123/checkout')
  expect(res?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'المطعم غير موجود' })).toBeVisible()
})
