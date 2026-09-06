import { test, expect } from '@playwright/test'

// Glass Sheet description clamp/expand (#1) and general-menu-utility icons
// moved to the hero (#2) — this round's actual new/changed behavior.
// Branch-switcher-removal (#4) and category-nav (#5) regressions are
// covered by the updated branch.spec.ts / phase6-glass-branch-table.spec.ts
// / public-menu-audit.spec.ts instead of being duplicated here.

const SIMSIM = 'simsim'
const KONOHA = 'konoha'

test('the description toggle appears exactly when the real content overflows 2 lines, never otherwise', async ({ page }) => {
  for (const slug of [SIMSIM, KONOHA]) {
    await page.goto(`/menu/${slug}`)
    const desc = page.locator('.menu-header__desc')
    if ((await desc.count()) === 0) continue // this restaurant has show_description off or no description at all — nothing to check

    const overflows = await desc.evaluate((el) => el.scrollHeight > el.clientHeight + 2)
    const toggle = page.locator('.menu-header__desc-toggle')
    if (overflows) {
      await expect(toggle).toBeVisible()
      await expect(toggle).toHaveText('+ المزيد')
    } else {
      await expect(toggle).toHaveCount(0)
    }
  }
})

test('clicking "+ المزيد" expands the description in place — no navigation, no modal — and can be collapsed again', async ({ page }) => {
  // Forced to a narrow mobile viewport deliberately: simsim's real
  // description reliably overflows 2 lines there (confirmed via a live
  // screenshot), where a wide desktop viewport can legitimately fit the
  // same text in fewer lines — this test wants guaranteed interactive
  // coverage of the expand/collapse behavior, not a viewport-dependent skip.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/menu/${SIMSIM}`)
  const desc = page.locator('.menu-header__desc')
  const overflows = await desc.evaluate((el) => el.scrollHeight > el.clientHeight + 2)
  test.skip(!overflows, 'simsim\'s current description does not overflow 2 lines — nothing to expand')

  const urlBefore = page.url()
  await page.locator('.menu-header__desc-toggle').click()
  // Same page, no navigation, no modal overlay opened.
  expect(page.url()).toBe(urlBefore)
  await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  await expect(desc).toHaveClass(/is-expanded/)
  const expandedHeight = await desc.evaluate((el) => el.clientHeight)
  const scrollHeight = await desc.evaluate((el) => el.scrollHeight)
  // Fully expanded now — no more clipping.
  expect(expandedHeight).toBeGreaterThanOrEqual(scrollHeight - 2)

  const toggle = page.locator('.menu-header__desc-toggle')
  await expect(toggle).toHaveText('عرض أقل')
  await toggle.click()
  await expect(desc).not.toHaveClass(/is-expanded/)
})

test('search, language, and my-orders are all present as general menu icons on the hero, each functional, none duplicated inside the glass card', async ({ page }) => {
  await page.goto(`/menu/${SIMSIM}`)
  const heroActions = page.locator('.menu-header__hero-actions')
  await expect(heroActions.locator('.menu-header__action-icon')).toHaveCount(3)

  // Not duplicated inside the glass card itself.
  const cardSearchBtn = page.locator('.menu-header__card .menu-header__search-btn')
  await expect(cardSearchBtn).toHaveCount(0)
  const cardOrdersLink = page.locator(`.menu-header__card a[href="/menu/${SIMSIM}/orders"]`)
  await expect(cardOrdersLink).toHaveCount(0)

  // Search opens the overlay.
  await heroActions.locator('.menu-header__action-icon').first().click()
  await expect(page.locator('.search-overlay')).toBeVisible()
  await page.keyboard.press('Escape').catch(() => {})
})

test('my orders icon on the hero navigates to the orders page', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  const ordersLink = page.locator(`.menu-header__hero-actions a[href="/menu/${KONOHA}/orders"]`)
  await expect(ordersLink).toBeVisible()
  await ordersLink.click()
  await expect(page).toHaveURL(new RegExp(`/menu/${KONOHA}/orders`))
})

test('the language toggle on the hero switches language and preserves the current URL context', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  await page.locator('.menu-header__lang-toggle').click()
  await expect(page).toHaveURL(/lang=en/)
  await expect(page.locator('.menu-frame.lang-en')).toBeVisible()
})

test('no horizontal overflow or covered products after this round\'s header changes, on a small mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto(`/menu/${SIMSIM}`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
  await expect(page.locator('.product-card').first()).toBeVisible()
})
