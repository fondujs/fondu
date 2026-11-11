import { expect, test, type Page } from '@playwright/test'

// A dialog the URL's fragment opens (app/routes/dialog.tsx, not prerendered). JavaScript only: what is under test is
// fondu/client keeping the fragment of the page on the screen for a form's answer to it
const scrollY = (page: Page) => page.evaluate(() => window.scrollY)
const near = (y: number, expected: number) =>
  expect(Math.abs(y - expected), `scrollY ${y}`).toBeLessThanOrEqual(2)

test.describe('a dialog the URL opens', () => {
  test('a dialog the fragment opens: each tab an entry, Back goes to the last, then closes it; the scroll stays', async ({
    page,
  }) => {
    await page.goto('/dialog')
    await page.waitForFunction(() => history.state?.__fondu) // hydrated
    await page.evaluate(() => window.scrollTo(0, 1000))
    near(await scrollY(page), 1000)
    await page.click('#open')
    await expect(page.locator('dialog')).toBeVisible()
    await expect(page.locator('#tab')).toHaveText('account')
    near(await scrollY(page), 1000)
    await page.click('text=Usage')
    await expect(page.locator('#tab')).toHaveText('usage')
    near(await scrollY(page), 1000)
    await page.goBack()
    await expect(page.locator('#tab')).toHaveText('account')
    near(await scrollY(page), 1000)
    await page.goBack()
    await expect(page.locator('dialog')).toHaveCount(0)
    near(await scrollY(page), 1000)
  })

  test('reloaded with the fragment: the dialog open', async ({ page }) => {
    await page.goto('/dialog#settings/usage')
    await expect(page.locator('dialog')).toBeVisible()
    await expect(page.locator('#tab')).toHaveText('usage')
  })

  test('a form in the dialog: an error stays in it; saved, the dialog stays open with the message', async ({
    page,
  }) => {
    await page.goto('/dialog')
    await page.waitForFunction(() => history.state?.__fondu)
    await page.evaluate(() => window.scrollTo(0, 1000))
    await page.click('#open')
    await expect(page.locator('dialog')).toBeVisible()
    await page.fill('dialog input[name=name]', 'a')
    await page.click('dialog button')
    await expect(page.locator('dialog #name-error')).toBeVisible()
    await expect(page.locator('dialog')).toBeVisible()
    expect(page.url()).toMatch(/#settings\/account$/)
    await page.fill('dialog input[name=name]', 'Grace')
    await page.click('dialog button')
    await expect(page.locator('dialog #saved')).toHaveText('Saved')
    await expect(page.locator('dialog')).toBeVisible()
    expect(page.url()).toMatch(/#settings\/account$/)
    near(await scrollY(page), 1000)
  })
})
