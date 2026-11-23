import { expect, test } from '@playwright/test'

// useForm with a schema that answers with a promise (routes/checked-async.tsx): the browser says it checks synchronously,
// and the form is sent as it is, for the server to check.

test('an async schema: an error that says where the rule goes, and the form is sent unchecked', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const posts: string[] = []
  page.on('request', (r) => void (r.method() === 'POST' && posts.push(r.postData() ?? '')))
  await page.goto('/checked-async')
  await page.waitForFunction(() => history.state?.__fondu)
  await page.click('#checked button')
  await expect(page.locator('#received')).toHaveText('{"name":"Ada","other":"x"}')
  expect(posts).toHaveLength(1)
  expect(errors).toEqual(['fondu: useForm checks synchronously; check an async rule on the server'])
})

test('an async schema: a field left for another throws the same error, and sends nothing', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const posts: string[] = []
  page.on('request', (r) => void (r.method() === 'POST' && posts.push(r.url())))
  await page.goto('/checked-async')
  await page.waitForFunction(() => history.state?.__fondu)
  await page.fill('[name=name]', 'Grace')
  await page.focus('[name=other]')
  await expect
    .poll(() => errors)
    .toEqual(['fondu: useForm checks synchronously; check an async rule on the server'])
  expect(posts).toEqual([])
})
