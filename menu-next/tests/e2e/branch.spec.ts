import { test, expect } from '@playwright/test'

// STEP 4 — branch resolution and fallback. `simsim` is the one real, active
// restaurant in the connected database with more than one active branch
// (confirmed via a read-only check before writing this test).
//
// The in-menu branch-switcher UI was removed from the customer menu this
// round (#4 — each branch now gets its own QR/URL, so the customer never
// needs to pick a branch inside the menu itself). This test now verifies
// exactly that: no switcher UI renders, while direct branch URLs — the
// mechanism every branch's own QR code actually relies on — still resolve
// and serve the correct branch. The underlying data-layer priority
// (loadMenuPage's tableQr?.branchId || search.branch) is untouched.

test('no branch-switcher UI renders in the customer menu, even for a real multi-branch restaurant', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/menu/simsim')
  await expect(page.locator('.menu-empty')).toHaveCount(0)
  await expect(page.locator('.menu-header__branches')).toHaveCount(0)
})

test('a direct branch URL (the mechanism behind each branch\'s own QR code) still serves that exact branch', async ({ page }) => {
  // This branch ("فرع المشهد") carries 48 real, available products — 24x
  // heavier than every other test's target page (`konoha`, 2 products) —
  // confirmed via a direct read-only count query. A network-waterfall
  // diagnostic (goto -> h1 visible) showed the server response itself is
  // fast (~150ms); the delay is entirely client-side render time for that
  // much larger real page under this sandbox's constrained CPU. Extra
  // budget only for this one real, heavier page.
  test.setTimeout(90_000)
  const SIMSIM_SECOND_BRANCH_ID = 'b68566e9-7b3d-40ab-9931-4f8dbcc36281'
  await page.goto(`/menu/simsim?branch=${SIMSIM_SECOND_BRANCH_ID}`)
  await expect(page.locator('.menu-empty')).toHaveCount(0)
  await expect(page.locator('h1.menu-header__name')).toBeVisible({ timeout: 60_000 })
  // Genuinely this branch, not just "some page loaded" — its real, distinct
  // product count (48) is a much larger set than any other branch used in
  // this suite, so a low/near-empty count here would mean the wrong branch
  // (or the primary/fallback branch) was actually served instead.
  await expect
    .poll(async () => page.locator('.product-card').count(), { timeout: 60_000 })
    .toBeGreaterThan(20)
})

test('an unknown ?branch= value falls back gracefully instead of erroring', async ({ page }) => {
  const res = await page.goto('/menu/konoha?branch=00000000-0000-0000-0000-000000000000')
  expect(res?.status()).toBe(200)
  // Falls back to the restaurant's primary/first branch — page still renders normally.
  await expect(page.locator('.menu-empty')).toHaveCount(0)
  await expect(page.locator('h1.menu-header__name')).toBeVisible()
})
