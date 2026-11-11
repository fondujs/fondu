import { expect, test, type Page } from '@playwright/test'

// A page with a deferred prop (app/routes/deferred.tsx, not prerendered): the document has the fallback, the client
// asks for the prop once the page is on the screen, quietly. JavaScript only: without it the fallback stays, so
// there is no outcome to compare with the browser's own navigation (`both()`)

/** the partial requests the page makes: the props each asks for */
function asks(page: Page) {
  const asked: string[] = []
  page.on('request', (request) => {
    const only = request.headers()['x-fondu-only']
    if (only) asked.push(only)
  })
  return asked
}
const hydrated = (page: Page) => page.waitForFunction(() => history.state?.__fondu)
const entries = (page: Page) => page.evaluate(() => history.length)
const states = (page: Page) => page.locator('#state').textContent()
const at = async (page: Page) => Number(await page.locator('#stats-at').textContent())

test.describe('deferred props', () => {
  test('the fallback, then the content: no navigation state, no history entry, the page keeps its state', async ({
    page,
  }) => {
    const asked = asks(page)
    await page.goto('/deferred', { waitUntil: 'commit' })
    await expect(page.locator('#fallback')).toBeVisible()
    await expect(page.locator('#broken-fallback')).toBeVisible()
    await hydrated(page)
    const before = await entries(page)
    await page.fill('#typed', 'kept')
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#fallback')).toHaveCount(0)
    await expect(page.locator('#broken-failed')).toBeVisible() // answered without it
    expect(await page.inputValue('#typed')).toBe('kept')
    expect(await states(page)).toBe('idle')
    expect(await entries(page)).toBe(before)
    expect(asked).toEqual(['stats,broken']) // once, for both
  })
  test('reload({ only }) after a click: the prop again, quiet', async ({ page }) => {
    const asked = asks(page)
    await page.goto('/deferred')
    await hydrated(page)
    await expect(page.locator('#stats')).toBeVisible()
    const first = await at(page)
    const before = await entries(page)
    await page.fill('#typed', 'kept')
    await page.click('#only')
    await expect(async () => expect(await at(page)).toBeGreaterThan(first)).toPass()
    expect(asked).toEqual(['stats,broken', 'stats'])
    expect(await page.inputValue('#typed')).toBe('kept')
    expect(await states(page)).toBe('idle')
    expect(await entries(page)).toBe(before)
  })
  test('a plain reload() asks again and keeps the old value meanwhile', async ({ page }) => {
    const asked = asks(page)
    await page.goto('/deferred')
    await hydrated(page)
    await expect(page.locator('#stats')).toBeVisible()
    const first = await at(page)
    await page.fill('#typed', 'kept')
    await page.click('#reload')
    await expect(page.locator('#state')).toHaveText(/idle,loading,idle/) // a plain reload is a navigation
    expect(await at(page)).toBe(first) // the new page is there, its stats not yet: the old ones stay
    await expect(page.locator('#fallback')).toHaveCount(0)
    await expect(async () => expect(await at(page)).toBeGreaterThan(first)).toPass()
    expect(asked).toEqual(['stats,broken', 'stats,broken'])
    expect(await page.inputValue('#typed')).toBe('kept')
  })
  test('navigating away while the deferred request is on its way: no error, nothing merged into the next page', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto('/deferred')
    await hydrated(page)
    await page.click('#to-same') // the same component, another URL
    await expect(page).toHaveURL('/deferred?x=1')
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#stats-for')).toHaveText('?x=1') // its own, not the first page's (?)
    await page.goBack()
    await page.click('#to-long')
    await expect(page.locator('h1')).toHaveText('Long')
    await page.waitForTimeout(800)
    await expect(page.locator('#stats')).toHaveCount(0)
    expect(errors).toEqual([])
  })
  test('a deferred function that throws: the failed content, the other props there', async ({
    page,
  }) => {
    await page.goto('/deferred')
    await expect(page.locator('#broken-failed')).toBeVisible()
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#broken')).toHaveCount(0)
  })
  test('a partial request that fails: the failed content', async ({ page }) => {
    // the build is prerendered: a page without a file is asked for at /_fondu/pages/<path>.json
    await page.route('**/_fondu/pages/deferred.json', (route) =>
      route.request().headers()['x-fondu-only'] ? route.abort() : route.continue(),
    )
    await page.goto('/deferred')
    await expect(page.locator('#stats-failed')).toBeVisible()
    await expect(page.locator('#broken-failed')).toBeVisible()
    expect(await states(page)).toBe('idle') // quiet: no navigation failed
  })
  test('Back: the deferred props are there at once and asked for again; offline, a page left too early fails rather than waits', async ({
    context,
    page,
  }) => {
    const asked = asks(page)
    await page.goto('/deferred')
    await hydrated(page)
    await expect(page.locator('#stats')).toBeVisible()
    await page.click('#to-long')
    await expect(page.locator('h1')).toHaveText('Long')
    await page.goBack()
    await expect(page.locator('#stats')).toBeVisible() // the kept page, with what it had
    await expect(page.locator('#fallback')).toHaveCount(0)
    await expect(async () => expect(asked).toHaveLength(2)).toPass() // asked for again
    // a page left before its props came, then Back with no network: the kept page waits for them, so they are
    // asked for at once, and fail
    await page.goto('/deferred?early')
    await hydrated(page)
    await page.click('#to-long')
    await expect(page.locator('h1')).toHaveText('Long')
    await context.setOffline(true)
    await page.goBack()
    await expect(page.locator('#stats-failed')).toBeVisible()
    await context.setOffline(false)
  })
  test('without JavaScript: the document has the fallback', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/deferred')
    await expect(page.locator('#fallback')).toBeVisible()
    await expect(page.locator('#broken-fallback')).toBeVisible()
    await context.close()
  })
})
