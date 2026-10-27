import { expect, test, type Browser, type Page } from '@playwright/test'

// fondu/client against the browser itself: each case runs with the client and without JavaScript (the browser's own
// navigation, the expected outcome), and the two must end the same: URL, page, history, scroll position.

type Outcome = Record<string, unknown>

/** whether a page's context runs JavaScript (fondu/client) */
const scripted = new WeakMap<Page, boolean>()

/**
 * The same steps, with fondu/client and without JavaScript; the outcomes, equal (a scroll position to a pixel: the
 * engines round a #fragment's subpixel position each their way). `expected`: what the client is to do where the
 * engines disagree among themselves, in place of what this one does.
 */
async function both(
  browser: Browser,
  steps: (page: Page) => Promise<Outcome>,
  expected: Outcome = {},
) {
  const run = async (js: boolean) => {
    const context = await browser.newContext({
      javaScriptEnabled: js,
      viewport: { width: 1000, height: 700 },
    })
    const page = await context.newPage()
    scripted.set(page, js)
    try {
      return await steps(page)
    } finally {
      await context.close()
    }
  }
  const [client, native] = await Promise.all([run(true), run(false)])
  const wanted = { ...native, ...expected }
  if (
    typeof client.y === 'number' &&
    typeof wanted.y === 'number' &&
    Math.abs(client.y - wanted.y) <= 1
  )
    wanted.y = client.y
  expect(client).toEqual(wanted)
}

async function open(page: Page, url: string) {
  await page.goto(url)
  await settle(page)
}
/** the navigation done: the document loaded, and with fondu/client, its history entry keyed and its fetches done */
async function settle(page: Page) {
  await page.waitForLoadState('load')
  await page.waitForLoadState('networkidle')
  if (scripted.get(page) !== false)
    await page
      .waitForFunction(
        () => !document.querySelector('script[data-page]') || history.state?.__fondu,
        null,
        {
          timeout: 3000,
        },
      )
      .catch(() => {}) // a document that isn't a page (a file)
  await page.waitForTimeout(200)
}
const state = (page: Page) =>
  page.evaluate(() => ({
    url: location.pathname + location.search + location.hash,
    text: (document.querySelector('pre, h1')?.textContent ?? document.body.innerText)
      .trim()
      .slice(0, 300),
    entries: history.length,
    y: Math.round(scrollY),
  }))

test.describe('links', () => {
  for (const href of [
    '/long',
    '/long#end',
    '/notes.txt',
    '/nope',
    '/go/fragment',
    '/go/relative',
    '/go/file',
  ])
    test(href, async ({ browser }) => {
      await both(browser, async (page) => {
        await open(page, '/')
        await page.click(`a[href="${href}"]`)
        await settle(page)
        return state(page)
      })
    })
})

test.describe('forms', () => {
  const cases: Array<[name: string, button: string]> = [
    ['URL-encoded, its fields of each kind, the button clicked', '#urlencoded button[value=save]'],
    ['another button', '#other'],
    ['a button with its own action and method', '#as-get'],
    ['multipart, with a file', '#multipart button'],
    ['text/plain', '#plain button'],
    ['GET', '#get button'],
  ]
  for (const [name, button] of cases)
    test(name, async ({ browser }) => {
      await both(browser, async (page) => {
        await open(page, '/form')
        await page.locator('#multipart input[type=file]').setInputFiles({
          name: 'note.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('a note\n'),
        })
        await page.click(button)
        await settle(page)
        return state(page)
      })
    })
})

test.describe('scroll positions', () => {
  test('a reload: where the page was left', async ({ browser }) => {
    await both(browser, async (page) => {
      await open(page, '/long')
      await page.evaluate(() => scrollTo(0, 1200))
      await page.waitForTimeout(300)
      await page.reload()
      await settle(page)
      return state(page)
    })
  })
  test("a reload of a #fragment's page scrolled away from it: where it was left", async ({
    browser,
  }) => {
    // as Chromium and WebKit restore it; Firefox goes to the #fragment again
    await both(
      browser,
      async (page) => {
        await open(page, '/long#end')
        await page.evaluate(() => scrollTo(0, 1200))
        await page.waitForTimeout(300)
        await page.reload()
        await settle(page)
        return state(page)
      },
      { y: 1200 },
    )
  })
  test('Back to a page: where it was left', async ({ browser }) => {
    await both(browser, async (page) => {
      await open(page, '/')
      await page.click('a[href="/long"]')
      await settle(page)
      await page.evaluate(() => scrollTo(0, 1200))
      await page.waitForTimeout(300)
      // clicked where it is, not scrolled to
      await page.evaluate(() => (document.getElementById('to-form') as HTMLAnchorElement).click())
      await page.waitForURL('**/form')
      await settle(page)
      await page.goBack()
      await settle(page)
      return state(page)
    })
  })
})

test.describe('with fondu/client only', () => {
  test('a link to a file of the site: the browser loads it, no page object asked for first', async ({
    page,
  }) => {
    const asked: string[] = []
    page.on('request', (r) => asked.push(new URL(r.url()).pathname))
    await open(page, '/')
    await page.click('a[href="/notes.txt"]')
    await settle(page)
    expect(asked.filter((p) => p.startsWith('/_fondu/'))).toEqual([])
    expect(await page.evaluate(() => document.body.innerText.trim())).toBe(
      'Notes, a file of the site.',
    )
  })
  test('a link to a page: in place, the document kept', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(() => ((window as unknown as { kept: boolean }).kept = true))
    await page.click('a[href="/long"]')
    await settle(page)
    expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true)
  })
  test('a reload of a page rendered in the browser only: where it was left', async ({ page }) => {
    await open(page, '/csr')
    await page.evaluate(() => scrollTo(0, 1200))
    await page.waitForTimeout(300)
    await page.reload()
    await settle(page)
    expect((await state(page)).y).toBe(1200)
  })
})
