import { expect, test, type Page } from '@playwright/test'

// Search as you type (app/routes/search.tsx, not prerendered): each change is navigate(…, { replace, keep }).
// JavaScript only: what is under test is fondu/client keeping the page's state and scroll for another URL
const scrollY = (page: Page) => page.evaluate(() => window.scrollY)
const near = (y: number, expected: number) =>
  expect(Math.abs(y - expected), `scrollY ${y}`).toBeLessThanOrEqual(2)

const open = async (page: Page) => {
  await page.goto('/search')
  await page.waitForFunction(() => history.state?.__fondu) // hydrated
}

test.describe('search as you type', () => {
  test('typing in a search box: each change asks the loader, the box keeps its focus and what was typed, the page stays where it is', async ({
    page,
  }) => {
    await open(page)
    // the input well inside the viewport (an input below it is scrolled into view by the browser's own typing)
    await page.evaluate(() => window.scrollTo(0, document.getElementById('q')!.offsetTop - 300))
    await page.focus('#q')
    const before = await scrollY(page)
    expect(before).toBeGreaterThan(500)
    const entries = await page.evaluate(() => history.length)
    await page.keyboard.type('ann', { delay: 50 })
    await expect(page).toHaveURL(/\/search\?q=ann$/)
    await expect(page.locator('#results li')).toHaveText(['Ann', 'Anna', 'Hannah'])
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('q')
    await expect(page.locator('#q')).toHaveValue('ann')
    near(await scrollY(page), before)
    expect(await page.evaluate(() => history.length)).toBe(entries)
  })

  test('Back after typing: the page before the search', async ({ page }) => {
    await page.goto('/long')
    await open(page)
    await page.focus('#q')
    await page.keyboard.type('ann', { delay: 50 })
    await expect(page).toHaveURL(/\/search\?q=ann$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/long$/)
    await expect(page.locator('h1')).toHaveText('Long')
  })

  test('keep with another page’s URL: that page, at the top', async ({ page }) => {
    await open(page)
    await page.evaluate(() => window.scrollTo(0, 900))
    near(await scrollY(page), 900)
    await page.click('#to-long')
    await expect(page.locator('h1')).toHaveText('Long')
    await expect(page).toHaveURL(/\/long$/)
    near(await scrollY(page), 0)
  })
})
