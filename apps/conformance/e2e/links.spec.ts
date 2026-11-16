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
