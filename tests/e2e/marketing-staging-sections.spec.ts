import { expect, test, type Locator, type Page } from '@playwright/test'

const adminBaseUrl = process.env.E2E_ADMIN_BASE_URL
const publicBaseUrl = process.env.E2E_MARKETING_PUBLIC_URL
const expectedSupabaseHost = process.env.E2E_EXPECTED_SUPABASE_HOST || 'rgqsetckcigkgsyobyjg.supabase.co'
const productionSupabaseHost = 'gpwwnuuicywsvmmhxngs.supabase.co'

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required E2E variable: ${name}`)
  return value
}

function sectionCards(page: Page, type: string): Locator {
  return page.locator('article').filter({ has: page.getByRole('button', { name: new RegExp(`[+−] ${type}`) }) })
}

async function ensureExpanded(card: Locator, type: string) {
  const fields = card.locator('input:not([type="checkbox"]), textarea')
  if ((await fields.count()) === 0) {
    await card.getByRole('button', { name: new RegExp(`(?:\\+|−) ${type}$`) }).click()
  }
  await expect(fields.first()).toBeVisible()
}

async function sectionCardsWithHeading(page: Page, type: string, heading: string): Promise<Locator[]> {
  const cards = sectionCards(page, type)
  const matches: Locator[] = []
  for (let index = 0; index < await cards.count(); index += 1) {
    const card = cards.nth(index)
    await ensureExpanded(card, type)
    if (await card.locator('input:not([type="checkbox"])').nth(1).inputValue() === heading) matches.push(card)
  }
  return matches
}

async function sectionCardWithHeading(page: Page, type: string, heading: string): Promise<Locator> {
  const matches = await sectionCardsWithHeading(page, type, heading)
  if (matches.length !== 1) throw new Error(`Expected exactly one ${type} section with heading: ${heading}; found ${matches.length}`)
  return matches[0]
}

async function sectionPosition(card: Locator): Promise<number> {
  return card.evaluate((element) => Array.from(element.parentElement?.children || []).indexOf(element))
}

async function moveSectionBefore(page: Page, movingType: string, movingHeading: string, targetType: string, targetHeading: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const moving = await sectionCardWithHeading(page, movingType, movingHeading)
    const target = await sectionCardWithHeading(page, targetType, targetHeading)
    if (await sectionPosition(moving) < await sectionPosition(target)) return
    await moving.getByRole('button', { name: '↑' }).click()
  }
  throw new Error(`Unable to move ${movingType} before ${targetType} within 50 operations`)
}

async function publish(page: Page) {
  await page.getByRole('button', { name: 'نشر الآن' }).click()
  await expect(page.getByText('نُشرت المراجعة وأُبطل كاش الصفحة الموجّه.')).toBeVisible({ timeout: 20_000 })
}

async function publicText(page: Page, url: string): Promise<string> {
  const publicPage = await page.context().newPage()
  try {
    const response = await publicPage.goto(url, { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBe(200)
    return await publicPage.locator('body').innerText()
  } finally {
    await publicPage.close()
  }
}

async function expectPublic(page: Page, url: string, text: string, present: boolean) {
  await expect.poll(async () => (await publicText(page, url)).includes(text), { timeout: 25_000, intervals: [1_000, 2_000, 3_000] }).toBe(present)
}

test('Staging Typed Sections E2E publishes and controls HERO, FAQ, CTA, and FEATURES without production egress', async ({ page }) => {
  test.setTimeout(240_000)
  const baseUrl = required('E2E_ADMIN_BASE_URL', adminBaseUrl)
  const publicUrl = required('E2E_MARKETING_PUBLIC_URL', publicBaseUrl)
  const email = required('E2E_SUPER_ADMIN_EMAIL', process.env.E2E_SUPER_ADMIN_EMAIL)
  const password = required('E2E_SUPER_ADMIN_PASSWORD', process.env.E2E_SUPER_ADMIN_PASSWORD)
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  const productionRequests: string[] = []
  const marketingFailures: string[] = []
  const marketingConsoleErrors: string[] = []
  const isMarketingRpc = (url: string) => /\/rest\/v1\/rpc\/(?:marketing_|admin_[^/]*marketing)/.test(url)
  const isMarketingConsoleError = (text: string) => /marketing|site_settings|marketing_page|marketing_media/i.test(text)

  page.on('request', (request) => {
    const url = request.url()
    if (url.includes(productionSupabaseHost) || (url.includes('.supabase.co') && !url.includes(expectedSupabaseHost))) productionRequests.push(url)
  })
  page.on('response', (response) => {
    if (isMarketingRpc(response.url()) && response.status() >= 400) marketingFailures.push(`${response.status()} ${response.url()}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error' && isMarketingConsoleError(message.text())) marketingConsoleErrors.push(message.text())
  })
  page.on('dialog', (dialog) => dialog.accept())

  const loginUrl = `${baseUrl.replace(/\/$/, '')}/admin/login`
  const protectedLoginUrl = secret ? `${loginUrl}?x-vercel-protection-bypass=${encodeURIComponent(secret)}` : loginUrl
  if (secret) await page.setExtraHTTPHeaders({ 'x-vercel-protection-bypass': secret, 'x-vercel-set-bypass-cookie': 'true' })
  await page.goto(protectedLoginUrl)
  await page.waitForLoadState('domcontentloaded')
  if (secret) await page.setExtraHTTPHeaders({})
  if (await page.getByRole('heading', { name: /Log in to Vercel/i }).isVisible().catch(() => false)) throw new Error('BLOCKED — Vercel Preview Protection is not bypassed for Playwright.')
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /دخول لوحة المنصّة/i }).click()
  await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 })
  await page.goto(`${baseUrl.replace(/\/$/, '')}/admin/marketing`)
  await expect(page.getByText('إدارة الموقع التسويقي')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'تحرير' }).first().click()
  await expect(page.getByText(/مسودة: home/)).toBeVisible({ timeout: 15_000 })

  const suffix = `run-${Date.now().toString(36)}`
  const heroMarker = `E2E AUTO HERO ${suffix}`
  const faqMarker = `E2E AUTO FAQ ${suffix}`
  const featureMarker = `E2E AUTO FEATURES ${suffix}`
  const ctaMarker = `E2E AUTO CTA ${suffix}`

  // Edit existing HERO, FEATURES, and CTA; add a valid FAQ through the typed-section selector.
  const hero = sectionCards(page, 'HERO').first()
  await ensureExpanded(hero, 'HERO')
  await hero.locator('input:not([type="checkbox"])').nth(1).fill(heroMarker)

  const features = sectionCards(page, 'FEATURES').first()
  await ensureExpanded(features, 'FEATURES')
  await features.locator('input:not([type="checkbox"])').nth(1).fill(featureMarker)

  const cta = sectionCards(page, 'CTA').first()
  await ensureExpanded(cta, 'CTA')
  await cta.locator('input:not([type="checkbox"])').nth(1).fill(ctaMarker)

  await page.getByRole('combobox').first().selectOption('FAQ')
  const faq = sectionCards(page, 'FAQ').last()
  await ensureExpanded(faq, 'FAQ')
  await faq.locator('input:not([type="checkbox"])').nth(1).fill(faqMarker)
  await faq.locator('input:not([type="checkbox"])').nth(2).fill(`سؤال ${faqMarker}`)
  await faq.locator('textarea').nth(1).fill(`إجابة ${faqMarker}`)
  await page.getByRole('button', { name: 'حفظ' }).click()
  await expect(page.getByText('حُفظت المسودة')).toBeVisible({ timeout: 15_000 })
  await publish(page)

  await expectPublic(page, publicUrl, heroMarker, true)
  await expectPublic(page, publicUrl, featureMarker, true)
  await expectPublic(page, publicUrl, ctaMarker, true)
  await expectPublic(page, publicUrl, faqMarker, true)

  // Hide the added FAQ, publish, and prove it is absent publicly.
  const addedFaq = await sectionCardWithHeading(page, 'FAQ', faqMarker)
  await addedFaq.locator('input[type="checkbox"]').uncheck()
  await publish(page)
  await expectPublic(page, publicUrl, faqMarker, false)

  // Show it again, move it before the uniquely marked CTA, publish, and prove public order changed.
  const shownFaq = await sectionCardWithHeading(page, 'FAQ', faqMarker)
  await shownFaq.locator('input[type="checkbox"]').check()
  await moveSectionBefore(page, 'FAQ', faqMarker, 'CTA', ctaMarker)
  const reorderedFaq = await sectionCardWithHeading(page, 'FAQ', faqMarker)
  const markedCta = await sectionCardWithHeading(page, 'CTA', ctaMarker)
  expect(await sectionPosition(reorderedFaq)).toBeLessThan(await sectionPosition(markedCta))
  await publish(page)
  await expectPublic(page, publicUrl, faqMarker, true)
  await expect.poll(async () => {
    const text = await publicText(page, publicUrl)
    return text.indexOf(faqMarker) < text.indexOf(ctaMarker)
  }, { timeout: 25_000, intervals: [1_000, 2_000, 3_000] }).toBe(true)

  // Duplicate the added FAQ, publish, then delete the duplicate and prove its removal publicly.
  const visibleFaq = await sectionCardWithHeading(page, 'FAQ', faqMarker)
  await visibleFaq.getByRole('button', { name: 'نسخ' }).click()
  await publish(page)
  const copiesAfterDuplicate = ((await publicText(page, publicUrl)).match(new RegExp(faqMarker, 'g')) || []).length
  expect(copiesAfterDuplicate).toBeGreaterThan(1)

  const faqCopies = await sectionCardsWithHeading(page, 'FAQ', faqMarker)
  expect(faqCopies).toHaveLength(2)
  await faqCopies[1].getByRole('button', { name: 'حذف' }).first().click()
  await publish(page)
  await expect.poll(async () => ((await publicText(page, publicUrl)).match(new RegExp(faqMarker, 'g')) || []).length, { timeout: 25_000, intervals: [1_000, 2_000, 3_000] }).toBeLessThan(copiesAfterDuplicate)

  expect(productionRequests, productionRequests.join('\n')).toEqual([])
  expect(marketingFailures, marketingFailures.join('\n')).toEqual([])
  expect(marketingConsoleErrors, marketingConsoleErrors.join('\n')).toEqual([])
})
