import { test, expect } from '@playwright/test'

// Sticky header now carries the same general menu functions (search,
// language, my orders) as the hero-actions row, so they stay reachable
// after the hero has fully faded — this round's actual change. The
// underlying icons/handlers/hrefs are the exact same ones already covered
// by menu-header-polish.spec.ts for the hero row; these tests only check
// the sticky-header-specific wiring and the handoff between the two rows.

const SIMSIM = 'simsim'
const KONOHA = 'konoha'

async function scrollPastHero(page: import('@playwright/test').Page) {
  await page.evaluate(() => window.scrollTo(0, 400))
  await page.waitForTimeout(300)
}

test('the sticky header carries logo + search + language + my-orders, with no overlap between the logo and the icon group', async ({ page }) => {
  await page.goto(`/menu/${SIMSIM}`)
  await scrollPastHero(page)
  const sticky = page.locator('.menu-header__sticky')
  await expect(sticky.locator('.menu-header__sticky-actions .menu-header__action-icon')).toHaveCount(3)
  await expect(sticky.locator('.menu-header__sticky-logo, .menu-header__sticky-logo--placeholder')).toHaveCount(1)

  const logoBox = await sticky.locator('.menu-header__sticky-logo, .menu-header__sticky-logo--placeholder').boundingBox()
  const actionsBox = await sticky.locator('.menu-header__sticky-actions').boundingBox()
  expect(logoBox).not.toBeNull()
  expect(actionsBox).not.toBeNull()
  // No horizontal overlap between the logo and the icon group — direction-
  // agnostic (Arabic/RTL is the default here, where the logo actually
  // renders on the right and the icon group on the left; a fixed
  // "logo-then-actions" assumption would be wrong for RTL).
  const logoEndsBeforeActions = logoBox!.x + logoBox!.width <= actionsBox!.x + 1
  const actionsEndBeforeLogo = actionsBox!.x + actionsBox!.width <= logoBox!.x + 1
  expect(logoEndsBeforeActions || actionsEndBeforeLogo).toBe(true)
})

test('the sticky header\'s language toggle switches language and preserves URL context', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  await scrollPastHero(page)
  await page.locator('.menu-header__sticky .menu-header__lang-toggle').click()
  await expect(page).toHaveURL(/lang=en/)
})

test('the sticky header\'s my-orders icon navigates to the orders page', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  await scrollPastHero(page)
  const ordersLink = page.locator(`.menu-header__sticky a[href="/menu/${KONOHA}/orders"]`)
  await expect(ordersLink).toBeVisible()
  await ordersLink.click()
  await expect(page).toHaveURL(new RegExp(`/menu/${KONOHA}/orders`))
})

test('no double-visible icon set: the hero-actions row is non-interactive once the sticky header has taken over', async ({ page }) => {
  await page.goto(`/menu/${SIMSIM}`)
  await scrollPastHero(page)
  const heroPointerEvents = await page.locator('.menu-header__hero-actions').evaluate((el) => getComputedStyle(el).pointerEvents)
  const stickyPointerEvents = await page.locator('.menu-header__sticky').evaluate((el) => getComputedStyle(el).pointerEvents)
  // Inherited from .menu-header__hero, which becomes non-interactive well before scrollY=400.
  expect(heroPointerEvents).toBe('none')
  expect(stickyPointerEvents).toBe('auto')
})

test('no horizontal overflow or layout shift on a small mobile viewport with the wider sticky header', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto(`/menu/${SIMSIM}`)
  await scrollPastHero(page)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
  await expect(page.locator('.menu-header__sticky-actions .menu-header__action-icon')).toHaveCount(3)
})
