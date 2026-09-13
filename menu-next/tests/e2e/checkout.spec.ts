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

// ===== Professional phone-verification UX (OTP panel) =====
//
// "simsim" is a real restaurant in this environment with phone_verification
// = true (confirmed via a read-only Supabase check before writing this
// test: feature_value('phone_verification') = true for its id), so its
// checkout genuinely reaches the OTP panel on submit — unlike "konoha"
// (used by the tests above), which never needs to.
//
// Reaching the panel means CheckoutForm.tsx's real handleSubmit runs and
// gets a real 401 from /api/customer/checkout (safe: no session exists yet,
// nothing is created) and then calls the real sendOtp(), which invokes the
// Supabase Edge Function send-phone-otp — and THAT would send a real SMS to
// whatever phone number is typed in. This suite deliberately never lets
// that reach the real network: every send-phone-otp / verify-otp call below
// is intercepted via page.route() and answered with a canned response
// entirely inside the browser, before it leaves the page. No real SMS is
// ever sent and no real order is ever created by this file — verify-otp
// success is answered here too, so even the one "successful verification"
// scenario below never has a real, valid session; the retried
// /api/customer/checkout for that case is also intercepted, with an
// obviously-fake id.
const OTP_MENU_URL = '/menu/simsim?branch=d61f2cdf-883c-4f12-8898-7e9b47a7e354'
const TEST_PHONE = '512345678'

async function reachOtpPanel(page: import('@playwright/test').Page) {
  await page.route('**/functions/v1/send-phone-otp', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent' }) }))

  await page.goto(OTP_MENU_URL)
  await page.locator('.product-card').first().locator('.add-to-cart-btn').click({ force: true })
  const modal = page.locator('.options-modal-overlay')
  if (await modal.isVisible().catch(() => false)) {
    await modal.locator('.options-modal__choice').first().click().catch(() => {})
    await modal.locator('.options-modal__confirm').click({ force: true })
  }
  await page.locator('.cart-bar').click()
  await page.locator('.cart-sheet__checkout-btn').click()

  const form = page.locator('form.checkout-form')
  await expect(form).toBeVisible({ timeout: 45_000 })
  await page.getByRole('button', { name: 'استلام' }).click().catch(() => {}) // takeaway — needs no table/address
  await form.locator('#customerPhone').fill(TEST_PHONE)
  await form.locator('.checkout-form__submit').click()

  const panel = page.locator('.otp-panel')
  await expect(panel).toBeVisible({ timeout: 45_000 })
  return panel
}

test('OTP panel: 6 real cells, masked phone, digit-only input capped at 6, and the confirm button only enables at 6 digits', async ({ page }) => {
  const panel = await reachOtpPanel(page)

  await expect(panel.locator('.otp-input__cell')).toHaveCount(6)
  // customerPhone's last 4 digits (5678) only — never the full number.
  await expect(panel).toContainText('5678')
  await expect(panel).not.toContainText(TEST_PHONE)

  const input = panel.locator('.otp-input__control')
  const confirm = panel.locator('.otp-panel__confirm')
  await expect(confirm).toBeDisabled()

  // Non-digits are stripped and the value is capped at 6 — same filtering a
  // real paste or SMS-autofill would go through (there's no separate paste
  // handler; every source funnels through this one onChange).
  await input.fill('1a2b3c4d5e6f7g8')
  await expect(input).toHaveValue('123456')
  for (const cell of await panel.locator('.otp-input__cell').all()) {
    await expect(cell).not.toHaveText('')
  }
  await expect(confirm).toBeEnabled()

  await input.fill('123')
  await expect(confirm).toBeDisabled()
})

test('OTP panel: wrong code shows an inline error and keeps the customer on the same panel; cart/order data is untouched', async ({ page }) => {
  const panel = await reachOtpPanel(page)

  await page.route('**/api/customer/verify-otp', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ verified: false }) }))

  await panel.locator('.otp-input__control').fill('000000')
  await panel.locator('.otp-panel__confirm').click()

  await expect(panel.locator('.checkout-form__error')).toBeVisible()
  // Still the same panel, not the generic order-error banner, and the cart
  // summary above it is still there (never cleared on a wrong code).
  await expect(panel).toBeVisible()
  await expect(page.locator('.checkout-form__closed-banner[role="alert"]')).toHaveCount(0)
  await expect(page.locator('.checkout-form__items')).toBeVisible()
})

test('OTP panel: the resend cooldown is already running the moment the panel appears (the initial send just started it), showing a live mm:ss countdown', async ({ page }) => {
  const panel = await reachOtpPanel(page)

  // startVerification() starts the cooldown right after the initial send
  // succeeds — by the time the panel is visible, resend is already
  // disabled with a countdown, not freely clickable. This is what
  // "لا تسمح بإرسال OTP عدة مرات بسبب الضغط المتكرر" actually requires: the
  // very first send already arms the cooldown, not just repeat clicks.
  const resendBtn = panel.locator('.otp-panel__resend-btn')
  await expect(resendBtn).toBeDisabled()
  await expect(resendBtn).toHaveText(/\d{2}:\d{2}/)

  // The countdown is live (ticks down), not a static string.
  const first = await resendBtn.textContent()
  await page.waitForTimeout(2100)
  const second = await resendBtn.textContent()
  expect(second).not.toBe(first)

  // Clicking a disabled button is a no-op — still on the same panel, no
  // extra request went out (nothing here asserts on request count; the
  // route above would happily answer a second one too, so what actually
  // matters is that the disabled attribute itself prevents the click).
  await resendBtn.click({ force: true }).catch(() => {})
  await expect(panel).toBeVisible()
})

test('OTP panel: a correct code moves past the panel via the existing checkout retry, with no new navigation added by this task', async ({ page }) => {
  const panel = await reachOtpPanel(page)

  await page.route('**/api/customer/verify-otp', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ verified: true }) }))
  // The retried /api/customer/checkout after a verified code — answered
  // here with an obviously-fake id/order_number so this never touches a
  // real order row; this is exactly the same existing retry
  // (submitViaCheckoutApi) CheckoutForm.tsx already made before this task.
  await page.route('**/api/customer/checkout', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'e2e-test-fake-id', order_number: 'E2E-TEST', total: 0, price_changed: false, access_token: null }),
    }))

  await panel.locator('.otp-input__control').fill('123456')
  await panel.locator('.otp-panel__confirm').click()

  await expect(panel).toHaveCount(0)
})
