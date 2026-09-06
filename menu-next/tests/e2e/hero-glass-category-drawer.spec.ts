import { test, expect } from '@playwright/test'

// Public Menu polish round — dual category system (horizontal bar + vertical
// "all categories" drawer sharing one state/data source) and the hero/glass
// scroll-driven fade into a permanent sticky mini-header (logo + search),
// ported from the exact mechanism in src/features/menu/MenuHeader.jsx
// (single rAF-throttled scroll listener driving two continuous progress
// values, never a boolean "scrolled" flag).

const SIMSIM = 'simsim'
const SIMSIM_MAIN_BRANCH_ID = 'd61f2cdf-883c-4f12-8898-7e9b47a7e354'

async function scrollAndSettle(page: import('@playwright/test').Page, y: number) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y)
  // A real wall-clock wait, not a same-process double-rAF round trip — the
  // latter proved unreliable against the live site (verified directly: a
  // 300ms real wait consistently observes the correct settled opacity,
  // while chaining two `page.evaluate` rAF round trips did not, most likely
  // because each `page.evaluate` call itself carries real IPC/network
  // latency to the remote page that a same-process rAF chain doesn't
  // account for). This is a test-timing fix only — the underlying
  // rAF-throttled scroll handler in RestaurantHeader.tsx is unchanged and
  // was confirmed correct via a standalone script against production.
  await page.waitForTimeout(300)
}

test.describe('vertical "all categories" drawer', () => {
  test('the ☰ button opens a vertical drawer listing every real category, same set as the horizontal bar', async ({ page }) => {
    await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
    const tabNames = await page.locator('.category-nav__tab').allTextContents()
    await page.locator('.category-nav__all-btn').click()
    const drawer = page.locator('.category-drawer')
    await expect(drawer).toBeVisible()
    const drawerNames = await page.locator('.category-drawer__item').allTextContents()
    expect(drawerNames).toEqual(tabNames)
  })

  test('selecting a category from the drawer scrolls to it, updates the active tab, and closes the drawer', async ({ page }) => {
    await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
    const tabCount = await page.locator('.category-nav__tab').count()
    test.skip(tabCount < 2, 'needs at least 2 real categories to prove navigation, not just default-active')

    await page.locator('.category-nav__all-btn').click()
    const secondItem = page.locator('.category-drawer__item').nth(1)
    const targetName = await secondItem.textContent()
    await secondItem.click()

    await expect(page.locator('.category-drawer-overlay')).toHaveCount(0)
    const activeTab = page.locator('.category-nav__tab.is-active')
    await expect(activeTab).toHaveText(targetName ?? '')
  })

  test('Escape closes the drawer', async ({ page }) => {
    await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
    await page.locator('.category-nav__all-btn').click()
    await expect(page.locator('.category-drawer')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.category-drawer-overlay')).toHaveCount(0)
  })

  test('clicking the overlay outside the sheet closes the drawer', async ({ page }) => {
    await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
    await page.locator('.category-nav__all-btn').click()
    await expect(page.locator('.category-drawer')).toBeVisible()
    await page.locator('.category-drawer-overlay').click({ position: { x: 5, y: 5 } })
    await expect(page.locator('.category-drawer-overlay')).toHaveCount(0)
  })
})

test.describe('hero + glass scroll behavior', () => {
  test('at the top of the page: hero is fully visible, sticky mini-header is invisible and non-interactive', async ({ page }) => {
    await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
    const hero = page.locator('.menu-header__hero')
    const sticky = page.locator('.menu-header__sticky')
    const heroOpacity = await hero.evaluate((el) => Number(getComputedStyle(el).opacity))
    const stickyOpacity = await sticky.evaluate((el) => Number(getComputedStyle(el).opacity))
    const stickyPointerEvents = await sticky.evaluate((el) => getComputedStyle(el).pointerEvents)
    expect(heroOpacity).toBeGreaterThan(0.9)
    expect(stickyOpacity).toBeLessThan(0.1)
    expect(stickyPointerEvents).toBe('none')
  })

  test('after scrolling well past the hero: hero has faded out, sticky mini-header has faded in and become interactive', async ({ page }) => {
    await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
    await scrollAndSettle(page, 400)
    const hero = page.locator('.menu-header__hero')
    const sticky = page.locator('.menu-header__sticky')
    const heroOpacity = await hero.evaluate((el) => Number(getComputedStyle(el).opacity))
    const stickyOpacity = await sticky.evaluate((el) => Number(getComputedStyle(el).opacity))
    const stickyPointerEvents = await sticky.evaluate((el) => getComputedStyle(el).pointerEvents)
    expect(heroOpacity).toBeLessThan(0.1)
    expect(stickyOpacity).toBeGreaterThan(0.9)
    expect(stickyPointerEvents).toBe('auto')
  })

  test('the hero fades gradually across its own scroll window, not an abrupt cut', async ({ page }) => {
    await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
    // Hero's own fade window is scrollY 86->216 (see RestaurantHeader.tsx) —
    // 150 sits roughly in the middle of it. Polls rather than a single
    // fixed-delay snapshot: this live site's network latency varies widely
    // run to run (observed 3-19s page loads in the same suite), so a flat
    // wait occasionally reads mid-settle; polling still fails for a genuine
    // stuck-at-1-forever bug, just tolerates real, variable settle time.
    await page.evaluate((yy) => window.scrollTo(0, yy), 150)
    await expect.poll(
      async () => Number(await page.locator('.menu-header__hero').evaluate((el) => getComputedStyle(el).opacity)),
      { timeout: 5000 }
    ).toBeLessThan(1)
    const heroOpacity = await page.locator('.menu-header__hero').evaluate((el) => Number(getComputedStyle(el).opacity))
    expect(heroOpacity).toBeGreaterThan(0)
  })

  test('the sticky mini-header fades in gradually across its own scroll window, not an abrupt cut', async ({ page }) => {
    await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
    // Sticky's own fade-in window is scrollY 78->120 — a narrower range than
    // the hero's, so it must be checked at its own midpoint, not the hero's.
    await page.evaluate((yy) => window.scrollTo(0, yy), 99)
    await expect.poll(
      async () => Number(await page.locator('.menu-header__sticky').evaluate((el) => getComputedStyle(el).opacity)),
      { timeout: 5000 }
    ).toBeGreaterThan(0)
    const stickyOpacity = await page.locator('.menu-header__sticky').evaluate((el) => Number(getComputedStyle(el).opacity))
    expect(stickyOpacity).toBeGreaterThan(0)
    expect(stickyOpacity).toBeLessThan(1)
  })

  test('the glass card is never position:fixed — only the final sticky header is', async ({ page }) => {
    await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
    const cardPosition = await page.locator('.menu-header__card').evaluate((el) => getComputedStyle(el).position)
    const stickyPosition = await page.locator('.menu-header__sticky').evaluate((el) => getComputedStyle(el).position)
    expect(cardPosition).toBe('relative')
    expect(stickyPosition).toBe('fixed')
  })

  test('the sticky mini-header search button works after scrolling past the hero', async ({ page }) => {
    await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
    await scrollAndSettle(page, 400)
    await page.locator('.menu-header__sticky .menu-header__search-btn').click()
    await expect(page.locator('.search-overlay')).toBeVisible()
  })

  test('category nav sticks directly below the sticky mini-header (top: 56px) once both are pinned', async ({ page }) => {
    await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
    await scrollAndSettle(page, 600)
    const top = await page.locator('.category-nav-row').evaluate((el) => el.getBoundingClientRect().top)
    expect(Math.round(top)).toBe(56)
  })

  test('no horizontal overflow is introduced on a small mobile viewport, at top of page and after scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto(`/menu/${SIMSIM}?branch=${SIMSIM_MAIN_BRANCH_ID}`)
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(overflow).toBe(false)
    await scrollAndSettle(page, 400)
    overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(overflow).toBe(false)
  })
})
