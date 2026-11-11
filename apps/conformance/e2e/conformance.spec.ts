import { expect, test, type Browser, type Page } from '@playwright/test'

// fondu/client against the browser itself: each case runs with the client and without JavaScript (the browser's own
// navigation, the expected outcome), and the two must end the same: URL, page, history, scroll position.

type Outcome = Record<string, unknown> & { timeline?: string[] }

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
    if (js) await page.addInitScript(timeline)
    try {
      return await steps(page)
    } finally {
      await context.close()
    }
  }
  const [{ timeline: scrolls, ...client }, { timeline: _, ...native }] = await Promise.all([
    run(true),
    run(false),
  ])
  const wanted: Outcome = { ...native, ...expected }
  if (
    typeof client.y === 'number' &&
    typeof wanted.y === 'number' &&
    Math.abs(client.y - wanted.y) <= 1
  )
    wanted.y = client.y
  expect(client, `with fondu/client: ${JSON.stringify(scrolls ?? [])}`).toEqual(wanted)
}

/**
 * A document's scrolling, for a failure's message: each scroll event's time, position and the document's state, and
 * the position its entry has kept (where a reload's scrolling comes from, engine by engine)
 */
function timeline() {
  const t0 = performance.now()
  const at = (what: string) =>
    ((window as unknown as { __scrolls?: string[] }).__scrolls ??= []).push(
      `${Math.round(performance.now() - t0)}ms ${what} y=${Math.round(scrollY)} ${document.readyState}`,
    )
  try {
    const key = (history.state as { __fondu?: string } | null)?.__fondu
    at(`kept=${key && sessionStorage.getItem('fondu-scroll:' + key)}`)
  } catch {}
  addEventListener('scroll', () => at('scroll'), { passive: true })
  addEventListener('DOMContentLoaded', () => at('DOMContentLoaded'))
  addEventListener(
    'load',
    () => (at(`load state=${JSON.stringify(history.state)}`), setTimeout(() => at('load+0'))),
  )
}

/**
 * A reload as the visitor's (`location.reload()`, the document's own): Playwright's `page.reload()` is the
 * browser's, which Firefox does without the entry's `history.state`
 */
async function reload(page: Page) {
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => location.reload())])
  await settle(page)
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
    timeline: (window as unknown as { __scrolls?: string[] }).__scrolls,
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

test.describe('useForm: the browser checks a form as the server does', () => {
  const checked = (page: Page) =>
    page.evaluate(() => ({
      url: location.pathname + location.search,
      errors: document.querySelector('#errors')?.textContent,
      received: document.querySelector('#received')?.textContent,
    }))
  test('a valid form, its nested and listed fields: sent, read as the server reads it', async ({
    browser,
  }) => {
    await both(browser, async (page) => {
      await open(page, '/checked')
      await page.click('#checked button')
      await settle(page)
      return checked(page)
    })
  })
  test("an invalid one: the browser's errors are the server's", async ({ browser }) => {
    await both(browser, async (page) => {
      await open(page, '/checked')
      await page.fill('[name=name]', ' ')
      await page.uncheck('[name="tags[]"][value=c]')
      await page.fill('[name="user[email]"]', 'nope')
      await page.click('#checked button')
      await settle(page)
      return checked(page)
    })
  })
  test('in the browser: not sent, the first field to fix focused, a fixed one without its message', async ({
    page,
  }) => {
    let posts = 0
    page.on('request', (r) => void (r.method() === 'POST' && posts++))
    await open(page, '/checked')
    await page.fill('[name=name]', '')
    await page.fill('[name="user[email]"]', 'nope')
    await page.click('#checked button')
    await expect(page.locator('#errors')).toHaveText(
      '{"name":"A name, please","user.email":"An email address"}',
    )
    expect(await page.evaluate(() => (document.activeElement as HTMLInputElement).name)).toBe(
      'name',
    )
    await expect(page.locator('[name=name]')).toHaveAttribute('aria-invalid', 'true')
    // fixed as it is typed
    await page.fill('[name=name]', 'Ada')
    await expect(page.locator('#errors')).toHaveText('{"user.email":"An email address"}')
    await expect(page.locator('[name=name]')).not.toHaveAttribute('aria-invalid')
    expect(posts).toBe(0)
    await page.fill('[name="user[email]"]', 'ada@example.com')
    await page.click('#checked button')
    await expect(page.locator('#received')).toHaveText(
      '{"name":"Ada","tags":["a","c"],"user":{"email":"ada@example.com"}}',
    )
    expect(posts).toBe(1)
  })
  test("a form that can't be sent: failed, the form as it was; sent again, its answer", async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await open(page, '/checked')
    await page.fill('[name=name]', 'Grace')
    await page.route('**/checked', (route) =>
      route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
    )
    await page.click('#checked button')
    await expect(page.locator('#state')).toHaveText('failed')
    await expect(page.locator('#failed')).toHaveText('true')
    await expect(page.locator('#checked')).not.toHaveAttribute('aria-busy')
    await expect(page.locator('[name=name]')).toHaveValue('Grace')
    expect(new URL(page.url()).pathname).toBe('/checked')
    // sent again, once the connection is back
    await page.unroute('**/checked')
    await page.click('#checked button')
    await expect(page.locator('#received')).toHaveText(
      '{"name":"Grace","tags":["a","c"],"user":{"email":"ada@example.com"}}',
    )
    await expect(page.locator('#state')).toHaveText('idle')
    await expect(page.locator('#failed')).toHaveText('false')
    expect(errors).toEqual([])
  })
})

test.describe('scroll positions', () => {
  test('a reload: where the page was left', async ({ browser }) => {
    await both(browser, async (page) => {
      await open(page, '/long')
      await page.evaluate(() => scrollTo(0, 1200))
      await page.waitForTimeout(300)
      await reload(page)
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
        await reload(page)
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
  test("a link the pointer rests on: its page's modules loaded before the click, no data asked for", async ({
    page,
  }) => {
    await open(page, '/')
    await page.waitForLoadState('networkidle')
    const scripts: string[] = []
    const data: string[] = []
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(r.url())
      if (r.headers()['x-fondu']) data.push(r.url())
    })
    await page.hover('a[href="/long"]')
    await expect.poll(() => scripts.length).toBeGreaterThan(0)
    // /long is prerendered: its data is its file, asked for with the modules (`x-fondu-prefetch`); no loader runs
    await expect.poll(() => data).toEqual([new URL('/_fondu/pages/long.json', page.url()).href])
    expect(new URL(page.url()).pathname).toBe('/')
    await page.click('a[href="/long"]')
    await settle(page)
    expect(await page.evaluate(() => document.querySelector('h1')?.textContent)).toBe('Long')
    expect(data).toHaveLength(1)
  })
  test("a static page's link the pointer rests on: its data asked for once; the click asks for nothing more", async ({
    page,
  }) => {
    await open(page, '/')
    await page.waitForLoadState('networkidle')
    const asked: string[] = []
    const answered: Array<{ path: string; status: number }> = []
    page.on('request', (r) => {
      const { pathname } = new URL(r.url())
      if (pathname.startsWith('/_fondu/pages/')) asked.push(pathname)
    })
    page.on('response', (r) => {
      const { pathname } = new URL(r.url())
      if (pathname.startsWith('/_fondu/pages/'))
        answered.push({ path: pathname, status: r.status() })
    })
    await page.hover('a[href="/long"]')
    await expect.poll(() => answered).toEqual([{ path: '/_fondu/pages/long.json', status: 200 }])
    await page.click('a[href="/long"]')
    await settle(page)
    expect(await page.evaluate(() => document.querySelector('h1')?.textContent)).toBe('Long')
    expect(asked).toEqual(['/_fondu/pages/long.json'])
  })
  test("a static page's link the pointer rests on, clicked after 30 seconds: its data asked for again", async ({
    page,
  }) => {
    await page.clock.install()
    await open(page, '/')
    await page.waitForLoadState('networkidle')
    const asked: string[] = []
    page.on('request', (r) => {
      const { pathname } = new URL(r.url())
      if (pathname.startsWith('/_fondu/pages/')) asked.push(pathname)
    })
    await page.hover('a[href="/long"]')
    await expect.poll(() => asked).toEqual(['/_fondu/pages/long.json'])
    await page.clock.fastForward(31_000)
    await page.click('a[href="/long"]')
    await settle(page)
    expect(await page.evaluate(() => document.querySelector('h1')?.textContent)).toBe('Long')
    expect(asked).toEqual(['/_fondu/pages/long.json', '/_fondu/pages/long.json'])
  })
  test('a static page visited, left and clicked again within 30 seconds: its file asked for once', async ({
    page,
  }) => {
    await open(page, '/')
    await page.waitForLoadState('networkidle')
    const asked: string[] = []
    page.on('request', (r) => {
      const { pathname } = new URL(r.url())
      if (pathname === '/_fondu/pages/long.json') asked.push(pathname)
    })
    const file = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/_fondu/pages/long.json',
    )
    await page.hover('a[href="/long"]')
    expect((await file).status()).toBe(200)
    await page.click('a[href="/long"]')
    await settle(page)
    expect(await page.evaluate(() => document.querySelector('h1')?.textContent)).toBe('Long')
    await page.goBack()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/')
    await settle(page)
    await page.hover('a[href="/long"]')
    await page.click('a[href="/long"]')
    await settle(page)
    expect(await page.evaluate(() => document.querySelector('h1')?.textContent)).toBe('Long')
    expect(asked).toEqual(['/_fondu/pages/long.json'])
  })
  test('a static page visited, left and clicked again after 30 seconds: its file asked for again', async ({
    page,
  }) => {
    await page.clock.install()
    await open(page, '/')
    await page.waitForLoadState('networkidle')
    const asked: string[] = []
    page.on('request', (r) => {
      const { pathname } = new URL(r.url())
      if (pathname === '/_fondu/pages/long.json') asked.push(pathname)
    })
    await page.hover('a[href="/long"]')
    await expect.poll(() => asked).toEqual(['/_fondu/pages/long.json'])
    await page.click('a[href="/long"]')
    await settle(page)
    await page.goBack()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/')
    await settle(page)
    // the pointer is over the link again once the page is back: it leaves and returns, a new rest
    await page.mouse.move(0, 0)
    await page.clock.fastForward(31_000)
    await page.hover('a[href="/long"]')
    await expect.poll(() => asked).toHaveLength(2)
    await page.click('a[href="/long"]')
    await settle(page)
    expect(await page.evaluate(() => document.querySelector('h1')?.textContent)).toBe('Long')
    expect(asked).toEqual(['/_fondu/pages/long.json', '/_fondu/pages/long.json'])
  })
  test('a page without a file: the prefetch is answered 204, the click asks for the page', async ({
    page,
  }) => {
    await open(page, '/')
    await page.waitForLoadState('networkidle')
    const answered: Array<{ path: string; status: number }> = []
    page.on('response', (r) => {
      const { pathname } = new URL(r.url())
      if (pathname.startsWith('/_fondu/pages/'))
        answered.push({ path: pathname, status: r.status() })
    })
    await page.hover('a[href="/csr"]')
    await expect.poll(() => answered).toEqual([{ path: '/_fondu/pages/csr.json', status: 204 }])
    await page.click('a[href="/csr"]')
    await settle(page)
    expect(await page.evaluate(() => document.querySelector('h1')?.textContent)).toBe(
      'Rendered in the browser',
    )
    expect(answered).toEqual([
      { path: '/_fondu/pages/csr.json', status: 204 },
      { path: '/_fondu/pages/csr.json', status: 200 },
    ])
  })
  test("a touch then the click at once: the static page's data asked for once", async ({
    page,
  }) => {
    await open(page, '/')
    await page.waitForLoadState('networkidle')
    // the file is slow, so the click comes while the touch's request is still on its way
    await page.route('**/_fondu/pages/long.json', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      await route.continue()
    })
    const answered: Array<{ path: string; status: number }> = []
    const asked: string[] = []
    page.on('request', (r) => {
      const { pathname } = new URL(r.url())
      if (pathname.startsWith('/_fondu/pages/')) asked.push(pathname)
    })
    page.on('response', (r) => {
      const { pathname } = new URL(r.url())
      if (pathname.startsWith('/_fondu/pages/'))
        answered.push({ path: pathname, status: r.status() })
    })
    // a plain event: Firefox on the desktop has no TouchEvent
    await page.evaluate(() =>
      document
        .querySelector('a[href="/long"]')!
        .dispatchEvent(new Event('touchstart', { bubbles: true })),
    )
    await page.click('a[href="/long"]')
    await expect(page.locator('h1')).toHaveText('Long')
    await settle(page)
    expect(asked).toEqual(['/_fondu/pages/long.json'])
    expect(answered).toEqual([{ path: '/_fondu/pages/long.json', status: 200 }])
  })
  test('the pointer resting on a link to a page without a file, again and again: asked once', async ({
    page,
  }) => {
    await open(page, '/')
    await page.waitForLoadState('networkidle')
    const answered: Array<{ path: string; status: number }> = []
    page.on('response', (r) => {
      const { pathname } = new URL(r.url())
      if (pathname.startsWith('/_fondu/pages/'))
        answered.push({ path: pathname, status: r.status() })
    })
    await page.hover('a[href="/csr"]')
    await expect.poll(() => answered).toEqual([{ path: '/_fondu/pages/csr.json', status: 204 }])
    for (let rest = 0; rest < 2; rest++) {
      await page.mouse.move(0, 0)
      await page.hover('a[href="/csr"]')
      await page.waitForTimeout(250) // over the 80 ms the pointer rests, and the answer's time
    }
    expect(answered).toEqual([{ path: '/_fondu/pages/csr.json', status: 204 }])
  })
  test("the pointer resting on a static page's link again: asked once", async ({ page }) => {
    await open(page, '/')
    await page.waitForLoadState('networkidle')
    const answered: Array<{ path: string; status: number }> = []
    page.on('response', (r) => {
      const { pathname } = new URL(r.url())
      if (pathname.startsWith('/_fondu/pages/'))
        answered.push({ path: pathname, status: r.status() })
    })
    await page.hover('a[href="/long"]')
    await expect.poll(() => answered).toEqual([{ path: '/_fondu/pages/long.json', status: 200 }])
    await page.mouse.move(0, 0)
    await page.hover('a[href="/long"]')
    await page.waitForTimeout(250)
    expect(answered).toEqual([{ path: '/_fondu/pages/long.json', status: 200 }])
    await page.click('a[href="/long"]')
    await settle(page)
    expect(await page.evaluate(() => document.querySelector('h1')?.textContent)).toBe('Long')
    expect(answered).toEqual([{ path: '/_fondu/pages/long.json', status: 200 }])
  })
  test('two links to the same page: asked once', async ({ page }) => {
    await open(page, '/')
    await page.waitForLoadState('networkidle')
    const answered: Array<{ path: string; status: number }> = []
    page.on('response', (r) => {
      const { pathname } = new URL(r.url())
      if (pathname.startsWith('/_fondu/pages/'))
        answered.push({ path: pathname, status: r.status() })
    })
    // /long and /long#end: one page, one file
    await page.hover('a[href="/long"]')
    await expect.poll(() => answered).toEqual([{ path: '/_fondu/pages/long.json', status: 200 }])
    await page.hover('a[href="/long#end"]')
    await page.waitForTimeout(250)
    expect(answered).toEqual([{ path: '/_fondu/pages/long.json', status: 200 }])
  })
  test('a link to a file: the pointer rests on it, nothing loaded', async ({ page }) => {
    await open(page, '/')
    await page.waitForLoadState('networkidle')
    const asked: string[] = []
    page.on('request', (r) => {
      if (r.resourceType() === 'script' || r.headers()['x-fondu']) asked.push(r.url())
    })
    await page.hover('a[href="/notes.txt"]')
    await page.waitForTimeout(300)
    expect(asked).toEqual([])
  })
  test('navigate(): as the link would, in place; replace: no new history entry; a file: the browser loads it', async ({
    page,
  }) => {
    for (const [button, link, replaced] of [
      ['#navigate', 'a[href="/long"]', false],
      ['#navigate-replace', 'a[href="/long"]', true],
      ['#navigate-file', 'a[href="/notes.txt"]', false],
    ] as const) {
      await open(page, '/')
      await page.evaluate(() => ((window as unknown as { kept: boolean }).kept = true))
      const before = (await state(page)).entries
      await page.click(button)
      await settle(page)
      const { entries, timeline: _, ...navigated } = await state(page)
      const kept = await page.evaluate(
        () => (window as unknown as { kept?: boolean }).kept === true,
      )
      await open(page, '/')
      await page.click(link)
      await settle(page)
      const { entries: __, timeline: ___, ...clicked } = await state(page)
      expect(navigated).toEqual(clicked)
      expect(kept).toBe(button !== '#navigate-file') // a page in place; a file is a document load
      expect(entries - before).toBe(replaced ? 0 : 1)
    }
  })
  test('a reload of a page rendered in the browser only: where it was left', async ({ page }) => {
    await page.addInitScript(timeline)
    await open(page, '/csr')
    await page.evaluate(() => scrollTo(0, 1200))
    await page.waitForTimeout(300)
    await reload(page)
    const { y, timeline: scrolls } = await state(page)
    expect(y, JSON.stringify(scrolls)).toBe(1200)
  })
})
