import { expect, test, type Page } from '@playwright/test'

// Back and Forward supersede a visit that is still on its way (app/routes/traverse.tsx): between the page's native
// #fragment entries too, which the browser traverses by itself. JavaScript only

const hydrated = (page: Page) => page.waitForFunction(() => history.state?.__fondu)
const address = (page: Page) =>
  page.evaluate(() => location.pathname + location.search + location.hash)
const state = (page: Page) => page.locator('#state')

/** `/long`'s page object is answered when `release()` is called */
async function slow(page: Page) {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  page.on('close', () => release()) // a failed case doesn't leave the request waiting
  await page.route('**/_fondu/pages/long.json*', async (route) => {
    await gate
    await route.continue().catch(() => {})
  })
  return release
}
/** a click that doesn't scroll the page to the link first (as Playwright's does) */
const press = (page: Page, selector: string) =>
  page.evaluate((selector) => document.querySelector<HTMLElement>(selector)!.click(), selector)
const visitLong = (page: Page) =>
  page.evaluate(() => document.querySelector<HTMLElement>('#to-long')!.click())

test.describe('a visit on its way, and a traversal between #fragment entries', () => {
  test('Back to a #fragment entry: the visit no longer commits, nothing is pending', async ({
    page,
  }) => {
    await page.goto('/traverse')
    await hydrated(page)
    await press(page, '#one-link')
    await press(page, '#two-link')
    expect(await address(page)).toBe('/traverse#two')
    const release = await slow(page)
    await visitLong(page)
    await expect(state(page)).toHaveText('loading')
    await page.goBack()
    expect(await address(page)).toBe('/traverse#one')
    await expect(state(page)).toHaveText('idle')
    release()
    await page.waitForTimeout(500)
    expect(await address(page)).toBe('/traverse#one')
    await expect(page.locator('h1')).toHaveText('Traverse')
    await expect(state(page)).toHaveText('idle')
    // the entries are as they were: Forward is the #two one
    await page.goForward()
    expect(await address(page)).toBe('/traverse#two')
    await expect(page.locator('h1')).toHaveText('Traverse')
  })

  test('Forward to a #fragment entry: the same', async ({ page }) => {
    await page.goto('/traverse')
    await hydrated(page)
    await press(page, '#one-link')
    await press(page, '#two-link')
    await page.goBack()
    expect(await address(page)).toBe('/traverse#one')
    const release = await slow(page)
    await visitLong(page)
    await expect(state(page)).toHaveText('loading')
    await page.goForward() // to the entry the visit would have replaced the forward ones of
    // the visit pushes only once answered: Forward is still #two
    expect(await address(page)).toBe('/traverse#two')
    await expect(state(page)).toHaveText('idle')
    release()
    await page.waitForTimeout(500)
    expect(await address(page)).toBe('/traverse#two')
    await expect(page.locator('h1')).toHaveText('Traverse')
  })

  test('Back to the entry before the fragment ones (the first, no fragment): the same', async ({
    page,
  }) => {
    await page.goto('/traverse')
    await hydrated(page)
    await press(page, '#one-link')
    const release = await slow(page)
    await visitLong(page)
    await expect(state(page)).toHaveText('loading')
    await page.goBack()
    expect(await address(page)).toBe('/traverse')
    await expect(state(page)).toHaveText('idle')
    release()
    await page.waitForTimeout(500)
    expect(await address(page)).toBe('/traverse')
    await expect(page.locator('h1')).toHaveText('Traverse')
  })

  test('a #fragment entry’s scroll position is still restored', async ({ page }) => {
    await page.goto('/traverse')
    await hydrated(page)
    await press(page, '#one-link')
    const one = await page.evaluate(() => scrollY)
    await press(page, '#two-link')
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(one)
    await page.goBack()
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(one)
  })
})
