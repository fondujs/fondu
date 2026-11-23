import { crlf } from '../form.js'
import { pageDataPath, SCROLL_KEY, SCROLL_STORAGE } from '../paths.js'
import { canTransition, instantly, optIn, skipActive, transition } from './transitions.js'

/** What the server sends for a page: its id, props, URL and the build's version. */
export interface PageObject {
  component: string
  props: Record<string, unknown>
  url: string
  version: string | null
  flash: Record<string, unknown>
  /** The props left out, to come with a request of their own (`defer()`). */
  deferred?: string[]
}

interface Options {
  initial: PageObject
  /**
   * Loads the page's modules and gives what puts it on the screen. The page is built when that has run, not before: what the
   * page on the screen asked for in between is in it. Nothing once `stale()`.
   */
  show: (
    page: PageObject,
    fresh: boolean,
    stale: () => boolean,
  ) => Promise<(() => void) | undefined>
  prerender: boolean
  viewTransitions: boolean
  pending: (
    navigation: {
      to: string
      form: HTMLFormElement | null
      post: boolean
      failed?: boolean
    } | null,
  ) => void
  preload: (pathname: string) => void
  isPage: (pathname: string) => boolean
  hydrated: boolean
}

interface Visit {
  history: 'push' | 'replace' | 'none'
  body?: FormData | URLSearchParams | string
  form?: HTMLFormElement
  /** following a POST's redirect to a #fragment: a GET, but still the form's answer for the shared page */
  formAnswer?: boolean
  scroll?: { x: number; y: number } | null
  keep?: boolean
  kept?: PageObject
  /** The navigation's own choice of a view transition, over the default: `false`, opted out; else these custom types. */
  transition?: false | string[]
  traversal?: string[]
  swipe?: boolean
}

let visit: ((url: string, options: Visit) => void) | undefined
let shallowTo: ((url: URL, replace: boolean) => void) | undefined
let shownUrl: (() => URL) | undefined
let ask: ((names: string[]) => void) | undefined
let isAppPage: ((pathname: string) => boolean) | undefined

// After Void's client (MIT). Scroll positions are Fondu's own, per history entry: the browsers' differ. What isn't for it
// (another site, a new tab, a download, a modified click) is the browser's.
export function startNavigation({
  initial,
  show,
  prerender,
  viewTransitions,
  pending,
  preload,
  isPage,
  hydrated,
}: Options) {
  const scroll = scrollPositions()
  let version = initial.version
  let current: AbortController | undefined
  // in memory only (gone on reload), the last 50; all forgotten once a form is sent (what it changed, a signed-out user's
  // pages)
  const kept = new Map<string, PageObject>()
  const keep = (page: PageObject) => {
    const key = scroll.key()
    if (!key) return
    kept.delete(key)
    // Across pathnames shared props aren't this URL's own page. Once the group is left, load its route rather than briefly
    // restoring the list or dialog from the cache.
    if (new URL(page.url, location.href).pathname !== new URL(answered, location.href).pathname)
      return
    kept.set(key, { ...page, flash: {} })
    if (kept.size > 50) kept.delete(kept.keys().next().value!)
  }

  let on = initial
  let shows = 0
  // The history entries (their keys) that show the page on the screen at URLs of their own: Back and Forward between them
  // ask for nothing. A form's answer for this component at this pathname updates their shared page too; any other page
  // put on the screen is its entry's alone, and the others are normal entries again
  let group = new Set<string>()
  // the URL the page's props are the loader's answer for: `on.url` changes with a shallow navigation, this does not
  let answered = initial.url
  const asking = new Set<AbortController>()
  // each prop's newest answer: an older request answering after it is dropped for that prop, as an answer for a page no
  // longer there is
  let requests = 0
  let answers = new Map<string, number>()
  const showNow = async (page: PageObject, fresh: boolean, stale: () => boolean) =>
    (await show(page, fresh, stale))?.()
  // With `types` (a view transition) all of it is the transition's `update`, which runs when the browser has captured the old
  // page; a visit superseded by then commits nothing (`update` runs on a skip too)
  const put = async (
    page: PageObject,
    fresh: boolean,
    stale: () => boolean,
    tail: () => void,
    types?: string[],
    shared = false,
  ) => {
    const commit = await show(page, fresh, stale)
    if (!commit) return
    const update = () => {
      commit()
      on = page
      shows++
      if (!shared) group = new Set()
      group.add(scroll.key()!)
      answered = page.url
      for (const quiet of asking) quiet.abort()
      answers = new Map()
      tail()
    }
    if (types)
      await transition((skip) => {
        if (stale()) return skip()
        instantly(update)
      }, types)
    else update()
  }
  shownUrl = () => new URL(on.url, location.href)
  const headers = () => ({ 'X-Fondu': 'true', ...(version && { 'X-Fondu-Version': version }) })
  const source = (url: URL) =>
    prerender ? pageDataPath(url.pathname) + url.search : url.pathname + url.search

  // An early answer for a link's page (`prerender`): its file, or null (no file: its data is asked for at the click, when its
  // loader should run). A file runs nothing, so asking early costs the app nothing. Asked once in 30 seconds (TanStack
  // Router's default: a deploy in between is found at the click); its version is checked as for any page object.
  const freshFor = 30_000
  const prefetched = new Map<
    string,
    { answer: Promise<{ body: string; headers: Headers } | null>; at: number }
  >()
  const prefetch = (url: URL) => {
    if (!prerender) return
    const key = source(url)
    const entry = prefetched.get(key)
    if (entry && Date.now() - entry.at < freshFor) return
    const answer = (async () => {
      try {
        const response = await fetch(key, {
          headers: { ...headers(), 'X-Fondu-Prefetch': 'true' },
          priority: 'low',
        })
        if (response.status === 200 && response.headers.has('X-Fondu'))
          return { body: await response.text(), headers: response.headers }
      } catch {
        prefetched.delete(key)
      }
      return null
    })()
    prefetched.delete(key)
    prefetched.set(key, { answer, at: Date.now() })
    if (prefetched.size > 20) prefetched.delete(prefetched.keys().next().value!)
  }

  // Quiet: no navigation state, no history entry, no scroll. Aborted when another page is put on the screen; an answer for a
  // page no longer there is dropped, and what isn't the page's answer is a failure, never a navigation.
  ask = async (names) => {
    const at = shows
    const page = on
    const id = ++requests
    const controller = new AbortController()
    asking.add(controller)
    // a prop asked for that is neither here nor coming (it failed): pending again, `<Deferred>` shows its fallback
    const absent = names.filter((n) => !Object.hasOwn(page.props, n) && !page.deferred?.includes(n))
    if (absent.length)
      void showNow(
        (on = { ...page, deferred: [...(page.deferred ?? []), ...absent] }),
        false,
        () => shows !== at,
      )
    let got: Record<string, unknown> | undefined
    try {
      const response = await fetch(source(new URL(page.url, location.href)), {
        headers: {
          ...headers(),
          'X-Fondu-Only': names.join(','),
          'X-Fondu-Component': page.component,
        },
        signal: controller.signal,
      })
      const answer =
        response.ok && response.headers.has('X-Fondu')
          ? ((await response.json()) as PageObject)
          : null
      if (answer?.component === page.component) got = answer.props
    } catch {} // offline, aborted
    asking.delete(controller)
    if (controller.signal.aborted || shows !== at) return
    // asked at the URL of a shallow entry, which the page has left since: not its answer
    if (page.url !== answered && page.url !== on.url) return
    const take = names.filter((n) => got && Object.hasOwn(got, n) && id > (answers.get(n) ?? 0))
    for (const n of take) answers.set(n, id)
    const next: PageObject = {
      ...on,
      props: { ...on.props, ...Object.fromEntries(take.map((n) => [n, got![n]])) },
      deferred: on.deferred?.filter((n) => !names.includes(n)),
    }
    on = next // before the module is awaited: another answer merges into this one
    // asked at the URL of a shallow entry, not at the one the page was loaded at: an answer of its own, and this
    // entry's alone (those asked before the shallow navigation are the loader's answer still)
    if (got && page.url !== answered) {
      group = new Set([scroll.key()!])
      answered = page.url
    }
    // not once another answer has merged into the page since: its own show() has these props too
    const stale = () => shows !== at || on !== next
    await showNow(next, false, stale)
    if (!stale()) keep(next)
  }
  const documentLoad = (url: string, replace: boolean) => {
    // http(s) only: a header's URL never runs as `javascript:` (an app's redirect to a URL it was given)
    if (!isWebUrl(url)) return console.error(`fondu: not loading ${url}: not an http(s) URL`)
    if (replace) location.replace(url)
    else location.assign(url)
  }

  isAppPage = isPage
  visit = (href, options) => {
    current?.abort()
    const controller = (current = new AbortController())
    const { signal } = controller
    const url = new URL(href, location.href)
    if (url.origin !== location.origin) return documentLoad(url.href, options.history !== 'push')
    const post = options.body !== undefined
    if (options.history !== 'none') scroll.save()
    const form = options.form ?? null
    // a kept page is on the screen at once: the server's comes quietly, no pending state (the navigation it
    // interrupted, aborted, ends here)
    const shown = options.kept
    // aria-busy: for its submit buttons' pending state (CSS, or useNavigation()), and for assistive technology
    form?.setAttribute('aria-busy', 'true')
    const to = url.pathname + url.search + url.hash
    pending(shown ? null : { to, form, post })
    let failed = false
    const done = () => {
      form?.removeAttribute('aria-busy')
      if (!shown && current === controller)
        pending(failed ? { to, form, post, failed: true } : null)
    }
    if (!post) preload(url.pathname)
    const from = !post && prerender ? source(url) : url.pathname + url.search
    const found = !post && !options.keep && !shown ? prefetched.get(from) : undefined
    const entry = found && Date.now() - found.at < freshFor ? found : undefined
    // The visit's one view transition, for the first commit that restores the scroll (a kept page's refresh after it is
    // plain). Not for a swipe, which the browser animates, nor without `document.startViewTransition`.
    const custom = options.transition || []
    let transitions = !!(options.transition ?? viewTransitions) && !options.swipe && canTransition()
    void (async () => {
      try {
        if (shown) {
          scroll.commit()
          const types = transitions ? [...(options.traversal ?? []), ...custom] : undefined
          transitions = false
          await put(
            shown,
            true,
            () => signal.aborted,
            () => {
              announce()
              restore(options.scroll, url.hash)
            },
            types,
          )
          if (signal.aborted) return
        }
        const early = entry ? await entry.answer : null
        if (signal.aborted) return
        const response = early
          ? new Response(early.body, { headers: early.headers })
          : await fetch(from, {
              method: post ? 'POST' : 'GET',
              body: options.body,
              headers: headers(),
              signal,
            })
        if (signal.aborted) return
        if (post) kept.clear()
        const to = response.headers.get('X-Fondu-Location')
        if (response.status === 409 && to) return documentLoad(to, options.history !== 'push')
        // a redirect to a #fragment, followed here: fetch() would lose it
        const redirect = response.headers.get('X-Fondu-Redirect')
        if (redirect) {
          if (isWebUrl(redirect))
            visit!(redirect, {
              history: options.history === 'push' ? 'push' : 'replace',
              transition: options.transition,
              formAnswer: post || options.formAnswer,
            })
          return
        }
        if (!response.headers.has('X-Fondu')) {
          if (!post || response.redirected) {
            void response.body?.cancel()
            return documentLoad(post ? response.url : url.href, options.history !== 'push')
          }
          const disposition = response.headers.get('Content-Disposition') ?? ''
          if (/^\s*attachment/i.test(disposition)) {
            const link = document.createElement('a') // with `download`: let through by the click listener
            link.href = URL.createObjectURL(await response.blob())
            link.download = fileName(disposition)
            link.click()
            setTimeout(() => URL.revokeObjectURL(link.href), 60_000) // once the download has it
            return
          }
          const html = /^\s*text\/html\b/i.test(response.headers.get('Content-Type') ?? '')
          const text = await response.text()
          document.open() // the page's listeners gone with it, popstate's too
          // anything else as text, never as HTML (an action's `c.text()` with what a user typed)
          document.write(html ? text : '<!doctype html><meta charset="utf-8"><pre></pre>')
          document.close()
          if (!html) document.querySelector('pre')!.textContent = text
          // Back and Forward stay in this document (the entries before it are its own): their URL as a document
          addEventListener('popstate', () => location.reload())
          return
        }
        const page = (await response.json()) as PageObject
        if (signal.aborted) return
        // A prerendered page's file is made without a query. Its answer, not redirected, is for the URL asked: the
        // visitor's query stays (as at a document load); a redirect, which the server made, is its target's
        if (!response.redirected && page.url === url.pathname) page.url += url.search
        if (version && page.version && page.version !== version)
          return documentLoad(page.url, options.history !== 'push')
        version = page.version
        // the answer to a form at the URL it was sent from: in place, scroll kept; back with errors, what was typed stays too
        const here = location.pathname + location.search
        const same = post && page.url === here
        const shared =
          (post || options.formAnswer) &&
          page.component === on.component &&
          new URL(page.url, location.href).pathname === new URL(on.url, location.href).pathname
        const errors = Object.keys((page.props.errors as object | undefined) ?? {}).length > 0
        const asked = url.pathname + url.search
        // asked for the entry on the screen, which a shallow navigation has since left for another URL: not its answer
        if (options.history === 'none' && location.pathname + location.search !== asked) return
        // the kept page's entry: the server's page in its place, its state kept; redirected (signed out), anew
        // kept: the same component answers (another one mounts anew, and is scrolled to the top as a navigation's)
        const stay = options.keep && page.component === on.component
        const fresh = shown ? asked !== page.url : !stay && !(same && errors)
        // the page stays (reload(), Back's, a form's answer): what it asked for isn't taken away while it is asked again
        if (!fresh && page.deferred)
          for (const name of page.deferred)
            if (Object.hasOwn(on.props, name)) page.props[name] ??= on.props[name]
        // its URL first, as the browser's own navigations: a page's render reads it (`location`, a URL's language);
        // a redirect's, the fragment asked for if it is still this page's; a form's answer to the page it was sent
        // from: its #fragment stays, a dialog the fragment opened with it
        const target = page.url + (same ? location.hash : asked === page.url ? url.hash : '')
        const history =
          options.history === 'push' && same
            ? 'replace'
            : options.history === 'none' && asked !== page.url
              ? 'replace'
              : options.history
        const types =
          transitions && (!stay || options.transition) && !same && !(shown && !fresh)
            ? [
                ...(history === 'push'
                  ? ['navigation-forward']
                  : history === 'replace'
                    ? ['navigation-replace']
                    : (options.traversal ?? [])),
                ...custom,
              ]
            : undefined
        if (history !== 'none') scroll.write(target, history === 'replace', false, types && custom)
        scroll.commit()
        await put(
          page,
          fresh,
          () => signal.aborted,
          () => {
            keep(page)
            if (page.deferred?.length) ask!(page.deferred)
            if (shown && !fresh) return
            if (!stay) announce()
            if (stay || same) return
            // the page is in the DOM at once (show() renders it synchronously): no frame drawn where it doesn't belong
            restore(options.history === 'none' ? options.scroll : null, url.hash)
          },
          types,
          shared,
        )
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        if (shown) {
          // offline, Back: the kept page stays; what it was still waiting for is asked now, to fail rather than wait
          if (on.deferred?.length) ask!(on.deferred)
          return
        }
        if (post) {
          failed = true
          return
        }
        documentLoad(url.href, options.history !== 'push')
      } finally {
        done()
      }
    })()
  }

  shallowTo = (url, replace) => {
    // A visit whose URL is in the history already, its page not on the screen yet (its modules load): no URL of the
    // page on the screen to change. A normal navigation, which supersedes that visit as any does
    if (location.pathname + location.search !== on.url) return navigate(url.href, { replace })
    current?.abort()
    const was = location.href
    scroll.save()
    const before = scroll.key()!
    replace ||= url.href === location.href
    scroll.write(url.href, replace, true)
    scroll.commit()
    scroll.save()
    if (replace) group.delete(before)
    group.add(scroll.key()!)
    settle(true)
    // the browser fires no `hashchange` for pushState
    if (new URL(was).hash !== url.hash)
      dispatchEvent(new HashChangeEvent('hashchange', { oldURL: was, newURL: url.href }))
  }
  // Flash is shown once; a shallow navigation also drops the errors, which belonged to the answer before it
  const settle = (fresh: boolean) => {
    const at = shows
    on = {
      ...on,
      url: location.pathname + location.search,
      flash: {},
      ...(fresh && { props: { ...on.props, errors: {} } }),
    }
    void showNow(on, false, () => shows !== at)
    keep(on)
  }

  const elsewhere = (own: string) => {
    const into = own || document.querySelector<HTMLBaseElement>('base[target]')?.target
    return !!into && into !== '_self'
  }

  const linkOf = (
    target: EventTarget | null,
  ): { url: URL; soft: boolean; transition: false | string[] | undefined } | undefined => {
    const link = (target as Element | null)?.closest?.('a[href]')
    if (!(link instanceof HTMLAnchorElement)) return
    // SVG `<a>` and `<area>` are not matched: the browser's
    if (elsewhere(link.target) || link.hasAttribute('download')) return
    const url = new URL(link.href)
    if (url.origin !== location.origin || !isWebUrl(url.href)) return
    return {
      url,
      soft: link.hasAttribute('data-shallow') && isPage(url.pathname),
      transition: optIn(link.getAttribute('data-transition')),
    }
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = linkOf(event.target)
    if (!link) return
    const { url } = link
    if (link.soft) {
      event.preventDefault()
      return shallowTo!(url, false)
    }
    // a #fragment of this page: the browser scrolls to it (the position left saved for Back)
    if (url.pathname + url.search === location.pathname + location.search && url.hash) {
      scroll.save()
      return
    }
    if (!isPage(url.pathname)) return
    event.preventDefault()
    visit!(url.href, {
      history: url.href === location.href ? 'replace' : 'push',
      transition: link.transition,
    })
  })

  // Page modules load before the click (the pointer rests 80 ms, or a touch starts), a static page's data with them (its file:
  // nothing runs). Another page's data not: a loader runs for a visit, never for a page that may not be visited. Not for the
  // keyboard (tabbing passes many links), nor when the visitor asked to save data.
  if (!(navigator as { connection?: { saveData?: boolean } }).connection?.saveData) {
    const RESTING = 80
    let timer: ReturnType<typeof setTimeout> | undefined
    document.addEventListener('mouseover', (event) => {
      const link = linkOf(event.target)
      clearTimeout(timer)
      if (link && !link.soft && isPage(link.url.pathname))
        timer = setTimeout(() => {
          preload(link.url.pathname)
          void prefetch(link.url)
        }, RESTING)
    })
    document.addEventListener('mouseout', () => clearTimeout(timer))
    document.addEventListener(
      'touchstart',
      (event) => {
        const link = linkOf(event.target)
        if (!link || link.soft || !isPage(link.url.pathname)) return
        preload(link.url.pathname)
        void prefetch(link.url)
      },
      { passive: true },
    )
  }

  document.addEventListener('submit', (event) => {
    if (event.defaultPrevented) return
    const form = event.target
    if (!(form instanceof HTMLFormElement)) return
    const submitter = event.submitter as HTMLButtonElement | HTMLInputElement | null
    const attr = (name: string, own: string) =>
      submitter?.getAttribute(own) ?? form.getAttribute(name) ?? ''
    const method = attr('method', 'formmethod').toLowerCase() || 'get'
    if ((method !== 'get' && method !== 'post') || elsewhere(attr('target', 'formtarget'))) return
    const url = new URL(attr('action', 'formaction') || location.href, document.baseURI)
    if (url.origin !== location.origin || !isWebUrl(url.href)) return
    // a GET to a URL that is none of the app's pages (a `.ts` route): the browser's, as asking first would run its handler twice
    if (method === 'get' && !isPage(url.pathname)) return
    event.preventDefault()
    const transition = optIn(form.getAttribute('data-transition'))
    const data = new FormData(form, submitter)
    // as the browser would send them: a file by its name in a URL or plain text, line breaks as CRLF
    const fields = [...data].map(([k, v]) => [crlf(k), crlf(typeof v === 'string' ? v : v.name)])
    if (method === 'post') {
      const enctype = attr('enctype', 'formenctype').toLowerCase()
      const body =
        enctype === 'multipart/form-data'
          ? data
          : enctype === 'text/plain'
            ? fields.map(([k, v]) => `${k}=${v}\r\n`).join('')
            : new URLSearchParams(fields)
      return visit!(url.href, { history: 'push', body, form, transition })
    }
    url.search = new URLSearchParams(fields).toString()
    visit!(url.href, { history: 'push', form, transition })
  })

  window.addEventListener('popstate', (event) => {
    closing = false
    // a view transition on its way is over: this traversal is the newer navigation (its `update` commits nothing)
    skipActive()
    const { traversal, record } = scroll.direction(event.state)
    const popped = scroll.pop(event.state)
    // a visit on its way is given up by any Back or Forward, the browser's own #fragment entries too: its answer would put a
    // page on the screen over the entry the visitor is at
    current?.abort()
    pending(null)
    if (!popped.fragment && popped.key && group.has(popped.key)) {
      scroll.commit()
      return settle(false)
    }
    // A known entry of another group may have the same URL, but is not this page's native #fragment entry.
    if (popped.fragment && (!popped.key || group.has(popped.key))) {
      if (!popped.key) group.add(scroll.key()!)
      settle(false)
      // a #fragment that names no element (a dialog's `#settings/account`) leaves the page where it is, as the browser does
      if (!popped.position && location.hash && !fragmentTarget(location.hash.slice(1))) return
      return restore(popped.position, location.hash)
    }
    visit!(location.href, {
      history: 'none',
      scroll: popped.position,
      kept: kept.get(popped.key ?? ''),
      traversal,
      transition: record,
      // the browser's own animation (a swipe) plays already: ours would play twice
      swipe: (event as { hasUAVisualTransition?: boolean }).hasUAVisualTransition,
    })
  })
  // leaving the document: its position, put back by the document when it is loaded again. The browser's own restoration
  // stays off: engines restore at times of their own, or not (WebKit, an entry once manual; Firefox, a #fragment), and over
  // the page's own (Firefox, at load, a page rendered in the browser at 0)
  window.addEventListener('pagehide', scroll.save)
  window.addEventListener('hashchange', () => {
    if (scroll.commit()) group.add(scroll.key()!)
  })
  addEventListener('pageshow', () => (closing = false))

  // a page rendered on the server is where it belongs before its first paint (its document's script, or the browser at its
  // #fragment). One rendered here has its content only now: its entry's position, or its #fragment's target
  const position = scroll.start()
  group.add(scroll.key()!)
  if (!hydrated) {
    restore(position, location.hash, true)
    if (position) holdUntilLoaded(position)
  }
  keep(initial)
  // A prerendered page's file is made without a query, and so is the document it hydrates: once hydrated, its URL is the
  // browser's (a state the query holds works at a direct load; its loader never saw the query)
  if (location.pathname + location.search !== on.url) settle(false)
  if (initial.deferred?.length) ask(initial.deferred)
}

// What this client adds to `history.state` outlives a deploy: the build running when the browser comes back to an entry
// reads it. `__fondu_shallow`: the entry was pushed by a shallow navigation, from the entry below it, which showed the same
// page; `closeShallow()` goes back from such an entry, and replaces any other.
const SHALLOW = '__fondu_shallow'
const INDEX = '__fondu_index'
// the custom types of the view transition that reached the entry (none: an empty array); Back and Forward run it again
const TRANSITION = '__fondu_transition'
// `closeShallow()` has gone back and the browser has not landed yet: a second call waits
let closing = false

// In memory and in sessionStorage (a reload, a page of another site and back): the browser's restoration is off. Each
// belongs to the entry on the screen, even once the browser has started a traversal away from it. The last 50 are kept, their
// keys in the order used in `STORAGE` itself.
function scrollPositions() {
  const KEY = SCROLL_KEY
  const STORAGE = SCROLL_STORAGE
  const positions = new Map<string, { x: number; y: number }>()
  const forget = (key: string) => {
    positions.delete(key)
    try {
      sessionStorage.removeItem(STORAGE + key)
    } catch {}
  }
  const remember = (key: string, position: { x: number; y: number }) => {
    positions.delete(key)
    positions.set(key, position)
    for (const old of positions.keys()) if (positions.size > 50) forget(old)
  }
  const keyOf = (state: unknown) =>
    state &&
    typeof state === 'object' &&
    typeof (state as Record<string, unknown>)[KEY] === 'string'
      ? ((state as Record<string, string>)[KEY] as string)
      : null
  const newKey = () => Math.random().toString(36).slice(2, 10)
  // a number that only grows with each entry this client pushes: Back or Forward is the entry's against the one it left
  const indexOf = (state: unknown) => {
    const index = (state as Record<string, unknown> | null)?.[INDEX]
    return typeof index === 'number' ? index : undefined
  }
  const recordOf = (state: unknown) => {
    const types = (state as Record<string, unknown> | null)?.[TRANSITION]
    return Array.isArray(types) && types.every((t) => typeof t === 'string')
      ? (types as string[])
      : undefined
  }
  // the entry on the screen: its index, and its record. In memory, as `history.state` is the arrived entry's already
  // when a popstate fires: the entry left can't be read from it
  let at = indexOf(history.state)
  let recorded = recordOf(history.state)
  let rendered = keyOf(history.state)
  let renderedUrl = location.pathname + location.search
  const read = (key: string | null) => {
    if (!key) return null
    const kept = positions.get(key)
    if (kept) return kept
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE + key) ?? 'null') as {
        x: number
        y: number
      } | null
      return typeof saved?.x === 'number' && typeof saved.y === 'number' ? saved : null
    } catch {
      return null
    }
  }
  const save = () => {
    if (!rendered) return
    const position = { x: scrollX, y: scrollY }
    remember(rendered, position)
    try {
      sessionStorage.setItem(STORAGE + rendered, JSON.stringify(position))
      sessionStorage.setItem(STORAGE, JSON.stringify([...positions.keys()]))
    } catch {}
  }
  // the entry on the screen follows its scrolling (once a frame, in memory): its position is the one it was left at,
  // whenever the browser starts a traversal away from it
  let frame = 0
  addEventListener(
    'scroll',
    () => {
      const key = rendered // the entry scrolled, before a popstate makes another one rendered
      if (frame || !key) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (rendered === key) remember(key, { x: scrollX, y: scrollY })
      })
    },
    { passive: true },
  )
  const commit = () => {
    let key = keyOf(history.state)
    const added = !key
    if (!key)
      history.replaceState(
        {
          ...(history.state as object | null),
          [KEY]: (key = newKey()),
          [INDEX]: (at = at === undefined ? 0 : at + 1),
        },
        '',
      )
    recorded = recordOf(history.state)
    rendered = key
    renderedUrl = location.pathname + location.search
    return added
  }
  return {
    save,
    commit,
    key: () => rendered,
    // Of the two entries, the one with the higher index, E, is the one a transition went to, and its record is the one read:
    // Back from E reads the state of the entry being left (`recorded`, kept in memory: nothing else has it), Forward to E reads
    // `state`. None if either entry has no index (not pushed by this client).
    direction(state: unknown): { traversal?: string[]; record?: string[] } {
      const from = at
      const to = (at = indexOf(state))
      const left = recorded
      recorded = recordOf(state)
      if (from === undefined || to === undefined || to === from) return {}
      const back = to < from
      return {
        traversal: [back ? 'navigation-back' : 'navigation-forward'],
        record: back ? left : recorded,
      }
    },
    start() {
      history.scrollRestoration = 'manual'
      try {
        for (const key of JSON.parse(sessionStorage.getItem(STORAGE) ?? '[]') as string[]) {
          const saved = read(key)
          if (saved) positions.set(key, saved)
        }
      } catch {}
      commit()
      return read(rendered)
    },
    // A replaced entry keeps its state, but another URL, by a navigation that is not shallow, takes the shallow mark away:
    // `closeShallow()` there must not go Back off it. A replaced entry is the same entry (its key stays) for a shallow
    // navigation and an answer at its URL; another page is a new one.
    write(url: string, replace: boolean, shallow = false, record?: string[]) {
      const to = new URL(url, location.href)
      const same = to.pathname + to.search === location.pathname + location.search
      const old = keyOf(history.state)
      const kept = replace && old && (shallow || same)
      const state: Record<string, unknown> = {
        ...(replace ? (history.state as object | null) : {}),
        [KEY]: kept ? old : newKey(),
      }
      if (replace && old && !kept) forget(old)
      if (!replace) state[INDEX] = at = (at ?? 0) + 1
      if (shallow) {
        if (!replace) state[SHALLOW] = true
      } else {
        if (!same) delete state[SHALLOW]
        if (record) state[TRANSITION] = record
        else if (!same) delete state[TRANSITION]
      }
      recorded = recordOf(state)
      if (replace) history.replaceState(state, '', url)
      else history.pushState(state, '', url)
    },
    pop(state: unknown) {
      // nothing saved here: the browser may have scrolled already (Firefox and Safari to a #fragment, before its
      // popstate); the entry left has its position from its scroll events
      const key = keyOf(state)
      const fragment = location.pathname + location.search === renderedUrl
      const position = read(key)
      if (fragment) commit()
      return { fragment, position, key }
    },
  }
}

function restore(
  position: { x: number; y: number } | null | undefined,
  hash: string,
  first = false,
) {
  if (position) return window.scrollTo(position.x, position.y)
  const target = hash && fragmentTarget(hash.slice(1))
  if (target) return target.scrollIntoView()
  if (!first) window.scrollTo(0, 0)
}

// browsers scroll on their own until the page has loaded (Firefox, a page rendered in the browser back to the top), as the
// document's script handles for a page rendered on the server. Not once the visitor has scrolled, typed or clicked.
function holdUntilLoaded(position: { x: number; y: number }) {
  if (document.readyState === 'complete') return
  let held = true
  const off = () => (held = false)
  for (const type of ['wheel', 'touchstart', 'keydown', 'mousedown'])
    addEventListener(type, off, { once: true, passive: true })
  addEventListener('load', () => setTimeout(() => held && window.scrollTo(position.x, position.y)))
}

// decoded, or as it is (`#100%` doesn't decode)
function fragmentTarget(fragment: string): HTMLElement | null {
  try {
    return (
      document.getElementById(decodeURIComponent(fragment)) ?? document.getElementById(fragment)
    )
  } catch {
    return document.getElementById(fragment)
  }
}

let announcer: HTMLElement | undefined
function announce() {
  if (!announcer) {
    announcer = document.createElement('div')
    announcer.setAttribute('aria-live', 'assertive')
    announcer.setAttribute('aria-atomic', 'true')
    Object.assign(announcer.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
      whiteSpace: 'nowrap',
    })
    document.body.append(announcer)
  }
  announcer.textContent = document.title
}

const isWebUrl = (url: string) => {
  try {
    return /^https?:$/.test(new URL(url, location.href).protocol)
  } catch {
    return false
  }
}

/** `javascript:` is never handed to `location`: the page's CSP would be all that stops it (the URL parser drops leading space, lowers the scheme) */
function refuseScript(url: URL) {
  if (url.protocol === 'javascript:') throw new Error('fondu: refusing to load a javascript: URL')
}

function fileName(disposition: string): string {
  const encoded = /filename\*\s*=\s*UTF-8''([^;\s]+)/i.exec(disposition)?.[1]
  if (encoded)
    try {
      return decodeURIComponent(encoded)
    } catch {}
  const m = /filename\s*=\s*(?:"([^"]*)"|([^;\s]+))/i.exec(disposition)
  return m?.[1] ?? m?.[2] ?? ''
}

export function inBrowser(name: string) {
  if (typeof window === 'undefined')
    throw new Error(`fondu: ${name}() runs in the browser, not on the server`)
}

/** `href` loaded as a document, for what a page can't change in place (`<html lang>`: another language). */
export function loadDocument(href: string) {
  inBrowser('loadDocument')
  refuseScript(new URL(href, location.href))
  location.assign(href)
}

/**
 * `href` visited as a link to it would be: a page of the app in place, anything else as a document. `keep`: the page keeps its
 * state and scroll position, nothing is announced (a search box that `navigate()`s as it is typed). `shallow`: the page
 * keeps its props and state, `usePage().url` follows; a URL that is not a page of this app throws. `transition`: `true`, or
 * custom types (`['zoom']`); `false` opts out.
 */
export function navigate(
  href: string,
  options:
    | { replace?: boolean; keep?: boolean; shallow?: false; transition?: boolean | string[] }
    | { replace?: boolean; keep?: never; shallow: true; transition?: never } = {},
) {
  inBrowser('navigate')
  const {
    replace = false,
    keep = false,
    shallow = false,
    transition,
  } = options as {
    replace?: boolean
    keep?: boolean
    shallow?: boolean
    transition?: boolean | string[]
  }
  if (shallow && keep)
    throw new Error('fondu: a shallow navigation takes no `keep`: the page stays as it is')
  const shown = shownUrl?.()
  // a shallow navigation is relative to the page on the screen, whose URL `location` may have left
  const url = new URL(href, shallow ? (shown ?? location.href) : location.href)
  refuseScript(url)
  if (shallow) {
    if (
      url.origin !== location.origin ||
      !isWebUrl(url.href) ||
      (isAppPage && !isAppPage(url.pathname))
    )
      throw new Error(
        `fondu: a shallow navigation needs a page of this app; ${url.href} is not one: leave out \`shallow\``,
      )
    if (shallowTo) return shallowTo(url, replace)
  }
  const here = url.pathname + url.search === location.pathname + location.search
  if (
    shallow ||
    !visit ||
    url.origin !== location.origin ||
    !isAppPage?.(url.pathname) ||
    (here && url.hash)
  )
    return replace ? location.replace(url.href) : location.assign(url.href) // a #fragment of this page: the browser's; shallow: the app has not started
  visit(url.href, {
    history: replace || url.href === location.href ? 'replace' : 'push',
    keep,
    transition: transition === true ? [] : transition,
  })
}

/**
 * Closes what `navigate(…, { shallow: true })` or a `data-shallow` link opened (a dialog, a drawer), one step. Never leaves
 * the page on the screen. A second call before the first one's Back has landed does nothing.
 */
export function closeShallow(to: string) {
  inBrowser('closeShallow')
  if (closing) return
  if ((history.state as Record<string, unknown> | null)?.[SHALLOW] === true) {
    closing = true
    history.back()
  } else navigate(to, { shallow: true, replace: true })
}

export function again(only?: string[]) {
  if (!visit) return location.reload()
  if (!only) return visit(location.href, { history: 'none', keep: true })
  if (only.length) ask!(only)
}
