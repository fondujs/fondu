import { expect, test } from '@playwright/test'

test('a layout stays while the pages below it change; the layout of another directory goes (and Back brings it)', async ({
  page,
}) => {
  await page.goto('/layouts/blog/news')
  await page.waitForFunction(() => history.state?.__fondu)
  const search = page.getByLabel('Site search')
  await search.fill('kept')
  await page.getByLabel('Sidebar draft').fill('discard me')
  await expect(page.getByText('Blog sidebar')).toBeVisible()
  await page.getByRole('link', { name: 'About' }).click()
  await expect(page.getByRole('heading', { name: 'About the site' })).toBeVisible()
  await expect(page.getByText('Blog sidebar')).toHaveCount(0)
  await expect(search).toHaveValue('kept')
  await page.evaluate(() => history.back())
  await expect(page.getByLabel('Sidebar draft')).toHaveValue('')
  await expect(page.getByText('Blog sidebar')).toBeVisible()
  await expect(search).toHaveValue('kept')
})

test.describe('without JavaScript: layout CSS cascade', () => {
  test.use({ javaScriptEnabled: false })

  test('page styles override the styles of its layouts on a prerendered page', async ({ page }) => {
    expect((await page.goto('/layouts/blog/news'))?.status()).toBe(200)
    await expect(page.getByRole('link', { name: 'About' })).toHaveCSS('color', 'rgb(0, 0, 255)')
  })
})
