import { expect, test, type Page } from '@playwright/test'

// A prerendered page (app/routes/static-query.tsx) is made without a query, and so is its file; a navigation to it
// keeps the visitor's query and #fragment, as a document load does. A redirect (app/routes/trim.tsx) is the
// target's, as the server answered. JavaScript only

const hydrated = (page: Page) => page.waitForFunction(() => history.state?.__fondu)
/** a reload as the visitor's (`location.reload()`): Playwright's `page.reload()` is the browser's, which Firefox does without the entry's `history.state` */
const reload = (page: Page) =>
  Promise.all([page.waitForEvent('load'), page.evaluate(() => location.reload())])
const url = (page: Page) => page.locator('#url')
const path = (page: Page) =>
  page.evaluate(() => location.pathname + location.search + location.hash)
/** a link on the page, as an app's own is: the client takes its click */
const click = (page: Page, href: string) =>
  page
    .evaluate((href) => {
      const link = document.createElement('a')
      link.href = href
      link.id = 'added'
      link.textContent = href
      document.body.append(link)
    }, href)
    .then(() => page.click('#added'))

test.describe('a prerendered page keeps the visitor’s query and #fragment', () => {
  test('a link to it: the address bar and usePage().url have the query, the address bar the fragment', async ({
    page,
  }) => {
    await page.goto('/')
    await hydrated(page)
    await click(page, '/static-query?tab=2#details')
    await expect(page.locator('h1')).toHaveText('Static query')
    expect(await path(page)).toBe('/static-query?tab=2#details')
    await expect(url(page)).toHaveText('/static-query?tab=2')
  })

  test('prefetched: the same', async ({ page }) => {
    await page.goto('/')
    await hydrated(page)
    await page.evaluate(() => {
      const link = document.createElement('a')
      link.href = '/static-query?tab=2#details'
      link.id = 'added'
      link.textContent = 'added'
      document.body.append(link)
    })
    const prefetched = page.waitForRequest((r) => r.headers()['x-fondu-prefetch'] === 'true')
    await page.hover('#added')
    await prefetched
    await page.waitForTimeout(100)
    const made: string[] = []
    page.on('request', (request) => made.push(request.url()))
    await page.click('#added')
    await expect(page.locator('h1')).toHaveText('Static query')
    expect(made).toEqual([]) // answered from what was asked for early
    expect(await path(page)).toBe('/static-query?tab=2#details')
    await expect(url(page)).toHaveText('/static-query?tab=2')
  })

  test('Back and Forward: the entry’s query and fragment', async ({ page }) => {
    await page.goto('/')
    await hydrated(page)
    await click(page, '/static-query?tab=2#details')
    await expect(url(page)).toHaveText('/static-query?tab=2')
    await page.click('#to-long')
    await expect(page.locator('h1')).toHaveText('Long')
    await page.goBack()
    await expect(page.locator('h1')).toHaveText('Static query')
    await expect(url(page)).toHaveText('/static-query?tab=2')
    await page.waitForTimeout(300) // the server's page in place of the kept one
    expect(await path(page)).toBe('/static-query?tab=2#details')
    await expect(url(page)).toHaveText('/static-query?tab=2')
    await page.goBack() // the entry before: /
    await expect(page.locator('h1')).not.toHaveText('Static query')
    await page.goForward()
    await expect(url(page)).toHaveText('/static-query?tab=2')
    await page.waitForTimeout(300)
    expect(await path(page)).toBe('/static-query?tab=2#details')
  })

  test('Back with nothing kept (a reload in between): the file’s page, the entry’s URL', async ({
    page,
  }) => {
    await page.goto('/static-query?tab=2#details')
    await hydrated(page)
    await page.click('#to-long')
    await expect(page.locator('h1')).toHaveText('Long')
    await reload(page) // the kept pages are gone
    await hydrated(page)
    await page.goBack()
    await expect(url(page)).toHaveText('/static-query?tab=2')
    await page.waitForTimeout(300)
    expect(await path(page)).toBe('/static-query?tab=2#details')
  })

  test('reload(): the page keeps its address', async ({ page }) => {
    await page.goto('/static-query?tab=2#details')
    await hydrated(page)
    const before = await page.evaluate(() => history.length)
    await page.click('#reload')
    await page.waitForTimeout(300)
    expect(await path(page)).toBe('/static-query?tab=2#details')
    await expect(url(page)).toHaveText('/static-query?tab=2')
    expect(await page.evaluate(() => history.length)).toBe(before)
  })

  test('a direct load: the query is in usePage().url once it has hydrated', async ({ page }) => {
    await page.goto('/static-query?tab=2#details')
    await hydrated(page)
    await expect(url(page)).toHaveText('/static-query?tab=2')
    expect(await path(page)).toBe('/static-query?tab=2#details')
  })

  test('no query: the path, as before', async ({ page }) => {
    await page.goto('/')
    await hydrated(page)
    await click(page, '/static-query')
    await expect(url(page)).toHaveText('/static-query')
    expect(await path(page)).toBe('/static-query')
  })
})

test.describe('a redirect is the server’s answer', () => {
  test('one that drops the query stays dropped, and so does the fragment', async ({ page }) => {
    await page.goto('/')
    await hydrated(page)
    await click(page, '/trim?x=1#top')
    await expect(page.locator('h1')).toHaveText('Trim')
    expect(await path(page)).toBe('/trim')
    await expect(url(page)).toHaveText('/trim')
  })

  test('one to a prerendered page is that page’s URL, not the link’s query', async ({ page }) => {
    await page.goto('/')
    await hydrated(page)
    await click(page, '/trim?to=1')
    await expect(page.locator('h1')).toHaveText('Static query')
    expect(await path(page)).toBe('/static-query')
    await expect(url(page)).toHaveText('/static-query')
  })
})
