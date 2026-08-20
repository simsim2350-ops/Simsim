import { expect, test } from '@playwright/test'

const adminBaseUrl = process.env.E2E_ADMIN_BASE_URL
const expectedSupabaseHost = process.env.E2E_EXPECTED_SUPABASE_HOST || 'rgqsetckcigkgsyobyjg.supabase.co'
const productionSupabaseHost = 'gpwwnuuicywsvmmhxngs.supabase.co'

function requireValue(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required E2E variable: ${name}`)
  return value
}

test('Staging Super Admin can enter Marketing without production egress or CMS console/API errors', async ({ page }) => {
  const baseUrl = requireValue('E2E_ADMIN_BASE_URL', adminBaseUrl)
  const email = requireValue('E2E_SUPER_ADMIN_EMAIL', process.env.E2E_SUPER_ADMIN_EMAIL)
  const password = requireValue('E2E_SUPER_ADMIN_PASSWORD', process.env.E2E_SUPER_ADMIN_PASSWORD)
  const host = new URL(baseUrl).hostname
  expect(host).not.toContain('simsim.sa')

  const consoleErrors: string[] = []
  const productionRequests: string[] = []
  const marketingFailures: string[] = []
  const isMarketingRpc = (url: string) => /\/rest\/v1\/rpc\/(?:marketing_|admin_[^/]*marketing)/.test(url)
  const isMarketingConsoleError = (text: string) => /marketing|site_settings|marketing_page|marketing_media/i.test(text)
  page.on('console', (message) => {
    if (message.type() === 'error' && isMarketingConsoleError(message.text())) consoleErrors.push(message.text())
  })
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes(productionSupabaseHost)) productionRequests.push(url)
    if (url.includes('.supabase.co') && !url.includes(expectedSupabaseHost)) productionRequests.push(url)
  })
  page.on('response', (response) => {
    const url = response.url()
    if (isMarketingRpc(url) && response.status() >= 400) marketingFailures.push(`${response.status()} ${url}`)
  })

  const previewAccessUrl = process.env.E2E_VERCEL_SHARE_URL
  const loginUrl = previewAccessUrl || `${baseUrl.replace(/\/$/, '')}/admin/login`
  const protectedLoginUrl = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    ? `${loginUrl}${loginUrl.includes('?') ? '&' : '?'}x-vercel-protection-bypass=${encodeURIComponent(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)}`
    : loginUrl
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    await page.setExtraHTTPHeaders({
      'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      'x-vercel-set-bypass-cookie': 'true',
    })
  }
  await page.goto(protectedLoginUrl)
  await page.waitForLoadState('domcontentloaded')
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) await page.setExtraHTTPHeaders({})
  if (await page.getByRole('heading', { name: /Log in to Vercel/i }).isVisible().catch(() => false)) {
    throw new Error('BLOCKED — Vercel Preview Protection requires an automation bypass credential or an authenticated CI storageState; the Supabase Super Admin form is not reachable in a fresh Playwright context.')
  }
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /دخول لوحة المنصّة/i }).click()
  await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 })

  await page.goto(`${baseUrl.replace(/\/$/, '')}/admin/marketing`)
  await expect(page.getByText('إدارة الموقع التسويقي')).toBeVisible()
  await expect(page.getByText('super_admin')).toBeVisible()
  expect(productionRequests, productionRequests.join('\n')).toEqual([])
  expect(marketingFailures, marketingFailures.join('\n')).toEqual([])
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})
