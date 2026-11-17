import { expect, test, type Page } from '@playwright/test'

import {
  address,
  frames,
  hasApi,
  hydrated,
  install,
  log,
  press,
  quiet,
  shows,
} from './support/view-transitions.ts'

// A navigation chooses its own view transition (app/routes/vt/): `data-transition` on a link or a form,
// `navigate(href, { transition })`; `fondu({ viewTransitions: true })` is only the default. Each case runs against the
// build with the default off (what an app gets from the plugin without the option), and the ones about the opt-out
// against the build with it on (`FONDU_VIEW_TRANSITIONS=1`); the cases of the other build skip. JavaScript only
const ON = process.env.FONDU_VIEW_TRANSITIONS === '1'
const off = () => test.skip(ON, 'the default is on in this build')
const on = () => test.skip(!ON, 'the default is off in this build')

const types = async (page: Page) => (await log(page)).map((e) => e.types)
const matched = async (page: Page) => (await log(page)).map((e) => e.matched)
/** the record of the entry on the screen (`history.state`): the custom types of the transition that reached it */
const record = (page: Page) => page.evaluate(() => history.state.__fondu_transition as unknown)
const typedSupport = (page: Page) =>
  page.evaluate(() => CSS.supports('selector(:active-view-transition-type(a))'))
/** a page with the browser's API, at /vt/p, hydrated */
async function open(page: Page, path = '/vt/p') {
  await install(page)
  await page.goto(path)
  await hydrated(page)
  test.skip(!(await hasApi(page)), 'no document.startViewTransition in this browser')
}
/** the navigation that `go` starts has put its page on the screen and its transition (if any) is over */
async function visit(page: Page, name: string, go: () => Promise<unknown>) {
  await go()
  await shows(page, name)
  await expect(page.locator('#state')).toHaveText('idle')
  await frames(page)
  await quiet(page)
}
const from = (page: Page, selector: string) => () => press(page, selector)

test.describe('opting in', () => {
  test('a link with data-transition transitions, forward; its entry remembers it', async ({
    page,
  }) => {
    await open(page)
    await visit(page, 'a', from(page, '#to-a-vt'))
    expect(await types(page)).toEqual([['navigation-forward']])
    expect(await record(page)).toEqual([])
    expect(await address(page)).toBe('/vt/a')
  })

  test('a plain link does not, when the default is off', async ({ page }) => {
    off()
    await open(page)
    await visit(page, 'o', from(page, '#to-o'))
    expect(await log(page)).toEqual([])
    expect(await record(page)).toBeUndefined()
    // and the page scrolled to the top, as any navigation's
    expect(await address(page)).toBe('/vt/o')
  })

  test('custom types are the direction type and the link’s own, and :active-view-transition-type() matches them', async ({
    page,
  }) => {
    await open(page)
    await visit(page, 'a', from(page, '#to-a-zoom'))
    expect(await types(page)).toEqual([['navigation-forward', 'zoom', 'fade']])
    expect(await record(page)).toEqual(['zoom', 'fade'])
    // where the browser has typed transitions the selector matches them while the new page is put on the screen
    expect(await matched(page)).toEqual(
      (await typedSupport(page)) ? [['navigation-forward', 'zoom', 'fade']] : [[]],
    )
  })

  test('a form with data-transition transitions', async ({ page }) => {
    await open(page)
    await visit(page, 'b', from(page, '#form-vt button'))
    expect(await types(page)).toEqual([['navigation-forward', 'zoom']])
    expect(await record(page)).toEqual(['zoom'])
    expect(await address(page)).toBe('/vt/b')
  })

  test('a plain form does not, when the default is off', async ({ page }) => {
    off()
    await open(page)
    await visit(page, 'b', from(page, '#form button'))
    expect(await log(page)).toEqual([])
  })

  for (const [name, selector, expected] of [
    ['true', '#nav-vt', ['navigation-forward']],
    ['[zoom]', '#nav-zoom', ['navigation-forward', 'zoom']],
  ] as const)
    test(`navigate() with transition: ${name}`, async ({ page }) => {
      await open(page)
      await visit(page, 'a', from(page, selector))
      expect(await types(page)).toEqual([expected])
      expect(await record(page)).toEqual(expected.slice(1))
    })

  test('a replace transitions with replace and its types, and remembers them', async ({ page }) => {
    off()
    await open(page)
    await visit(page, 'o', from(page, '#to-o'))
    await visit(page, 'b', from(page, '#replace-zoom'))
    expect(await types(page)).toEqual([['navigation-replace', 'zoom']])
    expect(await record(page)).toEqual(['zoom'])
    // Back from the replaced entry: its record
    await visit(page, 'p', () => page.goBack())
    expect(await types(page)).toEqual([
      ['navigation-replace', 'zoom'],
      ['navigation-back', 'zoom'],
    ])
  })

  test('without document.startViewTransition: the navigation is as any, and remembers nothing', async ({
    page,
  }) => {
    await install(page, { api: false })
    await page.goto('/vt/p')
    await hydrated(page)
    await press(page, '#to-a-zoom')
    await shows(page, 'a')
    await expect(page.locator('#state')).toHaveText('idle')
    expect(await log(page)).toEqual([])
    expect(await record(page)).toBeUndefined()
    await page.goBack()
    await shows(page, 'p')
    expect(await log(page)).toEqual([])
  })
})

test.describe('Back and Forward remember', () => {
  test('Back from a page reached with a transition animates with its types; Forward again too', async ({
    page,
  }) => {
    off()
    await open(page)
    await visit(page, 'a', from(page, '#to-a-zoom'))
    await visit(page, 'p', () => page.goBack())
    await visit(page, 'a', () => page.goForward())
    expect(await types(page)).toEqual([
      ['navigation-forward', 'zoom', 'fade'],
      ['navigation-back', 'zoom', 'fade'],
      ['navigation-forward', 'zoom', 'fade'],
    ])
    expect(await matched(page)).toEqual(
      (await typedSupport(page))
        ? [
            ['navigation-forward', 'zoom', 'fade'],
            ['navigation-back', 'zoom', 'fade'],
            ['navigation-forward', 'zoom', 'fade'],
          ]
        : [[], [], []],
    )
  })

  test('Back from a page reached without one does not animate, whichever way it is reached again', async ({
    page,
  }) => {
    off()
    await open(page)
    await visit(page, 'o', from(page, '#to-o'))
    await visit(page, 'p', () => page.goBack())
    await visit(page, 'o', () => page.goForward())
    expect(await log(page)).toEqual([])
  })

  test('only the entry a transition went to remembers: Back to it from the next does not animate', async ({
    page,
  }) => {
    off()
    await open(page)
    await visit(page, 'o', from(page, '#to-o')) // P → O: plain
    await visit(page, 'a', from(page, '#to-a-zoom')) // O → A: zoom, fade
    await visit(page, 'o', () => page.goBack()) // A's record
    await visit(page, 'p', () => page.goBack()) // O's: none
    await visit(page, 'o', () => page.goForward()) // O's: none
    await visit(page, 'a', () => page.goForward()) // A's record
    expect(await types(page)).toEqual([
      ['navigation-forward', 'zoom', 'fade'],
      ['navigation-back', 'zoom', 'fade'],
      ['navigation-forward', 'zoom', 'fade'],
    ])
  })

  test('several entries at once: the higher of the two has the record', async ({ page }) => {
    off()
    await open(page)
    await visit(page, 'o', from(page, '#to-o'))
    await visit(page, 'a', from(page, '#to-a-zoom'))
    // from A (zoom, fade) to P: A is the higher
    await visit(page, 'p', () => page.evaluate(() => history.go(-2)))
    // and from P to A
    await visit(page, 'a', () => page.evaluate(() => history.go(2)))
    expect(await types(page)).toEqual([
      ['navigation-forward', 'zoom', 'fade'],
      ['navigation-back', 'zoom', 'fade'],
      ['navigation-forward', 'zoom', 'fade'],
    ])
  })

  test('with the default on, Back and Forward animate with the direction, and with the types a navigation gave', async ({
    page,
  }) => {
    on()
    await open(page)
    await visit(page, 'o', from(page, '#to-o'))
    await visit(page, 'a', from(page, '#to-a-zoom'))
    await visit(page, 'o', () => page.goBack())
    await visit(page, 'p', () => page.goBack())
    expect(await types(page)).toEqual([
      ['navigation-forward'],
      ['navigation-forward', 'zoom', 'fade'],
      ['navigation-back', 'zoom', 'fade'],
      ['navigation-back'],
    ])
  })
})

test.describe('opting out, with the default on', () => {
  test('a link with data-transition="false" does not transition, and Back from it still does', async ({
    page,
  }) => {
    on()
    await open(page)
    await visit(page, 'a', from(page, '#to-a-no'))
    expect(await log(page)).toEqual([])
    expect(await record(page)).toBeUndefined()
    await visit(page, 'p', () => page.goBack())
    // the default: no record, so no types but the direction's
    expect(await types(page)).toEqual([['navigation-back']])
  })

  test('navigate() with transition: false does not transition', async ({ page }) => {
    on()
    await open(page)
    await visit(page, 'a', from(page, '#nav-no'))
    expect(await log(page)).toEqual([])
    expect(await address(page)).toBe('/vt/a')
  })

  test('a form with data-transition="false" does not transition', async ({ page }) => {
    on()
    await open(page)
    await visit(page, 'b', from(page, '#form-no button'))
    expect(await log(page)).toEqual([])
  })

  test('a link and a form without the attribute transition', async ({ page }) => {
    on()
    await open(page)
    await visit(page, 'o', from(page, '#to-o'))
    await visit(page, 'b', from(page, '#form button'))
    expect(await types(page)).toEqual([['navigation-forward'], ['navigation-forward']])
  })
})

test.describe('shallow navigations never transition', () => {
  for (const [name, selector] of [
    ['a data-shallow link with data-transition', '#shallow-link'],
    ['navigate() with shallow: true and a transition', '#shallow-zoom'],
  ])
    test(name, async ({ page }) => {
      await open(page)
      await press(page, selector)
      await expect.poll(() => address(page)).toBe('/vt/p?shallow=1')
      await frames(page)
      expect(await log(page)).toEqual([])
      expect(await record(page)).toBeUndefined()
      await shows(page, 'p')
      // and Back from it, between the entries of the one page
      await page.goBack()
      await expect.poll(() => address(page)).toBe('/vt/p')
      await frames(page)
      expect(await log(page)).toEqual([])
    })
})
