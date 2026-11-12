import { expect, test } from '@playwright/test'

// A page that throws in the browser (app/routes/boom.tsx) gets the error page; this app's error page throws for
// that status too. JavaScript only: without it there is no browser render to fail. The page must not be blank.
test.describe('an error page that fails', () => {
  test('plain text in its place, and the failure in the console: not an empty page', async ({
    page,
  }, testInfo) => {
    const logged: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') logged.push(m.text())
    })
    await page.goto('/boom')
    await page.waitForFunction(() => history.state?.__fondu) // hydrated
    await page.waitForLoadState('networkidle') // the error page's module is loaded
    await page.getByRole('button', { name: 'Break and fail the error page' }).click()
    await expect(page.locator('#app')).toHaveText('Something went wrong')
    await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' })
    expect(
      logged.filter((l) => l.startsWith('[fondu] the error page failed to render:')),
      'logged once',
    ).toHaveLength(1)
  })

  test('with an error page that works: the error page, in the layout (the failing one is the exception)', async ({
    page,
  }) => {
    await page.goto('/boom')
    await page.waitForFunction(() => history.state?.__fondu) // hydrated
    await page.waitForLoadState('networkidle') // the error page's module is loaded
    await page.getByRole('button', { name: 'Break', exact: true }).click()
    await expect(page.locator('main h1')).toHaveText('Error')
  })
})
