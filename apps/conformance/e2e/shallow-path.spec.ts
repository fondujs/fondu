import { expect, test, type Page } from '@playwright/test'

const open = async (page: Page) => {
  await page.goto('/shallow-list')
  await page.waitForFunction(() => history.state?.__fondu)
}
const requests = (page: Page) => {
  const made: string[] = []
  page.on('request', (request) =>
    made.push(new URL(request.url()).pathname + new URL(request.url()).search),
  )
  return made
}
const dialog = (page: Page, id = '7') =>
  expect(page.locator('#item-dialog')).toHaveText(`Dialog ${id}`)
const listAt = async (page: Page, url: string) => {
  await expect(page).toHaveURL(url)
  await expect(page.locator('#url')).toHaveText(url)
  await expect(page.locator('#component')).toHaveText('shallow-list')
  await expect(page.locator('#label')).toHaveText('list props')
}

// A different pathname shares only the live list. Once its group is left, the item's route owns that URL.
test.describe('shallow navigation to another page URL', () => {
  test('a link changes URL only: no request, same component, props, state and scroll, never a view transition', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const start = document.startViewTransition
      const w = window as unknown as { transitions: number }
      w.transitions = 0
      if (start)
        document.startViewTransition = function (...args) {
          w.transitions++
          return start.apply(this, args)
        }
    })
    await open(page)
    await page.fill('#draft', 'typed')
    await page.evaluate(() => scrollTo(0, 900))
    const made = requests(page)
    await page.click('#open-7')
    await dialog(page)
    await listAt(page, '/shallow-items/7')
    expect(await page.evaluate(() => scrollY)).toBe(900)
    await expect(page.locator('#draft')).toHaveValue('typed')
    await page.goBack()
    await listAt(page, '/shallow-list')
    await expect(page.locator('#item-dialog')).toHaveCount(0)
    await page.goForward()
    await dialog(page)
    await listAt(page, '/shallow-items/7')
    expect(await page.evaluate(() => scrollY)).toBe(900)
    await page.click('#close')
    await listAt(page, '/shallow-list')
    expect(await page.evaluate(() => scrollY)).toBe(900)
    expect(
      await page.evaluate(() => (window as unknown as { transitions: number }).transitions),
    ).toBe(0)
    expect(made).toEqual([])
  })

  test('navigate() and shallow replace use the same group: a double close returns one step', async ({
    page,
  }) => {
    await page.goto('/long')
    await open(page)
    const length = await page.evaluate(() => history.length)
    const made = requests(page)
    await page.click('#api')
    await dialog(page)
    await page.click('#replace')
    await dialog(page, '8')
    await listAt(page, '/shallow-items/8')
    expect(await page.evaluate(() => history.length)).toBe(length + 1)
    await page.evaluate(() => {
      const close = document.getElementById('close')!
      close.click()
      close.click()
    })
    await listAt(page, '/shallow-list')
    expect(made).toEqual([])
    await page.goBack()
    await expect(page).toHaveURL('/long')
  })

  for (const replace of [false, true]) {
    test(`leaving the group makes Back and Forward ordinary item visits, without a cached list flash (replace=${replace})`, async ({
      page,
    }) => {
      await open(page)
      await page.click('#open-7')
      if (replace) await page.click('#replace')
      const id = replace ? '8' : '7'
      await dialog(page, id)
      await page.click('#leave')
      await expect(page.locator('#item-page')).toHaveText('Item 9')
      await page.click('#to-long')
      await expect(page).toHaveURL('/long')
      await page.evaluate(() => {
        const w = window as unknown as { listFlashed: boolean }
        w.listFlashed = false
        new MutationObserver(() => {
          if (
            location.pathname.startsWith('/shallow-items/') &&
            document.getElementById('cross-list')
          )
            w.listFlashed = true
        }).observe(document.body, { childList: true, subtree: true })
      })
      await page.goBack()
      await expect(page.locator('#item-page')).toHaveText('Item 9')
      const made = requests(page)
      await page.goBack()
      await expect(page.locator('#item-page')).toHaveText(`Item ${id}`)
      await expect(page.locator('#component')).toHaveText('shallow-items/[id]')
      await expect
        .poll(() => made.some((url) => url.includes(`/shallow-items/${id}.json`)))
        .toBe(true)
      await expect(page.locator('#cross-list')).toHaveCount(0)
      expect(
        await page.evaluate(() => (window as unknown as { listFlashed: boolean }).listFlashed),
      ).toBe(false)
      await page.goBack()
      await expect(page.locator('#cross-list')).toBeVisible()
      made.length = 0
      await page.goForward()
      await expect(page.locator('#item-page')).toHaveText(`Item ${id}`)
      await expect
        .poll(() => made.some((url) => url.includes(`/shallow-items/${id}.json`)))
        .toBe(true)
      await expect(page.locator('#item-dialog')).toHaveCount(0)
    })
  }

  test('skipping to an old group at the same URL is an ordinary visit, not a fragment traversal', async ({
    page,
  }) => {
    await open(page)
    await page.click('#open-7')
    await dialog(page)
    await page.click('#visit')
    await expect(page.locator('#item-page')).toHaveText('Item 7')
    await page.click('a[href="/shallow-list"]')
    await expect(page.locator('#cross-list')).toBeVisible()
    await page.click('#open-7')
    await dialog(page)
    const made = requests(page)
    await page.evaluate(() => history.go(-2))
    await expect(page.locator('#item-page')).toHaveText('Item 7')
    await expect(page.locator('#component')).toHaveText('shallow-items/[id]')
    expect(made.some((url) => url.includes('/shallow-items/7.json'))).toBe(true)
  })

  test('deferred props crossing the shallow navigation do not cache the list at the item URL', async ({
    page,
  }) => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/_fondu/pages/shallow-list.json*', async (route) => {
      if (route.request().headers()['x-fondu-only']) await gate
      await route.continue()
    })
    try {
      await page.goto('/shallow-list?defer=1')
      await page.waitForFunction(() => history.state?.__fondu)
      await expect(page.locator('#later')).toHaveText('pending')
      await page.click('#open-7')
      await dialog(page)
      release()
      await expect(page.locator('#later')).toHaveText('ready')
      await page.click('#leave')
      await expect(page.locator('#item-page')).toHaveText('Item 9')
      await page.evaluate(() => {
        const w = window as unknown as { listFlashed: boolean }
        w.listFlashed = false
        new MutationObserver(() => {
          if (document.getElementById('cross-list')) w.listFlashed = true
        }).observe(document.body, { childList: true, subtree: true })
      })
      await page.goBack()
      await expect(page.locator('#item-page')).toHaveText('Item 7')
      expect(
        await page.evaluate(() => (window as unknown as { listFlashed: boolean }).listFlashed),
      ).toBe(false)
    } finally {
      release()
    }
  })

  for (const documentReload of [false, true]) {
    test(`${documentReload ? 'a document reload' : 'reload()'} asks for the shallow URL and shows its own page`, async ({
      page,
    }) => {
      await open(page)
      await page.click('#open-7')
      await dialog(page)
      const made = requests(page)
      if (documentReload) await page.reload()
      else await page.click('#reload')
      await expect(page.locator('#item-page')).toHaveText('Item 7')
      await expect(page.locator('#component')).toHaveText('shallow-items/[id]')
      await expect(page.locator('#item-dialog')).toHaveCount(0)
      expect(made.some((url) => url.includes('/shallow-items/7'))).toBe(true)
    })
  }

  test('invalid, HTTP-only and foreign URLs are refused by the API, naming the URL', async ({
    page,
  }) => {
    await open(page)
    const made = requests(page)
    await page.click('#invalid')
    await expect(page.locator('#error')).toContainText(new URL('/not-a-page', page.url()).href)
    await page.click('#outside')
    await expect(page.locator('#error')).toContainText('https://example.com/shallow-items/7')
    await page.click('#api-http')
    await expect(page.locator('#error')).toContainText(new URL('/counted', page.url()).href)
    await listAt(page, '/shallow-list')
    expect(made).toEqual([])
  })

  test('shallow links are not prefetched on hover or touch, including a different pathname', async ({
    page,
  }) => {
    await open(page)
    const made = requests(page)
    await page.hover('#open-7')
    await page.waitForTimeout(300)
    await page.dispatchEvent('#open-8', 'touchstart')
    await page.waitForTimeout(300)
    expect(made).toEqual([])
  })

  test('modified clicks, targets, downloads and non-page URLs are left to the browser', async ({
    page,
  }) => {
    await open(page)
    const seen = await page.evaluate(() => {
      const seen: Record<string, boolean> = {}
      addEventListener('click', (event) => {
        const link = (event.target as Element).closest('a')!
        seen[link.id] = event.defaultPrevented
        event.preventDefault()
      })
      for (const id of ['open-7', 'target', 'download', 'foreign', 'not-page', 'http-route']) {
        document.getElementById(id)!.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            ctrlKey: id === 'open-7',
            button: 0,
          }),
        )
      }
      return seen
    })
    expect(Object.values(seen)).toEqual([false, false, false, false, false, false])
    await listAt(page, '/shallow-list')
  })

  test('a target opens the URL’s standalone page in a new tab', async ({ page }) => {
    await open(page)
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#target')])
    await expect(popup.locator('#item-page')).toHaveText('Item 7')
    await expect(popup.locator('#item-dialog')).toHaveCount(0)
    await popup.close()
    await listAt(page, '/shallow-list')
  })
})

test.describe('a cross-path shallow link without JavaScript', () => {
  test.use({ javaScriptEnabled: false })
  test('the item’s own route serves the link', async ({ page }) => {
    await page.goto('/shallow-list')
    await page.click('#open-7')
    await expect(page).toHaveURL('/shallow-items/7')
    await expect(page.locator('#item-page')).toHaveText('Item 7')
    await expect(page.locator('#cross-list')).toHaveCount(0)
  })
})
