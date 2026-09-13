import { test, expect } from '@playwright/test'

// PHASE 2.5/3 diagnostic — verifies the actual bug reported from a real
// Android/Chrome print preview: PrintNav ("رجوع"/"لوحة التحكم") and
// PrintActions (buttons + status badge) were visible inside the print
// output. Root cause: both apply a literal, unscoped `noPrint` class, but
// print.module.css defined `.noPrint` without `:global(...)`, so CSS
// Modules hashed it to a selector the DOM class never matched — nothing
// was ever actually hidden by `@media print`. Fixed by wrapping the rule
// in `:global(.noPrint)`. These tests emulate print media (no real
// printer/OS dialog involved) and assert computed visibility, which is
// the only thing `window.print()` itself would ever have differed on.
test('print media hides PrintNav on the token-error branch', async ({ page }) => {
  await page.goto('/print/00000000-0000-0000-0000-000000000000')
  await expect(page.getByText('تعذّر فتح هذا المستند')).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.noPrint').first()).toBeHidden()
})

test('print media hides PrintNav and PrintActions on a real rendered document, leaving only the invoice/ticket', async ({ page }) => {
  // A real, pre-existing is_test print job (created via Branches.jsx's own
  // "طباعة تجريبية" button during real Android testing) — read-only here,
  // no status-changing RPC is called by this test.
  const token = process.env.PRINT_CSS_TEST_TOKEN
  const jobId = process.env.PRINT_CSS_TEST_JOB_ID
  test.skip(!token || !jobId, 'requires PRINT_CSS_TEST_JOB_ID/PRINT_CSS_TEST_TOKEN env vars (a real print_jobs row)')

  await page.goto(`/print/${jobId}?token=${token}`)
  await expect(page.locator('[class*="paper"]')).toBeVisible()

  await page.emulateMedia({ media: 'print' })
  const noPrintEls = page.locator('.noPrint')
  const count = await noPrintEls.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    await expect(noPrintEls.nth(i)).toBeHidden()
  }
  // The invoice/ticket content itself must remain visible under print.
  await expect(page.locator('[class*="paper"]')).toBeVisible()
})
