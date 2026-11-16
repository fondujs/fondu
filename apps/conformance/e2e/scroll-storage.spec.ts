import { expect, test, type Page } from '@playwright/test'

// The scroll positions the client keeps (sessionStorage, `fondu-scroll:<key>`) per history entry stay bounded: a shallow
// navigation that replaces its entry (a search box, per keystroke) is the same entry, and the persisted set is the last 50.
// What a reload, and Back from another document, restore stays. JavaScript only

const hydrated = (page: Page) => page.waitForFunction(() => history.state?.__fondu)
/** the positions persisted (not the index of their keys, `fondu-scroll:` alone) */
const stored = (page: Page) =>
  page.evaluate(
    () =>
      Object.keys(sessionStorage).filter(
        (key) => key.startsWith('fondu-scroll:') && key !== 'fondu-scroll:',
      ).length,
  )
/** a reload as the visitor's (`location.reload()`): Playwright's `page.reload()` is the browser's, which Firefox does without the entry's `history.state` */
const reload = (page: Page) =>
  Promise.all([page.waitForEvent('load'), page.evaluate(() => location.reload())])
const key = (page: Page) => page.evaluate(() => history.state.__fondu as string)
const scrollY = (page: Page) => page.evaluate(() => window.scrollY)
const near = (y: number, expected: number) =>
  expect(Math.abs(y - expected), `scrollY ${y}`).toBeLessThanOrEqual(2)
/** `count` clicks of a button, each after the page has rendered the last (a task between) */
const press = (page: Page, selector: string, count: number) =>
  page.evaluate(
    async ([selector, count]) => {
      for (let i = 0; i < (count as number); i++) {
        document.querySelector<HTMLElement>(selector as string)!.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    },
    [selector, count] as const,
  )

test.describe('scroll positions', () => {
  test('a shallow navigation that replaces its entry (a keystroke each): the entry and its key stay, the storage does not grow', async ({
    page,
  }) => {
    await page.goto('/shallow?item=a')
    await hydrated(page)
    await page.evaluate(() => window.scrollTo(0, 900))
    const before = await key(page)
    const entries = await page.evaluate(() => history.length)
    await press(page, '#next', 150)
    expect(await page.evaluate(() => history.length)).toBe(entries)
    expect(await key(page)).toBe(before)
    expect(await stored(page)).toBeLessThanOrEqual(2)
    near(await scrollY(page), 900)
  })

  test('entries pushed without end: the last 50 positions are kept, and the newest are restored', async ({
    page,
  }) => {
    await page.goto('/long')
    await hydrated(page)
    for (let i = 0; i < 60; i++) {
      // 60 entries of the same document, each its own: a #fragment link is the browser's, the client keys it
      await page.evaluate((i) => {
        const link = document.createElement('a')
        link.href = `#h${i}`
        document.body.append(link)
        window.scrollTo(0, 100 + i * 10)
        link.click()
      }, i)
    }
    expect(await stored(page)).toBeLessThanOrEqual(50)
    await page.goBack()
    await expect.poll(() => scrollY(page)).toBe(100 + 59 * 10)
  })

  test('a reload, and Back from another document, restore the entry after many replaces', async ({
    page,
  }) => {
    await page.goto('/shallow?item=a')
    await hydrated(page)
    await press(page, '#next', 60)
    await page.evaluate(() => window.scrollTo(0, 900))
    const address = await page.evaluate(() => location.pathname + location.search)
    await reload(page)
    await hydrated(page)
    await expect.poll(() => scrollY(page)).toBeGreaterThan(890)
    await page.goto('/notes.txt')
    await page.goBack()
    await hydrated(page)
    expect(await page.evaluate(() => location.pathname + location.search)).toBe(address)
    await expect.poll(() => scrollY(page)).toBeGreaterThan(890)
    expect(await stored(page)).toBeLessThanOrEqual(5)
  })

  test('Back and Forward between pages: where each was left', async ({ page }) => {
    await page.goto('/long')
    await hydrated(page)
    await page.evaluate(() => window.scrollTo(0, 700))
    // not Playwright's click: it scrolls the link into view first
    await page.evaluate(() => document.querySelector<HTMLElement>('#to-form')!.click())
    await expect(page).toHaveURL(/\/form$/)
    await page.goBack()
    await expect(page.locator('h1')).toHaveText('Long')
    await expect.poll(() => scrollY(page)).toBe(700)
    await page.goForward()
    await expect(page).toHaveURL(/\/form$/)
    await page.goBack()
    await expect.poll(() => scrollY(page)).toBe(700)
  })
})
