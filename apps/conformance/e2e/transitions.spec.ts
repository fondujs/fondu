import { expect, test, type Page } from '@playwright/test'

import {
  address,
  announced,
  frames,
  hasApi,
  hydrated,
  install,
  log,
  press,
  quiet,
  shows,
  type VtWindow,
} from './support/view-transitions.ts'

// `fondu({ viewTransitions: true })`, the default of every navigation (app/routes/vt/): a navigation that restores the
// scroll commits inside the browser's `document.startViewTransition`. The `update` is held at known points
// (support/view-transitions.ts) to see what a newer navigation does while one is pending. JavaScript only, and only
// against the build with the option on (`FONDU_VIEW_TRANSITIONS=1`); a navigation's own choice, which also works with it
// off, is e2e/transition-per-navigation.spec.ts
test.skip(process.env.FONDU_VIEW_TRANSITIONS !== '1', 'the app is built with viewTransitions off')

type W = Window & {
  __vt: VtWindow
}
const entries = (page: Page) => page.evaluate(() => history.length)
const scrolled = (page: Page) => page.evaluate(() => Math.round(scrollY))
const scrollPage = async (page: Page, y: number) => {
  await page.evaluate((y) => scrollTo(0, y), y)
  await page.waitForFunction((y) => Math.round(scrollY) === y, y)
  await frames(page) // the scroll position is kept a frame later
}
// Rendering is paused while a transition's `update` is held (and the browser gives it about 4 seconds): wait on a
// timer then, as `waitForFunction` does by default on animation frames
const phaseIs = (page: Page, phase: string) =>
  page.waitForFunction(
    (phase) => (window as unknown as W).__vt.log.at(-1)?.phase === phase,
    phase,
    { polling: 50 },
  )

/** /vt/p scrolled to 200, then /vt/o scrolled to 500: Back from O is P at 200 */
async function start(page: Page, options?: Parameters<typeof install>[1]) {
  await install(page, options)
  await page.goto('/vt/p')
  await hydrated(page)
  await scrollPage(page, 200)
  await press(page, '#to-o')
  await shows(page, 'o')
  await quiet(page)
  await scrollPage(page, 500)
  return entries(page)
}

type Phase = 'before the answer' | 'preparing' | 'animating'
const PHASES: Phase[] = ['before the answer', 'preparing', 'animating']

/** the visit to A, held in `phase`; `release()` lets it go on */
async function visitA(page: Page, phase: Phase) {
  if (phase === 'before the answer') {
    let open!: () => void
    const gate = new Promise<void>((resolve) => (open = resolve))
    page.on('close', () => open())
    await page.route('**/_fondu/pages/vt/a.json*', async (route) => {
      if (route.request().headers()['x-fondu']) await gate
      await route.continue().catch(() => {})
    })
    await press(page, '#to-a')
    await expect(page.locator('#state')).toHaveText('loading')
    return { release: async () => open() }
  }
  if (phase === 'preparing') {
    await page.evaluate(() => ((window as unknown as W).__vt.hold = true))
    await press(page, '#to-a')
    await phaseIs(page, 'held')
    return {
      release: () =>
        page.evaluate(() => {
          const vt = (window as unknown as W).__vt
          vt.hold = false
          vt.release?.()
        }),
    }
  }
  await page.evaluate(() => (document.documentElement.dataset.vtSlow = ''))
  await press(page, '#to-a')
  await phaseIs(page, 'animating')
  return {
    release: () =>
      page.evaluate(() => {
        delete document.documentElement.dataset.vtSlow
        ;(window as unknown as W).__vt.current?.skipTransition()
      }),
  }
}

test.describe('a newer navigation while a transition is pending', () => {
  for (const phase of PHASES)
    for (const second of ['a link', 'Back'] as const)
      test(`${second} while ${phase}: the newer one wins, nothing is left pending`, async ({
        page,
      }) => {
        const n = await start(page)
        if (phase !== 'before the answer')
          test.skip(!(await hasApi(page)), 'no document.startViewTransition in this browser')
        const first = await visitA(page, phase)
        // the hold is real: O is the page in the DOM (A's is not, until the update runs), A's URL is in the bar
        if (phase === 'preparing') await shows(page, 'o')
        expect(await address(page)).toBe(phase === 'before the answer' ? '/vt/o' : '/vt/a')
        // A was pushed, unless its answer has not come
        const pushed = phase === 'before the answer' ? 0 : 1
        if (second === 'a link') await press(page, '#to-b')
        else await page.goBack()
        await first.release()
        await quiet(page)
        if (second === 'a link') {
          await shows(page, 'b')
          expect(await address(page)).toBe('/vt/b')
          expect(await entries(page)).toBe(n + pushed + 1)
          await expect.poll(() => scrolled(page)).toBe(0)
        } else if (phase === 'before the answer') {
          // Back before A was pushed: the entry before O's
          await shows(page, 'p')
          expect(await address(page)).toBe('/vt/p')
          expect(await entries(page)).toBe(n)
          await expect.poll(() => scrolled(page)).toBe(200)
        } else {
          await shows(page, 'o')
          expect(await address(page)).toBe('/vt/o')
          expect(await entries(page)).toBe(n + 1)
          await expect.poll(() => scrolled(page)).toBe(500)
        }
        expect(await page.evaluate(() => (window as unknown as W).__vt.rejections)).toEqual([])
        await expect(page.locator('#state')).toHaveText('idle')
        await expect(page.locator('[aria-busy]')).toHaveCount(0)
        await expect(page.locator('#page')).toHaveCount(1)
        // the page that was pending (A's) did not show over the address
        await frames(page)
        await expect(page.locator('#url')).toHaveText(await address(page))
      })

  test('a link while the update is pending: the older page is never committed', async ({
    page,
  }) => {
    await start(page)
    test.skip(!(await hasApi(page)), 'no document.startViewTransition in this browser')
    await page.evaluate(() => {
      ;(window as unknown as W).__vt.hold = true
      new MutationObserver(() => {
        const name = document.querySelector('#page')?.getAttribute('data-name')
        if (name) ((window as unknown as { __names: string[] }).__names ??= []).push(name)
      }).observe(document.body, { subtree: true, childList: true, attributes: true })
    })
    await press(page, '#to-a')
    await phaseIs(page, 'held')
    await press(page, '#to-b')
    await page.evaluate(() => {
      const vt = (window as unknown as W).__vt
      vt.hold = false
      vt.release?.()
    })
    await shows(page, 'b')
    await quiet(page)
    const names = await page.evaluate(() => (window as unknown as { __names?: string[] }).__names)
    expect(new Set(names)).not.toContain('a')
  })
})

test.describe('what the old page asks for while the new page waits for its transition', () => {
  for (const kind of ['a deferred answer in flight', 'reload({ only }) clicked']) {
    test(`${kind}: the new page still commits`, async ({ page }) => {
      await install(page)
      let open!: () => void
      const gate = new Promise<void>((resolve) => (open = resolve))
      page.on('close', () => open())
      if (kind === 'a deferred answer in flight')
        await page.route('**/_fondu/pages/deferred.json*', async (route) => {
          if (route.request().headers()['x-fondu-only']) await gate
          await route.continue().catch(() => {})
        })
      await page.goto('/deferred')
      await hydrated(page)
      test.skip(!(await hasApi(page)), 'no document.startViewTransition in this browser')
      await page.evaluate(() => {
        const a = document.createElement('a')
        a.id = 'to-vt'
        a.href = '/vt/a'
        a.textContent = 'A'
        document.body.append(a)
        ;(window as unknown as W).__vt.hold = true
      })
      await press(page, '#to-vt')
      await phaseIs(page, 'held')
      if (kind === 'reload({ only }) clicked') await press(page, '#only')
      await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 700))) // the answer's time
      open()
      await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 100)))
      await page.evaluate(() => {
        const vt = (window as unknown as W).__vt
        vt.hold = false
        vt.release?.()
      })
      await shows(page, 'a')
      await quiet(page)
      expect(await address(page)).toBe('/vt/a')
      await expect(page.locator('#stats')).toHaveCount(0)
      await expect(page.locator('#state')).toHaveText('idle')
    })
  }
})

test.describe('the scroll is at its target when the update returns', () => {
  test('the top, a restored position, a #fragment', async ({ page }) => {
    await start(page)
    test.skip(!(await hasApi(page)), 'no document.startViewTransition in this browser')
    // the top
    await press(page, '#to-a')
    await shows(page, 'a')
    await quiet(page)
    let all = await log(page)
    expect(all.at(-1)!.scrollAfterUpdate).toEqual([0, 0])
    // a restored position: Back to O
    await page.goBack()
    await shows(page, 'o')
    await quiet(page)
    all = await log(page)
    expect(all.at(-1)!.scrollAfterUpdate).toEqual([0, 500])
    // a #fragment: the target, which is in the DOM only once the commit has run
    await press(page, '#to-b-target')
    await shows(page, 'b')
    await quiet(page)
    all = await log(page)
    const target = await page.evaluate(() =>
      Math.round(document.getElementById('target')!.getBoundingClientRect().top + scrollY),
    )
    expect(all.at(-1)!.scrollAfterUpdate).toEqual([0, target])
    expect(await scrolled(page)).toBe(target)
  })

  test('announced once, with the transition', async ({ page }) => {
    await start(page)
    test.skip(!(await hasApi(page)), 'no document.startViewTransition in this browser')
    const before = (await announced(page)).length
    await press(page, '#to-a')
    await shows(page, 'a')
    await quiet(page)
    expect((await announced(page)).slice(before)).toEqual(['VT a'])
  })
})

test.describe('no transition', () => {
  test('a shallow navigation and reload() start none', async ({ page }) => {
    await start(page)
    test.skip(!(await hasApi(page)), 'no document.startViewTransition in this browser')
    const before = (await log(page)).length
    await press(page, '#shallow')
    await expect.poll(() => address(page)).toBe('/vt/o?shallow=1')
    await press(page, '#again')
    await expect(page.locator('#state')).toHaveText('idle')
    await frames(page)
    expect((await log(page)).length).toBe(before)
    await shows(page, 'o')
  })
})

test.describe('the types of the transitions', () => {
  const types = async (page: Page) => (await log(page)).map((e) => e.types)

  test('a push is forward, Back is back, Forward is forward, a replace is replace', async ({
    page,
  }) => {
    await start(page)
    test.skip(!(await hasApi(page)), 'no document.startViewTransition in this browser')
    const before = (await log(page)).length
    await press(page, '#to-a')
    await shows(page, 'a')
    await quiet(page)
    await page.goBack()
    await shows(page, 'o')
    await quiet(page)
    await page.goForward()
    await shows(page, 'a')
    await quiet(page)
    await press(page, '#to-a') // the page's own URL: a replace
    await expect.poll(async () => (await log(page)).length).toBe(before + 4)
    await quiet(page)
    expect((await types(page)).slice(before)).toEqual([
      ['navigation-forward'],
      ['navigation-back'],
      ['navigation-forward'],
      ['navigation-replace'],
    ])
  })

  test('the type matches :active-view-transition-type() where the browser has it', async ({
    page,
  }) => {
    await start(page)
    test.skip(!(await hasApi(page)), 'no document.startViewTransition in this browser')
    const typed = await page.evaluate(() =>
      CSS.supports('selector(:active-view-transition-type(a))'),
    )
    const before = (await log(page)).length
    await press(page, '#to-a')
    await shows(page, 'a')
    await quiet(page)
    await page.goBack()
    await shows(page, 'o')
    await quiet(page)
    const entries = (await log(page)).slice(before)
    expect(entries.map((e) => e.matched)).toEqual(
      typed ? [['navigation-forward'], ['navigation-back']] : [[], []],
    )
  })

  test('Back to a kept page: one transition, and its refresh from the server starts none', async ({
    page,
  }) => {
    await start(page)
    test.skip(!(await hasApi(page)), 'no document.startViewTransition in this browser')
    await press(page, '#to-a')
    await shows(page, 'a')
    await quiet(page)
    const before = (await log(page)).length
    const answered = page.waitForResponse(
      (r) => r.url().includes('/_fondu/pages/vt/o.json') && !!r.request().headers()['x-fondu'],
    )
    await page.goBack()
    await shows(page, 'o')
    await answered
    await expect(page.locator('#state')).toHaveText('idle')
    await frames(page)
    await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 300)))
    await quiet(page)
    expect((await types(page)).slice(before)).toEqual([['navigation-back']])
  })

  test('Back to a kept page whose answer is a fresh page: still one transition', async ({
    page,
  }) => {
    await start(page)
    test.skip(!(await hasApi(page)), 'no document.startViewTransition in this browser')
    await press(page, '#to-a')
    await shows(page, 'a')
    await quiet(page)
    const before = (await log(page)).length
    // the server answers for another URL (a redirect): not the kept page's refresh, a page of its own
    await page.route('**/_fondu/pages/vt/o.json*', async (route) => {
      const response = await route.fetch()
      const body = (await response.json()) as { url: string }
      body.url = '/vt/o?other=1'
      await route.fulfill({ response, json: body })
    })
    await page.goBack()
    await shows(page, 'o')
    await expect.poll(() => address(page)).toBe('/vt/o?other=1')
    await expect(page.locator('#state')).toHaveText('idle')
    await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 300)))
    await quiet(page)
    expect((await types(page)).slice(before)).toEqual([['navigation-back']])
  })

  test('a swipe back (hasUAVisualTransition): shown at once, with no transition of ours', async ({
    page,
  }) => {
    await start(page)
    test.skip(!(await hasApi(page)), 'no document.startViewTransition in this browser')
    await press(page, '#to-a')
    await shows(page, 'a')
    await quiet(page)
    const before = (await log(page)).length
    const notices = (await announced(page)).length
    await page.evaluate(() => ((window as unknown as W).__vt.swipe = true))
    await page.goBack()
    await shows(page, 'o')
    expect((await log(page)).length).toBe(before)
    await expect.poll(() => scrolled(page)).toBe(500)
    expect((await announced(page)).length).toBe(notices + 1)
    await expect(page.locator('#state')).toHaveText('idle')
  })
})

test.describe('without document.startViewTransition', () => {
  test('the navigations are as they were: the pages, the scroll, the history', async ({ page }) => {
    const n = await start(page, { api: false })
    expect(await hasApi(page)).toBe(false)
    const original = await page.evaluateHandle(() => document)
    await press(page, '#to-a')
    await shows(page, 'a')
    // A broken fallback can still show A by loading a new document: that is not a client navigation.
    expect(await original.evaluate((before) => before === document)).toBe(true)
    await expect.poll(() => scrolled(page)).toBe(0)
    await page.goBack()
    await shows(page, 'o')
    await expect.poll(() => scrolled(page)).toBe(500)
    await page.goForward()
    await shows(page, 'a')
    expect(await entries(page)).toBe(n + 1)
    expect(await log(page)).toEqual([])
    await expect(page.locator('#state')).toHaveText('idle')
  })
})
