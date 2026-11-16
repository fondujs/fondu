import { expect, test, type Page } from '@playwright/test'

// useForm with an async schema (routes/checked-async.tsx), its answers given by the test, one by one: a form is sent
// only with the values its check was about, once, and a check that is late says nothing.

const open = async (page: Page) => {
  const posts: string[] = []
  page.on('request', (r) => void (r.method() === 'POST' && posts.push(r.postData() ?? '')))
  await page.goto('/checked-async')
  await page.waitForFunction(() => history.state?.__fondu)
  return posts
}
/** the checks asked so far, and those answered by `release(i)` */
const asked = (page: Page) => page.evaluate(() => window.checks?.length ?? 0)
const release = (page: Page, ...indexes: number[]) =>
  page.evaluate((all) => all.forEach((i) => window.checks[i]!.release()), indexes)
const waitAsked = (page: Page, n: number) =>
  page.waitForFunction((n) => (window.checks?.length ?? 0) >= n, n)
/** a turn for what a released check does to happen (or, as it should, not) */
const later = (page: Page) => page.evaluate(() => new Promise((r) => setTimeout(r, 100)))

declare global {
  interface Window {
    checks: { name: unknown; release: () => void }[]
  }
}

test.describe('useForm: an async check sends what it checked', () => {
  test('a field changed while the form is checked: not sent unchecked; sent when submitted again', async ({
    page,
  }) => {
    const posts = await open(page)
    await page.click('#checked button')
    await waitAsked(page, 1)
    await page.fill('[name=name]', '')
    await release(page, 0) // yes, for "Ada"
    await later(page)
    expect(posts).toEqual([])
    expect(await asked(page)).toBe(1) // not checked again by itself
    await page.fill('[name=name]', 'Grace')
    await page.click('#checked button')
    await waitAsked(page, 2)
    await release(page, 1)
    await expect(page.locator('#received')).toHaveText('{"name":"Grace","other":"x"}')
    expect(posts).toHaveLength(1)
  })

  test('a field changed and changed back: what was checked, sent', async ({ page }) => {
    const posts = await open(page)
    await page.click('#checked button')
    await waitAsked(page, 1)
    await page.fill('[name=name]', 'Grace')
    await page.fill('[name=name]', 'Ada')
    await release(page, 0)
    await expect(page.locator('#received')).toHaveText('{"name":"Ada","other":"x"}')
    expect(posts).toHaveLength(1)
  })

  for (const [together, order] of [
    [false, [0, 1]],
    [false, [1, 0]],
    [true, [0, 1]],
    [true, [1, 0]],
  ] as const) {
    test(`two submits in a row, answered ${together ? 'at once, ' : ''}${order.map((i) => i + 1).join(', ')}: sent once, by the newer`, async ({
      page,
    }) => {
      const posts = await open(page)
      await page.click('#checked button')
      await waitAsked(page, 1)
      await page.click('#checked button')
      await waitAsked(page, 2)
      if (together) await release(page, ...order)
      else
        for (const i of order) {
          await release(page, i)
          await later(page)
        }
      await expect(page.locator('#received')).toHaveText('{"name":"Ada","other":"x"}')
      await later(page)
      expect(posts).toHaveLength(1)
    })
  }

  test('a check that ends after the visit to another page began: not sent', async ({ page }) => {
    const posts = await open(page)
    await page.click('#checked button')
    await waitAsked(page, 1)
    await page.evaluate(() => {
      const a = document.createElement('a')
      a.id = 'away'
      a.href = '/slow'
      a.textContent = 'away'
      document.body.append(a)
    })
    await page.click('#away')
    await release(page, 0)
    await later(page)
    expect(posts).toEqual([])
  })

  test("a check of a field that ends after the whole form's result: it does not undo it", async ({
    page,
  }) => {
    await open(page)
    await page.fill('[name=name]', 'Grace')
    await page.focus('[name=other]') // left for another field: "Grace" is checked
    await waitAsked(page, 1)
    await page.fill('[name=name]', '')
    await page.click('#checked button')
    await waitAsked(page, 2)
    await release(page, 1) // the form: no name
    await expect(page.locator('#errors')).toHaveText('{"name":"A name, please"}')
    await release(page, 0) // the field, as it was: yes
    await later(page)
    await expect(page.locator('#errors')).toHaveText('{"name":"A name, please"}')
  })
})
