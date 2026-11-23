import { expect, test } from '@playwright/test'

// Which clicks, submits and hovers fondu/client takes, and which it leaves to the browser (#233, #234, #235)
let ids = 0
const unique = () => `${test.info().project.name}-${test.info().workerIndex}-${++ids}-${Date.now()}`
const hydrated = (page: import('@playwright/test').Page) =>
  page.waitForFunction(() => history.state?.__fondu)

test.describe('a GET form to an HTTP route', () => {
  test('its handler is called once: the browser submits it, the client does not ask first', async ({
    page,
  }) => {
    await page.goto('/form')
    await hydrated(page)
    await page.locator('#to-route input[name=id]').fill(unique())
    await page.locator('#to-route button').click()
    await expect(page).toHaveURL(/\/counted\?id=/)
    await expect(page.locator('body')).toHaveText('calls: 1')
  })
})

test.describe('a prefetch', () => {
  test('asks at low priority', async ({ page }) => {
    // what each fetch() of the page is given
    type Call = { url: string; priority?: string; prefetch: boolean }
    await page.addInitScript(() => {
      const calls: Call[] = []
      ;(window as unknown as { calls: Call[] }).calls = calls
      const real = window.fetch
      window.fetch = (input, init) => {
        const headers = new Headers(init?.headers)
        calls.push({
          url: String(input),
          priority: (init as { priority?: string } | undefined)?.priority,
          prefetch: headers.has('X-Fondu-Prefetch'),
        })
        return real.call(window, input, init)
      }
    })
    await page.goto('/')
    await hydrated(page)
    await page.locator('a[href="/long"]').hover()
    const seen = () => page.evaluate(() => (window as unknown as { calls: Call[] }).calls)
    await expect.poll(async () => (await seen()).some((c) => c.prefetch)).toBe(true)
    const calls = await seen()
    expect(calls.filter((c) => c.prefetch).map((c) => c.priority)).toEqual(['low'])
  })
})

test.describe('<base target>', () => {
  const withBase = async (page: import('@playwright/test').Page, target: string) => {
    await page.goto('/')
    await hydrated(page)
    await page.evaluate((target) => {
      const base = document.createElement('base')
      base.target = target
      document.head.append(base)
      const own = document.querySelector('a[href="/long"]')!.cloneNode(true) as HTMLAnchorElement
      own.id = 'own'
      own.target = '_self'
      document.body.append(own)
    }, target)
  }

  test('_blank: a link without a target is the browser’s (a new tab)', async ({
    page,
    context,
  }) => {
    await withBase(page, '_blank')
    const opened = context.waitForEvent('page')
    await page.locator('a[href="/long"]:not(#own)').click()
    const tab = await opened
    await tab.waitForLoadState()
    expect(tab.url()).toMatch(/\/long$/)
    expect(new URL(page.url()).pathname).toBe('/')
  })

  test('_blank: a link with target="_self" is still the client’s', async ({ page }) => {
    await withBase(page, '_blank')
    await page.locator('#own').click()
    await expect(page).toHaveURL(/\/long$/)
    await expect(page.locator('h1')).toHaveText('Long')
    // in place: this document stays (the client's visit keeps `window`)
  })

  test('_self: the client takes the click', async ({ page }) => {
    await withBase(page, '_self')
    await page.locator('a[href="/long"]:not(#own)').click()
    await expect(page).toHaveURL(/\/long$/)
    await expect(page.locator('h1')).toHaveText('Long')
  })
})

for (const javaScriptEnabled of [true, false]) {
  test.describe(`<base href> and forms ${javaScriptEnabled ? 'with' : 'without'} JavaScript`, () => {
    test.use({ javaScriptEnabled })
    for (const override of [false, true])
      test(
        override ? 'a relative submitter formaction' : 'a relative form action',
        async ({ page }) => {
          await page.goto('/vt/a')
          if (javaScriptEnabled) await hydrated(page)
          await page.evaluate((override) => {
            const base = document.createElement('base')
            base.href = '/'
            document.head.append(base)
            const form = document.querySelector<HTMLFormElement>('#form')!
            if (override) {
              form.method = 'post'
              form.querySelector('button')!.setAttribute('formaction', 'echo')
            } else form.setAttribute('action', 'echo')
          }, override)
          await page.locator('#form button').click()
          await expect(page).toHaveURL((url) => url.pathname === '/echo')
          await expect(page.locator('#received')).toContainText(override ? '"POST"' : '"GET"')
        },
      )
  })
}

test.describe('<base target> and forms', () => {
  // /form: its GET form `#get` (to /echo), with a base added; `#get-self` has target="_self", `#self` is a submitter
  // with formtarget="_self"
  const withBase = async (page: import('@playwright/test').Page, target: string) => {
    await page.goto('/form')
    await hydrated(page)
    await page.evaluate((target) => {
      const base = document.createElement('base')
      base.target = target
      document.head.append(base)
      const form = document.getElementById('get') as HTMLFormElement
      const own = form.cloneNode(true) as HTMLFormElement
      own.id = 'get-self'
      own.target = '_self'
      const self = document.createElement('button')
      self.id = 'self'
      self.setAttribute('formtarget', '_self')
      self.textContent = 'Self'
      form.append(self)
      document.body.append(own)
    }, target)
  }

  test('_blank: a form without a target is the browser’s (a new tab)', async ({
    page,
    context,
  }) => {
    await withBase(page, '_blank')
    const opened = context.waitForEvent('page')
    await page.locator('#get button:not(#self)').click()
    const tab = await opened
    await tab.waitForLoadState()
    expect(tab.url()).toMatch(/\/echo\?q=/)
    expect(new URL(page.url()).pathname).toBe('/form')
  })

  test('_blank: a form with target="_self" is still the client’s', async ({ page }) => {
    await withBase(page, '_blank')
    await page.locator('#get-self button').click()
    await expect(page).toHaveURL(/\/echo\?q=/)
  })

  test('_blank: a submitter with formtarget="_self" is still the client’s', async ({ page }) => {
    await withBase(page, '_blank')
    await page.locator('#self').click()
    await expect(page).toHaveURL(/\/echo\?q=/)
  })

  test('_self: the client takes the submit', async ({ page }) => {
    await withBase(page, '_self')
    await page.locator('#get button:not(#self)').click()
    await expect(page).toHaveURL(/\/echo\?q=/)
  })
})
