import { test, expect } from '@playwright/test'

// STEP 8 — checkout UI only. Deliberately never submits a complete, valid
// order: CheckoutForm.tsx's handleSubmit calls validate() and returns before
// ever reaching the create_order RPC when validation fails (verified by
// reading the component's source, not assumed) — so triggering the
// validation-error path here is guaranteed not to create a real order. No
// test in this suite calls create_order. See STEP 9 in the regression report
// for why, and what was verified instead.

test('checkout loads with the real cart contents and a working order-type/summary UI, with no crash', async ({ page }) => {
  await page.goto('/menu/konoha')
  await page.locator('.product-card').first().locator('.add-to-cart-btn').click()
  const modal = page.locator('.options-modal-overlay')
  if (await modal.isVisible().catch(() => false)) {
    await modal.locator('.options-modal__choice').first().click()
    await modal.locator('.options-modal__confirm').click()
  }

  await page.locator('.cart-bar').click()
  await page.locator('.cart-sheet__checkout-btn').click()
  await expect(page).toHaveURL(/\/checkout\?/)

  const form = page.locator('form.checkout-form')
  await expect(form).toBeVisible()
  // The cart's real line(s) are summarized on the checkout page itself.
  await expect(form.locator('.checkout-form__items .checkout-form__item-row')).not.toHaveCount(0)
  await expect(form.locator('.checkout-form__submit')).toBeVisible()
})

test('submitting with a missing required phone number is blocked client-side, with no order created', async ({ page }) => {
  await page.goto('/menu/konoha')
  await page.locator('.product-card').first().locator('.add-to-cart-btn').click()
  const modal = page.locator('.options-modal-overlay')
  if (await modal.isVisible().catch(() => false)) {
    await modal.locator('.options-modal__choice').first().click()
    await modal.locator('.options-modal__confirm').click()
  }
  await page.locator('.cart-bar').click()
  await page.locator('.cart-sheet__checkout-btn').click()

  const form = page.locator('form.checkout-form')
  await expect(form).toBeVisible()

  // Leave the required phone field empty and try to submit.
  await form.locator('.checkout-form__submit').click()

  // Client-side validation error appears — the submit button must still read
  // its pre-submission label (never flips to "Submitting..."), proving the
  // RPC call was never reached.
  await expect(form.locator('#customerPhone + .checkout-form__error, .checkout-form__section:has(#customerPhone) .checkout-form__error')).toBeVisible()
  await expect(form.locator('.checkout-form__submit')).not.toHaveText(/submitting|جارٍ إرسال/i)
})

test('checkout with an empty cart shows a clean empty-cart message, not a crash', async ({ page }) => {
  const res = await page.goto('/menu/konoha/checkout')
  expect(res?.status()).toBe(200)
  await expect(page.locator('.menu-empty')).toBeVisible()
  await expect(page.locator('pre, .error-stack, [id^="__next"] pre')).toHaveCount(0)
})
