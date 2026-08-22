/**
 * Phase 2 — Task 2.1
 * E2E: auth → onboarding → menu create flow
 *
 * Required env vars:
 *   E2E_BASE_URL          (default: https://simsimmenu.com)
 *   E2E_OWNER_EMAIL       Restaurant owner test account email
 *   E2E_OWNER_PASSWORD    Restaurant owner test account password
 *
 * Optional (onboarding sub-test only):
 *   E2E_ONBOARDING_EMAIL     Account with onboarding_completed=false in DB
 *   E2E_ONBOARDING_PASSWORD
 *
 * Tests skip gracefully when required vars are absent.
 */

import { expect, Page, test } from '@playwright/test'

const BASE = (process.env.E2E_BASE_URL || 'https://simsimmenu.com').replace(/\/$/, '')
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD
const ONBOARDING_EMAIL = process.env.E2E_ONBOARDING_EMAIL
const ONBOARDING_PASSWORD = process.env.E2E_ONBOARDING_PASSWORD

function req(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required E2E variable: ${name}`)
  return value
}

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE}/login`)
  await page.waitForLoadState('domcontentloaded')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
}

// ─── 2.1-A: Authentication ────────────────────────────────────────────────────

test.describe('2.1-A auth', () => {
  test('valid credentials redirect away from /login', async ({ page }) => {
    test.skip(!OWNER_EMAIL, 'Set E2E_OWNER_EMAIL + E2E_OWNER_PASSWORD to run auth tests')

    const email = req('E2E_OWNER_EMAIL', OWNER_EMAIL)
    const password = req('E2E_OWNER_PASSWORD', OWNER_PASSWORD)

    await page.goto(`${BASE}/login`)
    await page.waitForLoadState('domcontentloaded')

    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button[type="submit"]').click()

    // Redirects to an authenticated page — not /login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })

    // No auth error shown
    await expect(page.locator('body')).not.toContainText('البريد أو كلمة المرور غير صحيحة')
  })

  test('invalid credentials stay on /login', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.waitForLoadState('domcontentloaded')

    await page.locator('input[type="email"]').fill('invalid-e2e@test.invalid')
    await page.locator('input[type="password"]').fill('wrong-password-xyz-1234')
    await page.locator('button[type="submit"]').click()

    // Must stay on /login — no redirect
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})

// ─── 2.1-B: Menu create flow ──────────────────────────────────────────────────

test.describe('2.1-B menu create', () => {
  test('create test category then delete it (full round-trip)', async ({ page }) => {
    test.skip(!OWNER_EMAIL, 'Set E2E_OWNER_EMAIL + E2E_OWNER_PASSWORD to run menu tests')

    const email = req('E2E_OWNER_EMAIL', OWNER_EMAIL)
    const password = req('E2E_OWNER_PASSWORD', OWNER_PASSWORD)

    // Unique name so the cleanup selector is unambiguous
    const catName = `E2E-${Date.now()}`

    await loginAs(page, email, password)

    // Navigate to menu (categories tab is default)
    await page.goto(`${BASE}/menu`)
    await page.waitForLoadState('networkidle')

    // Open add-category modal via the header "＋ قسم" button
    // (present regardless of whether any categories exist)
    await page.getByRole('button', { name: '＋ قسم' }).click()

    // Fill category name and save
    await page.getByPlaceholder('مثال: البرغر، المشروبات...').fill(catName)
    await page.getByRole('button', { name: /إضافة القسم/ }).click()

    // Category must appear in the list
    await expect(page.getByText(catName)).toBeVisible({ timeout: 8_000 })

    // ── Cleanup: delete the test category ─────────────────────────────────────
    // DOM structure (from Menu.jsx source):
    //   text-div (fontWeight:800)          ← getByText returns this element
    //     ancestor::div[1] = name-container (flex:1)
    //     ancestor::div[2] = card-div      (background:white, display:flex)
    //       div[1] = icon-div
    //       div[2] = name-container        (same as ancestor::div[1])
    //       div[3] = buttons-div           ← div[last()]
    //         button[1] = visibility toggle
    //         button[2] = edit (✏️)
    //         button[3] = delete (🗑️)     ← button[last()]
    await page
      .getByText(catName, { exact: true })
      .locator('xpath=ancestor::div[2]/div[last()]/button[last()]')
      .click()

    // Confirm delete in the ConfirmDialog
    await page.getByRole('button', { name: 'حذف' }).click()

    // Category must be gone
    await expect(page.getByText(catName)).not.toBeVisible({ timeout: 5_000 })
  })
})

// ─── 2.1-C: Onboarding flow ───────────────────────────────────────────────────

test.describe('2.1-C onboarding', () => {
  /**
   * Pre-condition (owner DBA action required before running this test):
   *
   *   UPDATE restaurants
   *   SET    onboarding_completed = false,
   *          onboarding_step      = NULL
   *   WHERE  owner_id = (
   *     SELECT id FROM auth.users WHERE email = '<E2E_ONBOARDING_EMAIL>'
   *   );
   *
   * The account must exist in Supabase Auth and have a restaurant row.
   * This reset must be re-applied before each CI run of this test.
   */
  test('account with onboarding_completed=false is redirected to /onboarding', async ({ page }) => {
    test.skip(
      !ONBOARDING_EMAIL,
      'Set E2E_ONBOARDING_EMAIL + E2E_ONBOARDING_PASSWORD (and reset onboarding_completed=false in DB) to run this test'
    )

    const email = req('E2E_ONBOARDING_EMAIL', ONBOARDING_EMAIL)
    const password = req('E2E_ONBOARDING_PASSWORD', ONBOARDING_PASSWORD)

    await page.goto(`${BASE}/login`)
    await page.waitForLoadState('domcontentloaded')

    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button[type="submit"]').click()

    // Must land on /onboarding — not /login, not /dashboard
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 })

    // Onboarding page must exit the loading phase
    await expect(page.locator('[data-onboarding-phase]')).not.toHaveAttribute(
      'data-onboarding-phase',
      'loading',
      { timeout: 10_000 }
    )
  })
})
