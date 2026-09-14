import { test, expect } from '@playwright/test'

// Unified Print Button + Customer Invoice Social Media footer task —
// verifies the social/contact footer added to CustomerInvoice.tsx: only
// rendered on the Customer Invoice, reusing the restaurant's existing
// restaurants.social_links/show_social_links (no new schema), and NEVER
// on the Kitchen Ticket. Both job ids are real, pre-existing print_jobs
// rows (read-only here) — see HARDWARE_TEST.md-style convention already
// used by print-css.spec.ts for why real ids are passed via env vars
// rather than hardcoded (a specific row may not always exist).
const invoiceJobId = process.env.SOCIAL_FOOTER_TEST_INVOICE_JOB_ID
const invoiceToken = process.env.SOCIAL_FOOTER_TEST_INVOICE_TOKEN
const kitchenJobId = process.env.SOCIAL_FOOTER_TEST_KITCHEN_JOB_ID
const kitchenToken = process.env.SOCIAL_FOOTER_TEST_KITCHEN_TOKEN

test('Customer Invoice shows the configured social/contact footer', async ({ page }) => {
  test.skip(!invoiceJobId || !invoiceToken, 'requires SOCIAL_FOOTER_TEST_INVOICE_JOB_ID/TOKEN (a real print_jobs row for a restaurant with social_links configured)')
  await page.goto(`/print/${invoiceJobId}?token=${invoiceToken}`)
  await expect(page.getByText('تابعونا / تواصلوا معنا')).toBeVisible()
  // Real fixture restaurant has all 5 fields populated (see the execution
  // report) — every configured field's label must be shown, none hidden.
  for (const label of ['إنستقرام', 'واتساب', 'سناب شات', 'تويتر / X', 'تيك توك']) {
    await expect(page.getByText(label, { exact: false })).toBeVisible()
  }
})

test('Kitchen Ticket never shows any social/contact information', async ({ page }) => {
  test.skip(!kitchenJobId || !kitchenToken, 'requires SOCIAL_FOOTER_TEST_KITCHEN_JOB_ID/TOKEN (a real print_jobs row)')
  await page.goto(`/print/${kitchenJobId}?token=${kitchenToken}`)
  await expect(page.getByText('تابعونا')).toHaveCount(0)
  for (const label of ['إنستقرام', 'واتساب', 'سناب شات', 'تيك توك']) {
    await expect(page.getByText(label, { exact: false })).toHaveCount(0)
  }
})
