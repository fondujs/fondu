import { expect, test } from '@playwright/test'

test('a feature article keeps Site and replaces Blog (TSX to prerendered MDX and Back)', async ({
  page,
}) => {
  await page.goto('/layouts/blog/news')
  await page.waitForFunction(() => history.state?.__fondu)
  const search = page.getByLabel('Site search')
  await search.fill('kept')
  await page.getByLabel('Sidebar draft').fill('discard me')
  await expect(page.getByText('Blog sidebar')).toBeVisible()
  await page.getByRole('link', { name: 'Annual review' }).click()
  await expect(page.getByRole('article', { name: 'Special feature' })).toBeVisible()
  await expect(page.getByText('Blog sidebar')).toHaveCount(0)
  await expect(search).toHaveValue('kept')
  await page.evaluate(() => history.back())
  await expect(page.getByLabel('Sidebar draft')).toHaveValue('')
  await expect(page.getByText('Blog sidebar')).toBeVisible()
  await expect(search).toHaveValue('kept')
})

test('a cold ordinary article neither preloads nor requests the feature assets', async ({
  page,
  request,
}) => {
  const feature = '/layouts/blog/review',
    ordinary = '/layouts/blog/news'
  const html = await (await request.get(feature)).text()
  const hrefs = [...html.matchAll(/<link\b[^>]*href="([^"#]+\.(?:css|js))"/g)].map((m) => m[1]!)
  const only: string[] = []
  for (const href of hrefs) {
    const text = await (await request.get(href)).text()
    if (
      href.endsWith('.css') ? text.includes('--feature-layout') : text.includes('Special feature')
    )
      only.push(href)
  }
  expect(only.some((u) => u.endsWith('.js'))).toBe(true)
  expect(only.some((u) => u.endsWith('.css'))).toBe(true)
  const requests: string[] = []
  page.on('request', (r) => requests.push(new URL(r.url()).pathname))
  const news = await page.goto(ordinary)
  await page.waitForFunction(() => history.state?.__fondu)
  const doc = await news!.text()
  for (const href of only) {
    expect(doc).not.toContain(href)
    expect(requests).not.toContain(href)
  }
  await page.getByRole('link', { name: 'Annual review' }).click()
  await expect(page.getByRole('article')).toHaveCSS('--feature-layout', 'selected')
  for (const href of only) expect(requests).toContain(href)
})

test('hydration reuses the input that the prerendered MDX chain supplied', async ({ page }) => {
  let boot!: () => void
  const waiting = new Promise<void>((resolve) => {
    boot = resolve
  })
  await page.route('**/assets/*.js', async (route) => {
    await waiting
    await route.continue()
  })
  await page.goto('/layouts/blog/review', { waitUntil: 'commit' })
  const search = page.getByLabel('Site search')
  const input = await search.elementHandle()
  try {
    await search.fill('before boot')
  } finally {
    boot()
  }
  await page.waitForFunction(() => history.state?.__fondu)
  await expect(search).toHaveValue('before boot')
  expect(await search.evaluate((node, original) => node === original, input)).toBe(true)
})

test('contacts share their workspace across list, detail, edit and Back', async ({ page }) => {
  await page.goto('/layouts/contacts')
  await page.waitForFunction(() => history.state?.__fondu)
  await expect(page.getByLabel('Site search')).toHaveCount(0)
  const filter = page.getByLabel('Workspace filter')
  await filter.fill('Ada')
  await page.getByRole('link', { name: 'Ada' }).click()
  await page.getByRole('link', { name: 'Edit Ada' }).click()
  await expect(page.getByLabel('New name')).toHaveValue('Ada')
  await expect(filter).toHaveValue('Ada')
  await page.evaluate(() => history.back())
  await expect(page.getByRole('link', { name: 'Edit Ada' })).toBeVisible()
  await expect(filter).toHaveValue('Ada')
})

test('without JavaScript: MDX uses its chain and a standalone print page still requires authorization', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    await page.goto('/layouts/blog/review')
    await expect(page.getByLabel('Site search')).toBeVisible()
    await expect(page.getByRole('article', { name: 'Special feature' })).toBeVisible()
    await expect(page.getByText('Blog sidebar')).toHaveCount(0)
    expect((await page.goto('/layouts/contacts/print'))?.status()).toBe(403)
    await page.setExtraHTTPHeaders({ Authorization: 'Bearer fixture' })
    expect((await page.goto('/layouts/contacts/print'))?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Print contacts' })).toBeVisible()
    await expect(page.locator('main, input, section[aria-label=Contacts]')).toHaveCount(0)
    await expect(page.locator('script[data-page=app]')).toHaveCount(1)
  } finally {
    await context.close()
  }
})
