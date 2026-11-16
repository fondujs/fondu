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
