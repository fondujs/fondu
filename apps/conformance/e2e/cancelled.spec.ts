import { expect, test, type Page } from '@playwright/test'

// A request that is cancelled does not touch the page: its answer, read in full or not, is dropped (the visit's
// own signal is checked after each wait, as the JSON branch does). JavaScript only: nothing to compare without it.

const hydrated = (page: Page) => page.waitForFunction(() => history.state?.__fondu)

test.describe("a form's answer that is no page", () => {
  // The body is read whole, and the visit is left (a link's click) at that moment: after the read, before the client acts
  // on it. fetch() itself rejects an abort that comes while the body is on its way; this is the one that comes after.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      for (const name of ['blob', 'text'] as const) {
        const read = Response.prototype[name] as () => Promise<unknown>
        Response.prototype[name] = async function (this: Response) {
          const value = await read.call(this)
          if (this.url.includes('/answers?')) document.querySelector<HTMLElement>('#away')!.click()
          return value
        } as never
      }
    })
  })

  for (const form of ['download', 'html', 'text']) {
    test(`${form}: the visit left while its body is read: no download, no document written`, async ({
      page,
    }) => {
      const downloads: string[] = []
      page.on('download', (download) => downloads.push(download.suggestedFilename()))
      await page.goto('/answers')
      await hydrated(page)
      await page.click(`#${form} button`)
      await expect(page.locator('h1')).toHaveText('Long')
      await page.waitForTimeout(300)
      expect(downloads).toEqual([])
      await expect(page.locator('#replaced, pre')).toHaveCount(0)
      await expect(page.locator('h1')).toHaveText('Long')
      expect(new URL(page.url()).pathname).toBe('/long')
    })
  }
})

test.describe('a deferred prop asked for twice', () => {
  // each request to the page's data that asks for props is held until the test lets it go
  async function hold(page: Page) {
    const held: Array<{ names: string; answer: (abort: boolean) => void }> = []
    await page.route('**/_fondu/pages/deferred.json', async (route) => {
      const names = route.request().headers()['x-fondu-only']
      if (!names) return route.continue()
      const abort = await new Promise<boolean>((answer) => held.push({ names, answer }))
      return abort ? route.abort() : route.continue()
    })
    return held
  }

  test('the first request ends and fails: a prop asked again stays pending for the second', async ({
    page,
  }) => {
    const held = await hold(page)
    await page.goto('/deferred')
    await hydrated(page)
    await expect(async () => expect(held.map((h) => h.names)).toEqual(['stats,broken'])).toPass()
    await page.click('#only')
    await expect(async () =>
      expect(held.map((h) => h.names)).toEqual(['stats,broken', 'stats']),
    ).toPass()
    held[0]!.answer(true)
    // `broken` was asked once: its request ended it. `stats` was asked again, and waits for that one
    await expect(page.locator('#broken-failed')).toBeVisible()
    await expect(page.locator('#fallback')).toBeVisible()
    await expect(page.locator('#stats-failed')).toHaveCount(0)
    held[1]!.answer(false)
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#fallback')).toHaveCount(0)
  })

  test('a newer request that fails: the older success is shown', async ({ page }) => {
    const held = await hold(page)
    await page.goto('/deferred')
    await hydrated(page)
    await expect(async () => expect(held).toHaveLength(1)).toPass()
    await page.click('#only')
    await expect(async () => expect(held).toHaveLength(2)).toPass()
    held[1]!.answer(true)
    await expect(page.locator('#stats-failed')).toBeVisible()
    held[0]!.answer(false)
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#stats-failed')).toHaveCount(0)
  })
})
