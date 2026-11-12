import { expect, test } from '@playwright/test'

// #181: a request Fondu refuses itself. 413 (bodyLimit): the error page, with the shared props of the root
// middleware. 403 (CSRF, a cross-site form): Hono's plain "Forbidden", no page (the root middleware does not run).
for (const js of [true, false]) {
  test.describe(js ? 'with fondu/client' : 'without JavaScript', () => {
    test.use({ javaScriptEnabled: js })

    test('a file over the body limit: the error page with the shared props', async ({ page }) => {
      await page.goto('/form')
      await page.locator('#multipart input[type=file]').setInputFiles({
        name: 'big.bin',
        mimeType: 'application/octet-stream',
        buffer: Buffer.alloc(64 * 1024, 1),
      })
      const answer = page.waitForResponse((r) => r.request().method() === 'POST')
      await page.locator('#multipart button').click()
      expect((await answer).status()).toBe(413)
      await expect(page.locator('main h1')).toHaveText('Error')
      await expect(page.locator('#who')).toHaveText('VISITOR')
    })

    test('a cross-site form: refused, plain text', async ({ page }) => {
      await page.route('http://evil.example/**', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<form id="f" method="post" action="http://localhost:3100/echo"><input name="a" value="b"><button>go</button></form>',
        }),
      )
      await page.goto('http://evil.example/')
      const answer = page.waitForResponse((r) => r.request().method() === 'POST')
      await page.locator('#f button').click()
      const res = await answer
      expect([res.status(), await res.text()]).toEqual([403, 'Forbidden'])
    })
  })
}
