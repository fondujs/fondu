import { expect, test } from '@playwright/test'

// useForm with a schema that answers with a promise (routes/checked-async.tsx): no verdict in the browser, the form is
// sent, and the server's errors come back as any other. The warning is development's: this build has none (the unit test
// in packages/fondu/test/form-check.test.ts has it).

function watch(page: import('@playwright/test').Page) {
  const seen = { errors: [] as string[], warnings: [] as string[], posts: [] as string[] }
  page.on('pageerror', (error) => seen.errors.push(error.message))
  page.on('console', (m) => void (m.type() === 'warning' && seen.warnings.push(m.text())))
  page.on('request', (r) => void (r.method() === 'POST' && seen.posts.push(r.postData() ?? '')))
  return seen
}

test('an async schema: the form is sent unchecked, with no error and no warning', async ({
  page,
}) => {
  const seen = watch(page)
  await page.goto('/checked-async')
  await page.waitForFunction(() => history.state?.__fondu)
  await page.click('#checked button')
  await expect(page.locator('#received')).toHaveText('{"name":"Ada","other":"x"}')
  expect(seen.posts).toHaveLength(1)
  expect(seen.errors).toEqual([])
  expect(seen.warnings).toEqual([])
})

test("an async schema: the server's errors render", async ({ page }) => {
  const seen = watch(page)
  await page.goto('/checked-async')
  await page.waitForFunction(() => history.state?.__fondu)
  await page.fill('[name=name]', 'Taken')
  await page.click('#checked button')
  await expect(page.locator('#errors')).toHaveText('{"name":"Taken already"}')
  expect(seen.errors).toEqual([])
})

test('an async schema that rejects: no unhandled rejection, the form is sent, a field left for another is no error', async ({
  page,
}) => {
  const seen = watch(page)
  await page.goto('/checked-async')
  await page.waitForFunction(() => history.state?.__fondu)
  await page.fill('[name=other]', 'reject')
  await page.fill('[name=name]', 'Grace')
  await page.focus('[name=other]')
  await page.fill('[name=name]', 'Grace2')
  await page.focus('[name=other]')
  await page.click('#checked button')
  await expect(page.locator('#received')).toHaveText('{"name":"Grace2","other":"reject"}')
  expect(seen.posts).toHaveLength(1)
  expect(seen.errors).toEqual([])
})
