import { test, expect } from '@playwright/test'

// STEP 5 — i18n. Regression guard against the known, documented gap (root
// <html> stays lang="ar" dir="rtl" regardless — see the Final QA report,
// §4.8) by asserting on the actual content wrapper, which is what correctly
// carries the per-request language, not the static <html> tag.

test('default (Arabic) renders RTL on the content wrapper', async ({ page }) => {
  await page.goto('/menu/konoha')
  const frame = page.locator('.menu-frame')
  await expect(frame).toHaveAttribute('dir', 'rtl')
  await expect(frame).toHaveAttribute('lang', 'ar')
})

test('?lang=en switches the content wrapper to English/LTR', async ({ page }) => {
  await page.goto('/menu/konoha?lang=en')
  const frame = page.locator('.menu-frame')
  await expect(frame).toHaveAttribute('dir', 'ltr')
  await expect(frame).toHaveAttribute('lang', 'en')
  await expect(frame).toHaveClass(/lang-en/)
})
