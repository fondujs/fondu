import { expect, test, type Page } from '@playwright/test'

// Shallow navigation (app/routes/shallow.tsx, not prerendered): a drawer the URL holds (`?item=`) over a list, tabs in a
// #fragment. A click on an item changes the URL, and asks for nothing. A document load at the URL has the server render
// the drawer. JavaScript only, except the last case
const scrollY = (page: Page) => page.evaluate(() => window.scrollY)
const near = (y: number, expected: number) =>
  expect(Math.abs(y - expected), `scrollY ${y}`).toBeLessThanOrEqual(2)

/** the requests the page makes from now on (an app's own: the document's modules are loaded already); a deferred prop's has ` only=` */
const requests = (page: Page) => {
  const made: string[] = []
  page.on('request', (request) => {
    const only = request.headers()['x-fondu-only']
    made.push(request.url().replace('http://localhost:3100', '') + (only ? ` only=${only}` : ''))
  })
  return made
}
/** the navigations among them: the page asked for, not its deferred props */
const visits = (made: string[]) =>
  made.filter((url) => url.includes('/_fondu/pages/shallow') && !url.includes(' only='))
const hydrated = (page: Page) => page.waitForFunction(() => history.state?.__fondu)
const open = async (page: Page, url = '/shallow') => {
  await page.goto(url)
  await hydrated(page)
}
const text = (page: Page, id: string) => page.locator(`#${id}`)
const item = (page: Page) => page.locator('#drawer #item')
const drawer = (page: Page) => page.locator('#drawer')
const loads = async (page: Page) => Number(await text(page, 'loads').textContent())
const entries = (page: Page) => page.evaluate(() => history.length)
/** two clicks in one task: the second before the first's Back has landed */
const clickTwice = (page: Page, selector: string) =>
  page.evaluate((selector) => {
    const button = document.querySelector<HTMLElement>(selector)!
    button.click()
    button.click()
  }, selector)

test.describe('shallow navigation', () => {
  test('a click opens the drawer: no request, the state and the scroll stay; the URL and usePage().url are the item’s; the props stay the loader’s', async ({
    page,
  }) => {
    await open(page)
    await page.fill('#draft', 'typed')
    await page.evaluate(() => window.scrollTo(0, 900))
    const before = await loads(page)
    const made = requests(page)
    const count = await entries(page)
    await page.click('#open-b')
    await expect(item(page)).toHaveText('Beta')
    await expect(page).toHaveURL(/\/shallow\?item=b$/)
    await expect(text(page, 'url')).toHaveText('/shallow?item=b')
    expect(await entries(page)).toBe(count + 1)
    await expect(page.locator('#draft')).toHaveValue('typed')
    near(await scrollY(page), 900)
    expect(await loads(page)).toBe(before)
    await expect(text(page, 'loaded')).toHaveText('') // the loader's answer was for /shallow
    expect(await page.evaluate(() => history.state.__fondu_shallow)).toBe(true)
    expect(made).toEqual([])
  })

  test('Back closes it and Forward opens it again: no request, the state and the scroll stay', async ({
    page,
  }) => {
    await open(page)
    await page.fill('#draft', 'typed')
    await page.evaluate(() => window.scrollTo(0, 900))
    await page.click('#open-a')
    await expect(item(page)).toHaveText('Alpha')
    const made = requests(page)
    await page.goBack()
    await expect(drawer(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/shallow$/)
    await expect(text(page, 'url')).toHaveText('/shallow')
    near(await scrollY(page), 900)
    await page.goForward()
    await expect(item(page)).toHaveText('Alpha')
    await expect(text(page, 'url')).toHaveText('/shallow?item=a')
    near(await scrollY(page), 900)
    await expect(page.locator('#draft')).toHaveValue('typed')
    expect(made).toEqual([])
  })

  test('switching items inside the drawer with replace: one close returns to the list, and so does one Back', async ({
    page,
  }) => {
    await page.goto('/long')
    await open(page)
    const made = requests(page)
    const count = await entries(page)
    await page.click('#open-a') // an entry
    await page.click('#next') // replaced
    await expect(item(page)).toHaveText('Beta')
    await page.click('#next')
    await expect(item(page)).toHaveText('Gamma')
    expect(await entries(page)).toBe(count + 1)
    await page.click('#close')
    await expect(drawer(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/shallow$/)
    expect(made).toEqual([])
    // the entry before the list is the page before it
    await page.goBack()
    await expect(page).toHaveURL(/\/long$/)
  })

  test('an entry for each item (a link): Back goes through them; one close goes back over one', async ({
    page,
  }) => {
    await open(page)
    const made = requests(page)
    await page.click('#open-a')
    await page.click('#next-push')
    await expect(item(page)).toHaveText('Beta')
    await page.click('#next-push')
    await expect(item(page)).toHaveText('Gamma')
    await page.click('#close')
    await expect(item(page)).toHaveText('Beta')
    await page.click('#close')
    await expect(item(page)).toHaveText('Alpha')
    await page.click('#close')
    await expect(drawer(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/shallow$/)
    expect(made).toEqual([])
  })

  test('nested: a tab opened over the drawer, one level for each close', async ({ page }) => {
    await page.goto('/long')
    await open(page)
    await page.click('#open-a')
    await page.click('#tab-x')
    await expect(text(page, 'hash')).toHaveText('#tab/x')
    const made = requests(page)
    await page.click('#close-tab')
    await expect(text(page, 'hash')).toHaveText('')
    await expect(item(page)).toHaveText('Alpha')
    await page.click('#close')
    await expect(drawer(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/shallow$/)
    expect(made).toEqual([])
  })

  test('a document load at the URL: the server renders the drawer, and so does a reload', async ({
    page,
  }) => {
    await page.goto('/shallow?item=b')
    await expect(item(page)).toHaveText('Beta')
    await hydrated(page)
    await expect(text(page, 'url')).toHaveText('/shallow?item=b')
    const first = await loads(page)
    await page.reload()
    await expect(item(page)).toHaveText('Beta')
    expect(await loads(page)).toBeGreaterThan(first)
  })

  test('closed after a direct load: the page stays (the URL without the item, in place), no request, no entry added', async ({
    page,
  }) => {
    await page.goto('/long')
    await open(page, '/shallow?item=b')
    const made = requests(page)
    const count = await entries(page)
    await page.click('#close')
    await expect(drawer(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/shallow$/)
    await expect(text(page, 'url')).toHaveText('/shallow')
    expect(await entries(page)).toBe(count)
    expect(made).toEqual([])
    // Back is the entry before the document's: the page before it
    await page.goBack()
    await expect(page).toHaveURL(/\/long$/)
  })

  test('a double close (two clicks in one task) closes one level and stays on the site', async ({
    page,
  }) => {
    await page.goto('/long')
    await open(page)
    await page.click('#open-a')
    await expect(item(page)).toHaveText('Alpha')
    await clickTwice(page, '#close')
    await expect(drawer(page)).toHaveCount(0)
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/shallow$/)
    // and closes again once it has landed
    await page.click('#open-b')
    await page.click('#close')
    await expect(drawer(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/shallow$/)
  })

  test('closed from a tab’s first entry: one Back over the drawer, twice in one task still on the page', async ({
    page,
  }) => {
    await open(page)
    await page.click('#open-a')
    await expect(item(page)).toHaveText('Alpha')
    await clickTwice(page, '#close')
    await expect(drawer(page)).toHaveCount(0)
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/shallow$/)
    await expect(text(page, 'url')).toHaveText('/shallow')
    // a direct load of the drawer: the first entry itself, closed in place
    await open(page, '/shallow?item=c')
    await clickTwice(page, '#close')
    await expect(drawer(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/shallow$/)
  })

  test('opened, reloaded, closed: back to the list, not off the site; Back is the page before the list', async ({
    page,
    browserName,
  }) => {
    await page.goto('/long')
    await open(page)
    await page.click('#open-c')
    await expect(item(page)).toHaveText('Gamma')
    await page.reload()
    await expect(item(page)).toHaveText('Gamma')
    await hydrated(page)
    await page.click('#close')
    await expect(drawer(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/shallow$/)
    await expect(page.locator('#list')).toBeVisible()
    await hydrated(page)
    // Firefox's own history, with no Fondu in it: after a reload on a pushState entry, Back goes by the entry the
    // reload was on once more (a plain page does the same). The entry before the list is what the others show
    if (browserName === 'firefox') return
    await page.goBack()
    await expect(page).toHaveURL(/\/long$/)
  })

  test('a shallow click while a visit is being put on the screen is a normal navigation', async ({
    page,
  }) => {
    await open(page)
    // the page's module, late: its URL is in the history, the page not on the screen
    await page.route('**/assets/long-*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })
    await page.click('#to-long')
    await page.waitForFunction(() => location.pathname === '/long', null, { timeout: 1400 })
    const first = await loads(page)
    const made = requests(page)
    // a link with an absolute path: the document's URL is /long now, and a relative link would resolve against it
    await page.click('#open-abs')
    await expect(item(page)).toHaveText('Beta')
    await expect(page).toHaveURL(/\/shallow\?item=b$/)
    expect(await loads(page)).toBeGreaterThan(first) // the loader answered: a request, not a shallow navigation
    expect(made.some((url) => url.includes('item=b'))).toBe(true)
    await expect(text(page, 'url')).toHaveText('/shallow?item=b')
  })

  test('a shallow click while a visit waits for its answer gives that visit up', async ({
    page,
  }) => {
    await open(page)
    await page.route('**/_fondu/pages/long.json*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      await route.continue()
    })
    await page.click('#to-long')
    await expect(text(page, 'nav')).toHaveText('loading')
    await page.click('#open-b')
    await expect(item(page)).toHaveText('Beta')
    await expect(text(page, 'nav')).toHaveText('idle')
    await page.waitForTimeout(1600)
    await expect(page).toHaveURL(/\/shallow\?item=b$/)
    await expect(item(page)).toHaveText('Beta')
    await expect(text(page, 'url')).toHaveText('/shallow?item=b')
  })

  test('a form’s answer and reload() at the drawer’s URL keep it one overlay: close goes Back to the list, one more Back leaves the page', async ({
    page,
  }) => {
    await page.goto('/long')
    await open(page)
    await page.click('#open-a')
    await page.click('#note')
    await expect(text(page, 'flash')).toHaveText('Saved')
    await page.click('#reload')
    await expect(item(page)).toHaveText('Alpha')
    expect(await page.evaluate(() => history.state.__fondu_shallow)).toBe(true)
    await page.click('#close')
    await expect(drawer(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/shallow$/)
    await page.waitForTimeout(300)
    await page.goBack()
    await expect(page).toHaveURL(/\/long$/)
  })

  test('a page that replaces a shallow entry is not a shallow one: closeShallow() there stays on it', async ({
    page,
  }) => {
    await page.goto('/long')
    await open(page, '/shallow/first')
    await page.click('#same') // a shallow entry
    await expect(text(page, 'url')).toHaveText('/shallow/first?x=1')
    await page.click('#replace-other')
    await expect(text(page, 'name')).toHaveText('other')
    await page.click('#close')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/shallow\/other$/)
    await expect(text(page, 'name')).toHaveText('other')
  })

  test('Back onto a shared entry gives up a visit on its way (its answer not yet in)', async ({
    page,
  }) => {
    await open(page)
    await page.click('#open-a')
    await expect(item(page)).toHaveText('Alpha')
    await page.route('**/_fondu/pages/long.json*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      await route.continue()
    })
    await page.click('#to-long')
    await expect(text(page, 'nav')).toHaveText('loading')
    await page.goBack()
    await expect(drawer(page)).toHaveCount(0)
    await expect(text(page, 'nav')).toHaveText('idle')
    await page.waitForTimeout(1800)
    await expect(page).toHaveURL(/\/shallow$/) // the answer for /long arrived and was dropped
    await expect(text(page, 'url')).toHaveText('/shallow')
  })

  test('Back onto a shared entry gives up a visit whose URL is in the history already', async ({
    page,
  }) => {
    await open(page)
    await page.click('#open-a')
    await page.route('**/assets/long-*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })
    await page.click('#to-long')
    await page.waitForFunction(() => location.pathname === '/long', null, { timeout: 1400 })
    await page.goBack() // the entry before /long: the drawer's
    await expect(page).toHaveURL(/\/shallow\?item=a$/)
    await expect(item(page)).toHaveText('Alpha')
    await page.waitForTimeout(1800)
    await expect(page).toHaveURL(/\/shallow\?item=a$/)
    await expect(text(page, 'url')).toHaveText('/shallow?item=a')
    await expect(text(page, 'nav')).toHaveText('idle')
  })
})

test.describe('a #fragment', () => {
  test('shallow links: each an entry, hashchange fires for them and for Back; closeShallow() goes back over one at a time; no request', async ({
    page,
  }) => {
    await page.goto('/long')
    await open(page)
    await page.evaluate(() => {
      const w = window as unknown as { changes: string[] }
      w.changes = []
      addEventListener('hashchange', () => w.changes.push(location.hash))
    })
    const made = requests(page)
    await page.click('#tab-x')
    await expect(text(page, 'hash')).toHaveText('#tab/x')
    await page.click('#tab-y')
    await expect(text(page, 'hash')).toHaveText('#tab/y')
    await page.goBack()
    await expect(text(page, 'hash')).toHaveText('#tab/x')
    await page.goForward()
    await expect(text(page, 'hash')).toHaveText('#tab/y')
    expect(await page.evaluate(() => (window as unknown as { changes: string[] }).changes)).toEqual(
      ['#tab/x', '#tab/y', '#tab/x', '#tab/y'],
    )
    await page.click('#close-tab')
    await expect(text(page, 'hash')).toHaveText('#tab/x')
    await page.click('#close-tab')
    await expect(text(page, 'hash')).toHaveText('')
    await expect(page).toHaveURL(/\/shallow$/)
    expect(made).toEqual([])
    await page.goBack()
    await expect(page).toHaveURL(/\/long$/)
  })

  test('closed after a document load with the #fragment: the URL without it, in place', async ({
    page,
  }) => {
    await page.goto('/long')
    await open(page, '/shallow#tab/y')
    await expect(text(page, 'hash')).toHaveText('#tab/y')
    await page.click('#close-tab')
    await expect(text(page, 'hash')).toHaveText('')
    await expect(page).toHaveURL(/\/shallow$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/long$/)
  })

  test('a #fragment is not the browser’s navigation: nothing scrolls to it, :target is none; the browser’s own is', async ({
    page,
  }) => {
    await open(page)
    near(await scrollY(page), 0)
    await page.evaluate(() => document.getElementById('push-list')!.click()) // not scrolled to by Playwright
    await expect(page).toHaveURL(/\/shallow#list$/)
    near(await scrollY(page), 0)
    expect(await page.evaluate(() => document.querySelector(':target')?.id ?? null)).toBeNull()
    await page.click('#native')
    await expect.poll(() => scrollY(page)).toBeGreaterThan(100)
    expect(await page.evaluate(() => document.querySelector(':target')?.id ?? null)).toBe('list')
  })

  test('native #fragment entries below and above shallow ones: Back and Forward ask for nothing, the state stays', async ({
    page,
  }) => {
    await open(page)
    await page.fill('#draft', 'typed')
    const before = await loads(page)
    const made = requests(page)
    const native = () => page.evaluate(() => document.getElementById('native')!.click()) // no pointer: no prefetch
    await native() // below: /shallow#list
    await expect(page).toHaveURL(/\/shallow#list$/)
    await page.click('#open-a') // a shallow entry: /shallow?item=a
    await expect(item(page)).toHaveText('Alpha')
    await native() // above: /shallow?item=a#list
    await expect(page).toHaveURL(/item=a#list$/)
    for (const back of [/item=a$/, /\/shallow#list$/, /\/shallow$/]) {
      await page.goBack()
      await expect(page).toHaveURL(back)
    }
    await expect(drawer(page)).toHaveCount(0)
    for (const forward of [/\/shallow#list$/, /item=a$/, /item=a#list$/]) {
      await page.goForward()
      await expect(page).toHaveURL(forward)
    }
    await expect(item(page)).toHaveText('Alpha')
    await expect(text(page, 'url')).toHaveText('/shallow?item=a')
    await expect(page.locator('#draft')).toHaveValue('typed')
    expect(await loads(page)).toBe(before)
    expect(made).toEqual([])
  })
})

test.describe('a real answer on a shallow entry ends the sharing: Back to the others asks', () => {
  test('reload(): the entry’s URL is asked for; Back to the list is a request', async ({
    page,
  }) => {
    await open(page)
    await page.click('#open-a')
    await expect(item(page)).toHaveText('Alpha')
    const before = await loads(page)
    const made = requests(page)
    await page.click('#reload')
    await expect.poll(() => loads(page)).toBeGreaterThan(before)
    expect(visits(made)).toEqual(['/_fondu/pages/shallow.json?item=a'])
    await expect(item(page)).toHaveText('Alpha')
    await expect(text(page, 'url')).toHaveText('/shallow?item=a')
    made.length = 0
    const answered = await loads(page)
    await page.goBack()
    await expect(drawer(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/shallow$/)
    await expect.poll(() => loads(page)).toBeGreaterThan(answered)
    expect(visits(made)).toEqual(['/_fondu/pages/shallow.json'])
  })

  test('reload({ only }): the prop asked at the entry’s URL, then Back to the list is a request', async ({
    page,
  }) => {
    await open(page)
    await page.click('#open-b')
    await expect(item(page)).toHaveText('Beta')
    await expect(text(page, 'loaded')).toHaveText('')
    const before = await loads(page)
    const made = requests(page)
    await page.click('#reload-only')
    await expect(text(page, 'loaded')).toHaveText('b') // the loader's answer for ?item=b
    expect(await loads(page)).toBe(before) // the other props are not asked for
    made.length = 0
    await page.goBack()
    await expect(page).toHaveURL(/\/shallow$/)
    await expect(drawer(page)).toHaveCount(0)
    await expect.poll(() => visits(made)).toEqual(['/_fondu/pages/shallow.json'])
  })

  test('a form’s answer with flash: the drawer and its entry stay; Back asks; the flash is not shown again', async ({
    page,
  }) => {
    await page.goto('/long')
    await open(page)
    await page.click('#open-a')
    await page.click('#note')
    await expect(text(page, 'flash')).toHaveText('Saved')
    await expect(item(page)).toHaveText('Alpha')
    await expect(page).toHaveURL(/\/shallow\?item=a$/)
    const made = requests(page)
    await page.goBack()
    await expect(drawer(page)).toHaveCount(0)
    await expect.poll(() => visits(made)).toEqual(['/_fondu/pages/shallow.json'])
    await expect(text(page, 'flash')).toHaveText('')
    await page.goForward()
    await expect(item(page)).toHaveText('Alpha')
    await expect(text(page, 'flash')).toHaveText('')
  })

  test('a form’s answer with flash, then a shallow navigation: the flash is gone; Back to the answer’s entry asks for nothing', async ({
    page,
  }) => {
    await open(page)
    await page.click('#open-a')
    await page.click('#note')
    await expect(text(page, 'flash')).toHaveText('Saved')
    const made = requests(page)
    await page.click('#next-push')
    await expect(item(page)).toHaveText('Beta')
    await expect(text(page, 'flash')).toHaveText('')
    await page.goBack()
    await expect(item(page)).toHaveText('Alpha')
    await expect(text(page, 'flash')).toHaveText('')
    expect(made).toEqual([])
  })

  test('a form’s answer with errors, then a shallow navigation: the errors are gone', async ({
    page,
  }) => {
    await open(page)
    await page.click('#open-a')
    await page.click('#check')
    await expect(text(page, 'errors')).toHaveText('Too short')
    await expect(item(page)).toHaveText('Alpha')
    await expect(page).toHaveURL(/\/shallow\?item=a$/)
    const made = requests(page)
    await page.click('#next')
    await expect(item(page)).toHaveText('Beta')
    await expect(text(page, 'errors')).toHaveText('')
    expect(made).toEqual([])
    // the entries after the answer share its page; the one before it (the list) does not
    await page.click('#next-push')
    await page.goBack()
    await expect(item(page)).toHaveText('Beta')
    expect(made).toEqual([])
    await page.goBack()
    await expect(drawer(page)).toHaveCount(0)
    await expect.poll(() => visits(made)).toEqual(['/_fondu/pages/shallow.json'])
  })

  test('deferred props in flight across a shallow navigation: they arrive in the page, nothing else is asked', async ({
    page,
  }) => {
    // the deferred request, held back: the click comes first
    await page.route('**/shallow', async (route) => {
      if (route.request().headers()['x-fondu-only'])
        await new Promise((resolve) => setTimeout(resolve, 800))
      await route.continue()
    })
    const asked = requests(page)
    await open(page)
    await expect(text(page, 'later')).toHaveText('pending')
    await page.click('#open-a')
    await expect(text(page, 'later')).toHaveText('none') // the answer for /shallow, merged into the page now at ?item=a
    await expect(text(page, 'url')).toHaveText('/shallow?item=a')
    expect(asked.filter((url) => url.includes(' only='))).toEqual([
      '/_fondu/pages/shallow.json only=later',
    ])
    const made = requests(page)
    await page.goBack()
    await expect(drawer(page)).toHaveCount(0)
    await expect(text(page, 'later')).toHaveText('none')
    expect(made).toEqual([])
  })
})

test.describe('the API', () => {
  test('shallow to another page throws, saying what to write; with a trailing slash it is another page', async ({
    page,
  }) => {
    await open(page)
    await page.click('#elsewhere')
    await expect(text(page, 'refused')).toContainText(
      'a shallow navigation stays on this page (its query, its #fragment); /long is another page: leave out `shallow`',
    )
    await page.click('#with-slash')
    await expect(text(page, 'refused')).toContainText('/shallow/ is another page')
    await expect(page).toHaveURL(/\/shallow$/)
  })

  test('shallow with keep throws', async ({ page }) => {
    await open(page)
    await page.click('#with-keep')
    await expect(text(page, 'refused')).toContainText('a shallow navigation takes no `keep`')
    await expect(page).toHaveURL(/\/shallow$/)
  })

  test('navigate() shallow: a query and a fragment, no request', async ({ page }) => {
    await open(page)
    const made = requests(page)
    await page.click('#push-q')
    await expect(text(page, 'url')).toHaveText('/shallow?q=1')
    await page.click('#push-x')
    await expect(text(page, 'url')).toHaveText('/shallow?q=1')
    await expect(text(page, 'hash')).toHaveText('#tab/x')
    await expect(page).toHaveURL(/\/shallow\?q=1#tab\/x$/)
    expect(made).toEqual([])
  })

  test('data-shallow: a modified click, and a link to another page, are ordinary; a plain link without it is a visit', async ({
    page,
  }) => {
    await open(page)
    // what the click listener of the client did with each click (a later listener sees `defaultPrevented`)
    const prevented = await page.evaluate(() => {
      const seen: Record<string, boolean> = {}
      addEventListener('click', (event) => {
        const link = (event.target as Element).closest('a')!
        seen[link.id + (event.ctrlKey ? '+ctrl' : '')] = event.defaultPrevented
        event.preventDefault() // the browser's own is not wanted here
      })
      const click = (id: string, ctrlKey = false) =>
        document
          .getElementById(id)!
          .dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey, button: 0 }),
          )
      click('open-a')
      click('open-b', true)
      click('shallow-to-long')
      return seen
    })
    expect(prevented).toEqual({ 'open-a': true, 'open-b+ctrl': false, 'shallow-to-long': true })
  })

  test('data-shallow to another page is an ordinary link: a visit, and the link is prefetched as usual', async ({
    page,
  }) => {
    await open(page)
    const made = requests(page)
    await page.hover('#open-a')
    await page.waitForTimeout(300)
    expect(made).toEqual([]) // a shallow link: nothing to ask for
    await page.hover('#shallow-to-long')
    await expect.poll(() => made.some((url) => url.includes('/_fondu/pages/long.json'))).toBe(true)
    made.length = 0
    await page.click('#shallow-to-long')
    await expect.poll(() => new URL(page.url()).pathname).toBe('/long') // (a prerendered page has no query)
  })
})

test.describe('the pathname', () => {
  for (const name of ['caf%C3%A9%20%E2%98%95', 'a%2Fb', '%2e%2e%2fb']) {
    test(`encoded (/shallow/${name}): the same pathname however it is written is shallow; a trailing slash is another page`, async ({
      page,
    }) => {
      await open(page, `/shallow/${name}`)
      const path = new URL(page.url()).pathname
      const made = requests(page)
      await page.click('#same')
      await expect(page).toHaveURL(`http://localhost:3100${path}?x=1`)
      await expect(text(page, 'url')).toHaveText(`${path}?x=1`)
      expect(made).toEqual([])
      if (name.startsWith('caf')) {
        await page.click('#raw') // written raw in the link's href
        await expect(page).toHaveURL(`http://localhost:3100${path}?x=2`)
        expect(made).toEqual([])
      }
      await page.click('#slash-nav')
      await expect(text(page, 'refused')).toContainText('is another page')
      // a link with the slash is a visit: the server answers for it (it redirects to the path without)
      await page.click('#slash')
      await expect.poll(() => made.length).toBeGreaterThan(0)
      await expect(page).toHaveURL(/\?x=3$/)
      expect(new URL(page.url()).pathname).not.toMatch(/\/$/)
    })
  }
})

test.describe('a prerendered page', () => {
  test('a direct load with a query: usePage().url has it, and a shallow navigation changes it', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on(
      'console',
      (message) =>
        message.type() === 'error' &&
        !message.text().startsWith('Failed to load resource') && // /favicon.ico
        errors.push(message.text()),
    )
    page.on('pageerror', (error) => errors.push(error.message))
    await open(page, '/shallow-static?x=1')
    await expect(text(page, 'url')).toHaveText('/shallow-static?x=1')
    const made = requests(page)
    await page.click('#open')
    await expect(text(page, 'url')).toHaveText('/shallow-static?tab=a')
    expect(made).toEqual([])
    expect(errors).toEqual([]) // hydrated against the file's own markup, without a mismatch
  })

  test('without a query: its URL is the path', async ({ page }) => {
    await open(page, '/shallow-static')
    await expect(text(page, 'url')).toHaveText('/shallow-static')
  })
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })
  test('a link to an item is a link: the server renders the drawer', async ({ page }) => {
    await page.goto('/shallow')
    await expect(drawer(page)).toHaveCount(0)
    await page.click('#open-a')
    await expect(page).toHaveURL(/\/shallow\?item=a$/)
    await expect(item(page)).toHaveText('Alpha')
    await page.click('#next-push')
    await expect(item(page)).toHaveText('Beta')
  })
})
