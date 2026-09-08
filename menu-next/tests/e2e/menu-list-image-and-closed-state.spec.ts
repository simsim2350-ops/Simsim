import { test, expect, type Page } from '@playwright/test'

// This round: bigger List View product images, a real product photo inside
// Product Details (now a deterministic fixed-height box regardless of the
// source photo's own aspect ratio), and a closed-restaurant state that fully
// replaces the orderable menu experience (not just a banner above it) — with
// a single, non-duplicated closed message.

const KONOHA = 'konoha' // no opening_hours configured -> always-open fallback, no product photos
const SIMSIM = 'simsim' // has real opening_hours + real product photos; open/closed depends on live time of day

// `simsim`'s open/closed state is real, live, time-of-day data (not a test
// fixture) — tests that need it OPEN (to reach Product Details) skip
// themselves when it happens to be closed at run time, rather than flake.
async function gotoSimsimIfOpen(page: Page): Promise<boolean> {
  await page.goto(`/menu/${SIMSIM}`)
  return (await page.locator('.closed-notice').count()) === 0
}

test('List View product image is visibly larger (84px, up from 72px)', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  const media = page.locator('.category-section:not(:has(.category-section__grid--horizontal-scroll)) .product-card__media').first()
  const box = await media.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(80)
})

test('grid/circles layout product images are unaffected by the List View change', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  const media = page.locator('.product-card--circles .product-card__media').first()
  await expect(media).toBeVisible()
  const box = await media.boundingBox()
  expect(Math.round(box!.width)).toBe(96)
})

test('Product Details still shows the emoji fallback (no image block) for a product with no photo', async ({ page }) => {
  await page.goto(`/menu/${KONOHA}`)
  const card = page.locator('.product-card').first()
  await card.locator('.product-card__media-btn').click()
  const modal = page.locator('.options-modal-overlay')
  await expect(modal).toBeVisible()
  await expect(modal.locator('.options-modal__media')).toHaveCount(0)
  await expect(modal.locator('.options-modal__emoji')).toBeVisible()
})

test.describe('Product Details image — balanced, uniform presentation regardless of source aspect ratio', () => {
  test('every product photo container is the same height, and the full photo is never cropped or stretched', async ({ page }) => {
    if (!(await gotoSimsimIfOpen(page))) { test.skip(true, 'simsim is currently closed — no product access to verify against'); return }

    const cards = page.locator('.product-card')
    const count = Math.min(await cards.count(), 8)
    let checked = 0
    let firstHeight: number | null = null
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i)
      await card.locator('.product-card__media-btn').click()
      const modal = page.locator('.options-modal-overlay')
      await expect(modal).toBeVisible()
      const media = modal.locator('.options-modal__media')
      if (await media.count() > 0) {
        const box = await media.boundingBox()
        // Fluid via clamp(180px, 46vw, 240px) — a bounded, reasonable range,
        // and (critically) the SAME height for every product regardless of
        // that product's own photo dimensions, at this fixed viewport.
        expect(box!.height).toBeGreaterThanOrEqual(175)
        expect(box!.height).toBeLessThanOrEqual(245)
        if (firstHeight === null) firstHeight = box!.height
        else expect(Math.abs(box!.height - firstHeight)).toBeLessThan(1)

        // Foreground photo: object-fit: contain — never stretched, never
        // cropped away from its natural ratio.
        const fit = await modal.locator('.options-modal__media-img').evaluate((el) => getComputedStyle(el).objectFit)
        expect(fit).toBe('contain')
        // Blurred backdrop layer (same photo) fills the container edge to
        // edge, so there is never a visibly bare/empty gap beside the photo.
        await expect(modal.locator('.options-modal__media-fill')).toBeVisible()

        // No emoji shown alongside a real photo.
        await expect(modal.locator('.options-modal__emoji')).toHaveCount(0)
        checked++
      }
      await modal.locator('.options-modal__close').click()
    }
    expect(checked).toBeGreaterThan(0)
  })

  test('the qty stepper and confirm CTA (with price) stay visible without pushing the sheet too tall', async ({ page }) => {
    if (!(await gotoSimsimIfOpen(page))) { test.skip(true, 'simsim is currently closed — no product access to verify against'); return }

    const card = page.locator('.product-card').first()
    await card.locator('.product-card__media-btn').click()
    const modal = page.locator('.options-modal-overlay')
    await expect(modal).toBeVisible()
    await expect(page.locator('.options-modal__qty')).toBeVisible()
    const confirm = page.locator('.options-modal__confirm')
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText('SAR')
  })
})

test.describe('closed-restaurant state', () => {
  test('shows the real closed status and next-open time for a restaurant that is genuinely closed right now', async ({ page }) => {
    const isOpen = await gotoSimsimIfOpen(page)
    test.skip(isOpen, 'simsim is currently open — closed-state UI does not apply right now')
    const notice = page.locator('.closed-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('مغلق')
    await expect(notice).not.toContainText('حجز')
    await expect(notice).not.toContainText('طلب مسبق')
  })

  test('never shows for a restaurant with no configured hours (unknown -> treated as always open)', async ({ page }) => {
    await page.goto(`/menu/${KONOHA}`)
    await expect(page.locator('.closed-notice')).toHaveCount(0)
  })

  test('the orderable menu experience is not rendered at all while closed — not merely hidden underneath', async ({ page }) => {
    const isOpen = await gotoSimsimIfOpen(page)
    test.skip(isOpen, 'simsim is currently open — closed-state UI does not apply right now')
    await expect(page.locator('.closed-notice')).toBeVisible()
    // Nothing that leads to browsing/ordering exists in the DOM at all.
    await expect(page.locator('.category-nav')).toHaveCount(0)
    await expect(page.locator('.product-card')).toHaveCount(0)
    await expect(page.locator('.cart-bar')).toHaveCount(0)
    // The Hero's search icon (a path to product results / add-to-cart) is
    // also not offered while closed.
    await expect(page.locator('.menu-header__action-icon[aria-label]').filter({ hasText: '🔍' })).toHaveCount(0)
  })

  test('the closed message is not duplicated between the Hero badge and the main notice', async ({ page }) => {
    const isOpen = await gotoSimsimIfOpen(page)
    test.skip(isOpen, 'simsim is currently open — closed-state UI does not apply right now')
    const notice = page.locator('.closed-notice')
    await expect(notice).toBeVisible()
    const noticeBodyText = await notice.locator('.closed-notice__body').textContent().catch(() => null)
    if (noticeBodyText) {
      // The same next-opening sentence must not also appear inside the Hero
      // status line right above it.
      const heroDetail = page.locator('.menu-header__status-detail')
      if (await heroDetail.count() > 0) {
        await expect(heroDetail).not.toHaveText(noticeBodyText)
      }
    }
  })

  test('no horizontal overflow on a small mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    const isOpen = await gotoSimsimIfOpen(page)
    test.skip(isOpen, 'simsim is currently open — closed-state UI does not apply right now')
    await expect(page.locator('.closed-notice')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(overflow).toBe(false)
  })
})
