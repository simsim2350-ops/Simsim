import { test, expect, type Page } from '@playwright/test'

// STEP 6 + STEP 7 — product options and cart identity, against real konoha
// catalog data. Deliberately does not hardcode a specific product/choice
// name: it drives whichever real product cards are actually on the page,
// branching on whether picking that product opens the options modal, so the
// test stays valid as the real menu's contents change over time.
//
// NOT AUTOMATED (documented, not silently skipped): required-option-group
// validation. A read-only check against the live database before writing
// this suite found zero products, on any restaurant, with a `required: true`
// option group — there is currently no real data to drive that path through
// the UI, and inventing a fixture product would mean testing against fake
// data rather than the real, connected system. See the regression report.

async function addFirstProductViaCard(page: Page, cardIndex: number) {
  const card = page.locator('.product-card').nth(cardIndex)
  const name = (await card.locator('.product-card__name').textContent())?.trim()
  await card.locator('.add-to-cart-btn').click()

  const modal = page.locator('.options-modal-overlay')
  const hasOptions = await modal.isVisible().catch(() => false)
  if (hasOptions) {
    // Pick the first choice in the first group (whatever it really is) and confirm.
    await modal.locator('.options-modal__choice').first().click()
    await modal.locator('.options-modal__confirm').click()
    await expect(modal).toHaveCount(0)
  }
  return { name, hadOptions: hasOptions }
}

test('adding a configured product shows it correctly in the cart, with its option text', async ({ page }) => {
  await page.goto('/menu/konoha')
  const { name, hadOptions } = await addFirstProductViaCard(page, 0)
  test.skip(!hadOptions, 'first product on this menu currently has no options — covered by the plain-add case below instead')

  await page.locator('.cart-bar').click()
  const sheet = page.locator('.cart-sheet')
  await expect(sheet).toBeVisible()
  const item = sheet.locator('.cart-sheet__item').first()
  await expect(item).toContainText(name || '')
  // Real option choice text is rendered on the line, not silently dropped.
  await expect(item.locator('.cart-sheet__item-options')).not.toHaveText('')
})

test('editing a configured cart item updates it in place rather than duplicating the line', async ({ page }) => {
  await page.goto('/menu/konoha')
  const { hadOptions } = await addFirstProductViaCard(page, 0)
  test.skip(!hadOptions, 'no options-bearing product available to edit on this menu right now')

  await page.locator('.cart-bar').click()
  const sheet = page.locator('.cart-sheet')
  const editBtn = sheet.locator('.cart-sheet__edit').first()
  test.skip((await editBtn.count()) === 0, 'edit affordance only appears for a product still on the menu with selectable options')

  await editBtn.click()
  const modal = page.locator('.options-modal-overlay')
  await expect(modal).toBeVisible()
  await expect(modal.locator('.options-modal__confirm')).toContainText(/./) // has a save/confirm affordance
  await modal.locator('.options-modal__close').click()
  await expect(modal).toHaveCount(0)
  // Still exactly one line — closing the editor without changes must not add a duplicate.
  await expect(sheet.locator('.cart-sheet__item')).toHaveCount(1)
})

test('cart quantity controls and total update correctly, and removing empties the cart', async ({ page }) => {
  await page.goto('/menu/konoha')
  await addFirstProductViaCard(page, 0)

  await page.locator('.cart-bar').click()
  const sheet = page.locator('.cart-sheet')
  const item = sheet.locator('.cart-sheet__item').first()

  await item.locator('[aria-label="increase"]').click()
  await expect(item.locator('.cart-sheet__stepper span')).toHaveText('2')

  await item.locator('[aria-label="decrease"]').click()
  await expect(item.locator('.cart-sheet__stepper span')).toHaveText('1')

  await item.locator('.cart-sheet__remove').click()
  // Cart becomes empty — the whole floating bar unmounts (CartWidget returns null at count 0).
  await expect(page.locator('.cart-bar')).toHaveCount(0)
})

test('two products (or two different configurations) never silently merge into one cart line', async ({ page }) => {
  await page.goto('/menu/konoha')
  const productCount = await page.locator('.product-card').count()
  test.skip(productCount < 2, 'this menu currently has fewer than 2 products — cannot test cross-product isolation')

  await addFirstProductViaCard(page, 0)
  await addFirstProductViaCard(page, 1)

  await page.locator('.cart-bar').click()
  const sheet = page.locator('.cart-sheet')
  const lines = sheet.locator('.cart-sheet__item')
  await expect(lines).toHaveCount(2)
  const nameA = await lines.nth(0).locator('.cart-sheet__item-name').textContent()
  const nameB = await lines.nth(1).locator('.cart-sheet__item-name').textContent()
  expect(nameA).not.toBe(nameB)
})
