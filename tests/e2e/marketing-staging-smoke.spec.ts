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
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes(productionSupabaseHost)) productionRequests.push(url)
    if (url.includes('.supabase.co') && !url.includes(expectedSupabaseHost)) productionRequests.push(url)
  })
  page.on('response', (response) => {
    const url = response.url()
    if (url.includes('/rest/v1/rpc/') && response.status() >= 400) marketingFailures.push(`${response.status()} ${url}`)
  })

  await page.goto(`${baseUrl.replace(/\/$/, '')}/admin/login`)
  if (await page.getByRole('heading', { name: /Log in to Vercel/i }).isVisible().catch(() => false)) {
    throw new Error('BLOCKED — Vercel Preview Protection requires an automation bypass credential or an authenticated CI storageState; the Supabase Super Admin form is not reachable in a fresh Playwright context.')
  }
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.getByLabel('كلمة المرور').fill(password)
  await page.getByRole('button', { name: /دخول لوحة المنصّة/i }).click()
  await expect(page).toHaveURL(/\/admin(?:$|\/)/)

  await page.goto(`${baseUrl.replace(/\/$/, '')}/admin/marketing`)
  await expect(page.getByText('إدارة الموقع التسويقي')).toBeVisible()
  await expect(page.getByText('super_admin')).toBeVisible()
  expect(productionRequests, productionRequests.join('\n')).toEqual([])
  expect(marketingFailures, marketingFailures.join('\n')).toEqual([])
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})
