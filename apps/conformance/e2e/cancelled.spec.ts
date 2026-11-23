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
