import { expect, test } from '@playwright/test'

// A page with a Suspense boundary that is slow on the server (app/routes/slow.tsx, not prerendered): the shell is
// sent at once, the boundary when its data is there. JavaScript only: React puts a streamed boundary in place with a
// script, so there is no outcome to compare with the browser's own navigation (`both()`)
test.describe('a streamed page', () => {
  test('the fallback, then the content, hydrated: a link in it navigates in place', async ({
    page,
  }) => {
    await page.goto('/slow', { waitUntil: 'commit' })
    await expect(page.locator('#fallback')).toBeVisible()
    await expect(page.locator('#late')).toHaveCount(0) // not in the page yet (its HTML is not sent)
    await expect(page.locator('#late')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('#fallback')).toHaveCount(0)
    expect(await page.title()).toBe('Slow')
    await page.waitForFunction(() => history.state?.__fondu) // hydrated
    await page.evaluate(() => ((window as unknown as { same: number }).same = 1))
    await page.click('#to-long')
    await expect(page).toHaveURL('/long')
    await expect(page.locator('h1')).toHaveText('Long')
    expect(await page.evaluate(() => (window as unknown as { same?: number }).same)).toBe(1) // no reload
  })
  test('without JavaScript: the fallback stays, the content is in the document, hidden', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/slow')
    await expect(page.locator('#fallback')).toBeVisible()
    await expect(page.locator('#late')).toBeHidden()
    await expect(page.locator('div[hidden] #late')).toHaveCount(1)
    await context.close()
  })
})
