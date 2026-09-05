import { test, expect } from '@playwright/test'

// STEP 10 — order status error paths only. No real order fixture exists (and
// this suite never creates one — see STEP 9 in the regression report), so
// only the safe, real, verifiable-without-any-order paths are automated:
// missing token and an unknown order id with a garbage token. The
// "real order renders correctly" and "live Realtime update" paths remain
// NOT AUTOMATED, documented in the regression report, not silently skipped.

test('order status without a token shows a clean error, not a crash', async ({ page }) => {
  const res = await page.goto('/menu/konoha/order/00000000-0000-0000-0000-000000000000')
  expect(res?.status()).toBe(200)
  // Asserted on the specific final-state heading, not the shared .menu-empty class — the
  // route segment's own loading.tsx uses the identical class+role during the brief Suspense
  // fallback window, which can otherwise make this a flaky strict-mode double-match.
  await expect(page.getByRole('heading', { name: 'تعذّر عرض هذا الطلب' })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('pre, .error-stack')).toHaveCount(0)
})

test('an unknown order id with a garbage token shows a clean error, not a crash', async ({ page }) => {
  const res = await page.goto('/menu/konoha/order/00000000-0000-0000-0000-000000000000?token=not-a-real-token')
  expect(res?.status()).toBe(200)
  // This path goes through the client component (OrderStatusView), which
  // shows the SAME .menu-empty wrapper for both its transient "loading" and
  // final "error" states — so assert on the error state's specific title
  // text (not just the shared class) to confirm the async get_orders_status_secure
  // call actually resolved to "not found," not just that loading hasn't finished yet.
  await expect(page.getByRole('heading', { name: 'تعذّر عرض هذا الطلب' })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('pre, .error-stack')).toHaveCount(0)
})
