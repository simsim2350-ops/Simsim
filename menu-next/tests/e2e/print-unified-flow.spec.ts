import { test, expect } from '@playwright/test'

// Regression suite for the "جاري طباعة الطلب..." stuck-forever bug (real
// production order #0180 — see PRINT_FLOW_STUCK_FIX_EXECUTION_REPORT.md).
// ROOT CAUSE: window.print() was never actually the same event as
// print_jobs.status = 'printed' — the old code set 'printing' and called
// window.print(), then had no further path to a terminal state without a
// manual click nobody was prompted to make. These tests exercise the real
// fix (PrintActions.tsx's 'afterprint'-driven completion + bounded
// hang-detection) against real print_jobs rows, with window.print()
// stubbed (a real print dialog cannot run in headless CI) but the
// completion signal it drives — the real 'afterprint' DOM event — fired
// or withheld exactly as a real browser would.
//
// Fixture rows (is_test=true, restaurant "سمسم") — env-var gated, same
// convention as print-css.spec.ts/print-social-footer.spec.ts. A repeat
// CI run needs these reset to their starting status (a 'pending'/
// 'printing' row that already resolved to printed/failed in an earlier
// run will correctly no-op on autoprint — by design, see Test 8 below —
// so it must be reset, not just reused, to re-exercise the pending path).
const PENDING_INVOICE_JOB_ID = process.env.UNIFIED_FLOW_PENDING_INVOICE_JOB_ID
const PENDING_INVOICE_TOKEN = process.env.UNIFIED_FLOW_PENDING_INVOICE_TOKEN
const HANG_INVOICE_JOB_ID = process.env.UNIFIED_FLOW_HANG_INVOICE_JOB_ID
const HANG_INVOICE_TOKEN = process.env.UNIFIED_FLOW_HANG_INVOICE_TOKEN
const ALREADY_PRINTED_JOB_ID = process.env.UNIFIED_FLOW_PRINTED_JOB_ID
const ALREADY_PRINTED_TOKEN = process.env.UNIFIED_FLOW_PRINTED_TOKEN
const SEQ_INVOICE_JOB_ID = process.env.UNIFIED_FLOW_SEQ_INVOICE_JOB_ID
const SEQ_INVOICE_TOKEN = process.env.UNIFIED_FLOW_SEQ_INVOICE_TOKEN
const SEQ_TICKET_JOB_ID = process.env.UNIFIED_FLOW_SEQ_TICKET_JOB_ID
const SEQ_TICKET_TOKEN = process.env.UNIFIED_FLOW_SEQ_TICKET_TOKEN
const FAILED_INVOICE_JOB_ID = process.env.UNIFIED_FLOW_FAILED_INVOICE_JOB_ID
const FAILED_INVOICE_TOKEN = process.env.UNIFIED_FLOW_FAILED_INVOICE_TOKEN
const TICKET_FOR_FAILED_INVOICE_JOB_ID = process.env.UNIFIED_FLOW_TICKET_FOR_FAILED_INVOICE_JOB_ID
const TICKET_FOR_FAILED_INVOICE_TOKEN = process.env.UNIFIED_FLOW_TICKET_FOR_FAILED_INVOICE_TOKEN

// Stubs window.print() to a no-op spy (a real print dialog can't run
// headless) — installed before navigation so it's in place before
// PrintActions.tsx's autoprint effect ever calls it.
async function stubPrint(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    ;(window as unknown as { __printCalls: number }).__printCalls = 0
    window.print = () => { (window as unknown as { __printCalls: number }).__printCalls += 1 }
  })
}

// The status BADGE's own text ("تمت الطباعة"/"فشلت الطباعة"/"قيد
// الطباعة") is a substring of the manual confirm/fail BUTTONS' own labels
// ("✓ تمت الطباعة"/"✗ فشلت الطباعة") — getByText(..., {exact:false})
// (the default) matches both and trips Playwright's strict-mode check.
// This targets the badge specifically via its CSS Module class, which is
// stable (content-hashed prefix, literal suffix — see print.module.css).
function statusBadge(page: import('@playwright/test').Page) {
  return page.locator('[class*="statusBadge--"]')
}

// TEST 1 — Customer Invoice runs, then the UI does NOT stay stuck on
// "قيد الطباعة": the real 'afterprint' event (what a browser fires when
// the print dialog it opened is dismissed) drives it all the way to
// "تمت الطباعة" with no manual click and no assumption that print()
// returning means success.
test('Test 1: autoprint reaches "تمت الطباعة" via the real afterprint event, never stuck on "قيد الطباعة"', async ({ page }) => {
  test.skip(!PENDING_INVOICE_JOB_ID || !PENDING_INVOICE_TOKEN, 'requires UNIFIED_FLOW_PENDING_INVOICE_JOB_ID/TOKEN (a real print_jobs row at status=pending)')
  await stubPrint(page)
  await page.goto(`/print/${PENDING_INVOICE_JOB_ID}?token=${PENDING_INVOICE_TOKEN}&autoprint=1`)
  await expect(statusBadge(page)).toHaveText('قيد الطباعة')
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await expect(statusBadge(page)).toHaveText('تمت الطباعة', { timeout: 10_000 })
  const printCalls = await page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls)
  expect(printCalls).toBe(1)
})

// Hang detection: if 'afterprint' never fires (tab closed before the OS
// dialog ever appeared, or the browser simply never fires it), the job
// must become a visible FAILURE within the bounded hang timeout — NEVER
// silently assumed PRINTED. hangTimeoutMs is a test-only override (see
// PrintActions.tsx) so this doesn't need to wait out the real 90s default.
test('hang detection: no afterprint within the timeout -> explicit FAILED, never a false "تمت الطباعة"', async ({ page }) => {
  test.skip(!HANG_INVOICE_JOB_ID || !HANG_INVOICE_TOKEN, 'requires UNIFIED_FLOW_HANG_INVOICE_JOB_ID/TOKEN (a real print_jobs row at status=pending)')
  await stubPrint(page)
  await page.goto(`/print/${HANG_INVOICE_JOB_ID}?token=${HANG_INVOICE_TOKEN}&autoprint=1&hangTimeoutMs=400`)
  await expect(statusBadge(page)).toHaveText('قيد الطباعة')
  // Deliberately never dispatch 'afterprint'.
  await expect(statusBadge(page)).toHaveText('فشلت الطباعة', { timeout: 10_000 })
  await expect(page.getByText('لم يتم تأكيد اكتمال الطباعة', { exact: false })).toBeVisible()
})

// TEST 8 — a job already PRINTED is never auto-reprinted just because the
// page (re)loads with autoprint=1 (a stale/duplicate window.open, a
// reload, a re-render) — window.print() must never be called again.
test('Test 8: a job already PRINTED is not reprinted on reload/re-open', async ({ page }) => {
  test.skip(!ALREADY_PRINTED_JOB_ID || !ALREADY_PRINTED_TOKEN, 'requires UNIFIED_FLOW_PRINTED_JOB_ID/TOKEN (a real print_jobs row at status=printed)')
  await stubPrint(page)
  await page.goto(`/print/${ALREADY_PRINTED_JOB_ID}?token=${ALREADY_PRINTED_TOKEN}&autoprint=1`)
  await expect(statusBadge(page)).toHaveText('تمت الطباعة')
  await page.waitForTimeout(1000)
  const printCalls = await page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls)
  expect(printCalls).toBe(0)
})

// Sequencing — Kitchen Ticket must not print while Customer Invoice is
// still genuinely in flight, and must proceed once Invoice reaches a real
// terminal state (here: the SAME manual "✓ تمت الطباعة" button a staff
// member would click, simulating that exact real action rather than a
// direct database write from the test).
test('Kitchen Ticket waits for a real Customer Invoice resolution before printing, then proceeds', async ({ browser }) => {
  test.skip(
    !SEQ_INVOICE_JOB_ID || !SEQ_INVOICE_TOKEN || !SEQ_TICKET_JOB_ID || !SEQ_TICKET_TOKEN,
    'requires UNIFIED_FLOW_SEQ_INVOICE_JOB_ID/TOKEN (status=printing) and UNIFIED_FLOW_SEQ_TICKET_JOB_ID/TOKEN (status=pending)'
  )
  const context = await browser.newContext()
  const invoicePage = await context.newPage()
  const ticketPage = await context.newPage()
  await stubPrint(ticketPage)

  await invoicePage.goto(`/print/${SEQ_INVOICE_JOB_ID}?token=${SEQ_INVOICE_TOKEN}`)
  await ticketPage.goto(`/print/${SEQ_TICKET_JOB_ID}?token=${SEQ_TICKET_TOKEN}&autoprint=1&waitForJobId=${SEQ_INVOICE_JOB_ID}&waitForToken=${SEQ_INVOICE_TOKEN}`)

  await ticketPage.waitForTimeout(2000)
  expect(await ticketPage.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls)).toBe(0)

  // The real user action: confirm the invoice on its own tab.
  await invoicePage.getByRole('button', { name: '✓ تمت الطباعة' }).click()
  await expect(statusBadge(invoicePage)).toHaveText('تمت الطباعة')

  await expect.poll(
    async () => ticketPage.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls),
    { timeout: 10_000 }
  ).toBe(1)

  await context.close()
})

// Corrective fix on top of the above: a FAILED Customer Invoice must
// never let Kitchen Ticket print. The original wait-for-sibling logic
// treated "sibling left pending/printing" as "safe to proceed" regardless
// of which terminal state it reached — so a FAILED invoice still let the
// ticket auto-print. Fixed to only proceed on a confirmed PRINTED
// sibling; any other outcome (FAILED, or the wait timing out without a
// resolution) marks Kitchen Ticket FAILED too instead of printing it.
test('Customer Invoice FAILED -> Kitchen Ticket does not print, and is marked FAILED too', async ({ page }) => {
  test.skip(
    !FAILED_INVOICE_JOB_ID || !FAILED_INVOICE_TOKEN || !TICKET_FOR_FAILED_INVOICE_JOB_ID || !TICKET_FOR_FAILED_INVOICE_TOKEN,
    'requires UNIFIED_FLOW_FAILED_INVOICE_JOB_ID/TOKEN (status=failed) and UNIFIED_FLOW_TICKET_FOR_FAILED_INVOICE_JOB_ID/TOKEN (status=pending)'
  )
  await stubPrint(page)
  await page.goto(
    `/print/${TICKET_FOR_FAILED_INVOICE_JOB_ID}?token=${TICKET_FOR_FAILED_INVOICE_TOKEN}&autoprint=1&waitForJobId=${FAILED_INVOICE_JOB_ID}&waitForToken=${FAILED_INVOICE_TOKEN}`
  )
  await expect(statusBadge(page)).toHaveText('فشلت الطباعة', { timeout: 10_000 })
  await expect(page.getByText('لأن فاتورة العميل فشلت', { exact: false })).toBeVisible()
  const printCalls = await page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls)
  expect(printCalls).toBe(0)
})
