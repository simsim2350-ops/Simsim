import { test, expect } from '@playwright/test'

// Compact spacing pass + "الأكثر طلبًا" (renamed from "مختارات المطعم")
// horizontal-scroll rail — this round's actual changes. konoha has 2 real,
// active is_featured products (confirmed via a direct read-only query
// before writing this test), so its "featured" highlight rail genuinely
// renders here, not a synthetic fixture.

const KONOHA = 'konoha'

test('the highlight section is titled "الأكثر طلبًا", not the old "مختارات المطعم"', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  await expect(page.locator('.category-section__title', { hasText: 'الأكثر طلبًا' })).toBeVisible()
  await expect(page.locator('.category-section__title', { hasText: 'مختارات المطعم' })).toHaveCount(0)
})

test('"الأكثر طلبًا" renders as a horizontal-scrolling row of compact list-style cards, never a vertical grid', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  const title = page.locator('.category-section__title', { hasText: 'الأكثر طلبًا' })
  const section = title.locator('xpath=ancestor::section[contains(@class,"category-section")]')
  const grid = section.locator('.category-section__grid')
  await expect(grid).toHaveClass(/category-section__grid--horizontal-scroll/)

  const overflowX = await grid.evaluate((el) => getComputedStyle(el).overflowX)
  expect(overflowX).toBe('auto')
  const display = await grid.evaluate((el) => getComputedStyle(el).display)
  expect(display).toBe('flex')

  // Compact list-style cards, not the restaurant's own circles layout
  // (konoha's regular categories use circles — confirmed by an existing,
  // separate test — this rail is intentionally exempt).
  const cardCount = await grid.locator('.product-card').count()
  expect(cardCount).toBeGreaterThan(0)
  await expect(grid.locator('.product-card--list').first()).toBeVisible()
  await expect(grid.locator('.product-card--grid, .product-card--circles')).toHaveCount(0)
})

test('the horizontal row does not cause page-level horizontal overflow on small mobile viewports', async ({ page }) => {
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 740 })
    await page.goto(`/menu/${KONOHA}`)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(overflow).toBe(false)
  }
})

test('the row is actually scrollable and shows a partial next card on mobile (RTL default)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/menu/${KONOHA}`)
  const title = page.locator('.category-section__title', { hasText: 'الأكثر طلبًا' })
  const grid = title.locator('xpath=ancestor::section[contains(@class,"category-section")]').locator('.category-section__grid')

  const { scrollWidth, clientWidth } = await grid.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
  // Real overflow content to scroll through (i.e. more than one card's worth).
  expect(scrollWidth).toBeGreaterThan(clientWidth)

  const before = await grid.evaluate((el) => el.scrollLeft)
  // In RTL, Chromium's scrollLeft starts at 0 (rightmost/start position) and
  // goes NEGATIVE as the user scrolls to reveal more content — confirmed
  // directly against this live page. Subtracting (not adding) is the
  // correct "scroll to see more" direction here; a plain += would try to
  // scroll past 0 and get clamped right back to it.
  await grid.evaluate((el) => { el.scrollLeft -= 100 })
  const after = await grid.evaluate((el) => el.scrollLeft)
  expect(after).not.toBe(before)
})

test('the row also works correctly in LTR (?lang=en)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/menu/${KONOHA}?lang=en`)
  const title = page.locator('.category-section__title', { hasText: 'Most Ordered' })
  await expect(title).toBeVisible()
  const grid = title.locator('xpath=ancestor::section[contains(@class,"category-section")]').locator('.category-section__grid')
  const { scrollWidth, clientWidth } = await grid.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
  expect(scrollWidth).toBeGreaterThan(clientWidth)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
})

test('the glass card and section spacing are measurably more compact than before', async ({ page }) => {
  // Forced to mobile: .category-section's own top padding is intentionally
  // different per breakpoint (12px mobile / 14px tablet / 16px desktop —
  // all reduced from their prior values, just not to the same number), so
  // checking a single hardcoded value only makes sense pinned to one
  // viewport rather than whatever the test runner's own default happens to be.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/menu/${KONOHA}`)
  const cardPadding = await page.locator('.menu-header__card').evaluate((el) => getComputedStyle(el).paddingTop)
  expect(cardPadding).toBe('12px')
  const sectionPaddingTop = await page.locator('.category-section').first().evaluate((el) => getComputedStyle(el).paddingTop)
  expect(sectionPaddingTop).toBe('12px')
})
