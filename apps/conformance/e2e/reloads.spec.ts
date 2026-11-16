import { expect, test, type Page } from '@playwright/test'

// Quiet partial reloads (app/routes/reloads.tsx) answered out of order: each answer is held back, then given with
// the values the case chooses. The newest answer for a prop is the page's, an older one that comes after it is dropped.
// JavaScript only

const hydrated = (page: Page) => page.waitForFunction(() => history.state?.__fondu)

type Held = {
  names: string
  answer: (props: Record<string, string>) => Promise<void>
  fail: () => Promise<void>
}

/** the partial requests of the page, in the order they were made: each waits for the case to answer it */
async function hold(page: Page) {
  const held: Held[] = []
  await page.route('**/_fondu/pages/reloads.json*', async (route) => {
    const names = route.request().headers()['x-fondu-only']
    if (!names) return route.continue()
    await new Promise<void>((released) => {
      const done = (answer: Parameters<typeof route.fulfill>[0]) =>
        route.fulfill(answer).then(released)
      held.push({
        names,
        answer: async (props) => {
          const response = await route.fetch()
          const object = await response.json()
          await done({ response, json: { ...object, props: { ...object.props, ...props } } })
        },
        fail: () => done({ status: 500, body: 'no' }),
      })
      page.on('close', () => released())
    }).catch(() => {})
  })
  return held
}
const values = (page: Page) =>
  page.evaluate(() =>
    ['a', 'b', 'c'].map((id) => document.getElementById(id)!.textContent).join(' '),
  )
const reload = (page: Page, id: string) => page.click(`#only-${id}`)
const asked = (held: Held[], count: number) => expect.poll(() => held.length).toBe(count)
/** the answer has been given, and the client has had its time with it */
const settled = (page: Page) => page.waitForTimeout(300)

test.describe('partial reloads that overlap', () => {
  test('the same prop: the older answer, last, does not overwrite the newer', async ({ page }) => {
    await page.goto('/reloads')
    await hydrated(page)
    const held = await hold(page)
    await reload(page, 'a')
    await reload(page, 'a')
    await asked(held, 2)
    await held[1]!.answer({ a: 'new' })
    await expect.poll(() => values(page)).toBe('new b0 c0')
    await held[0]!.answer({ a: 'old' })
    await settled(page)
    expect(await values(page)).toBe('new b0 c0')
  })

  test('the same prop, answered in order: the newer, last, is the page’s', async ({ page }) => {
    await page.goto('/reloads')
    await hydrated(page)
    const held = await hold(page)
    await reload(page, 'a')
    await reload(page, 'a')
    await asked(held, 2)
    await held[0]!.answer({ a: 'old' })
    await expect.poll(() => values(page)).toBe('old b0 c0')
    await held[1]!.answer({ a: 'new' })
    await expect.poll(() => values(page)).toBe('new b0 c0')
  })

  test('partly the same props: the older answer keeps what it alone asked for', async ({
    page,
  }) => {
    await page.goto('/reloads')
    await hydrated(page)
    const held = await hold(page)
    await reload(page, 'ab')
    await reload(page, 'bc')
    await asked(held, 2)
    await held[1]!.answer({ b: 'new', c: 'new' })
    await expect.poll(() => values(page)).toBe('a0 new new')
    await held[0]!.answer({ a: 'old', b: 'old' })
    await expect.poll(() => values(page)).toBe('old new new')
    await settled(page)
    expect(await values(page)).toBe('old new new')
  })

  test('different props: both are the page’s, in either order', async ({ page }) => {
    await page.goto('/reloads')
    await hydrated(page)
    const held = await hold(page)
    await reload(page, 'a')
    await reload(page, 'b')
    await asked(held, 2)
    await held[1]!.answer({ b: 'B' })
    await expect.poll(() => values(page)).toBe('a0 B c0')
    await held[0]!.answer({ a: 'A' })
    await expect.poll(() => values(page)).toBe('A B c0')
  })

  test('a newer request that failed does not drop the older one’s answer', async ({ page }) => {
    await page.goto('/reloads')
    await hydrated(page)
    const held = await hold(page)
    await reload(page, 'a')
    await reload(page, 'a')
    await asked(held, 2)
    await held[1]!.fail()
    await settled(page)
    expect(await values(page)).toBe('a0 b0 c0')
    await held[0]!.answer({ a: 'old' })
    await expect.poll(() => values(page)).toBe('old b0 c0')
  })

  test('an older request that failed, after the newer answer: the newer stays', async ({
    page,
  }) => {
    await page.goto('/reloads')
    await hydrated(page)
    const held = await hold(page)
    await reload(page, 'a')
    await reload(page, 'a')
    await asked(held, 2)
    await held[1]!.answer({ a: 'new' })
    await expect.poll(() => values(page)).toBe('new b0 c0')
    await held[0]!.fail()
    await settled(page)
    expect(await values(page)).toBe('new b0 c0')
  })

  test('a navigation in between: the answers of the page left are dropped', async ({ page }) => {
    await page.goto('/reloads')
    await hydrated(page)
    const held = await hold(page)
    await reload(page, 'a')
    await reload(page, 'b')
    await asked(held, 2)
    await page.click('#to-same')
    await expect.poll(() => values(page)).toBe('a0?v=2 b0?v=2 c0?v=2')
    await held[0]!.answer({ a: 'old' }).catch(() => {})
    await held[1]!.answer({ b: 'old' }).catch(() => {})
    await settled(page)
    expect(await values(page)).toBe('a0?v=2 b0?v=2 c0?v=2')
    expect(new URL(page.url()).search).toBe('?v=2')
  })
})
