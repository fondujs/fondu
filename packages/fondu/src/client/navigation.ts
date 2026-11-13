import { crlf } from '../form.js'
import { pageDataPath, SCROLL_KEY, SCROLL_STORAGE } from '../paths.js'

/** what the server sends for a page: its id (its route file, `users/[id]`), its props, its URL, the build's version */
export interface Page {
  component: string
  props: Record<string, unknown>
  url: string
  version: string | null
  flash: Record<string, unknown>
  /** the props left out, to come with a request of their own (`defer()`); the client's: those not there yet */
  deferred?: string[]
}

interface Options {
  initial: Page
  /**
   * puts the page on the screen (in the DOM once it resolves); `fresh`: mounted anew, else it keeps its state (a form
   * back with its errors, reload()); not once `stale()` (superseded while its modules loaded)
   */
  show: (page: Page, fresh: boolean, stale: () => boolean) => Promise<void>
  /** `fondu({ prerender: true })`: GET navigations read `/_fondu/pages/<path>.json` */
  prerender: boolean
  /** a navigation started (to `to`: a path, its query and fragment; `form`: a form's submission) or ended (null) */
  pending: (
    navigation: {
      to: string
      form: HTMLFormElement | null
      post: boolean
      failed?: boolean
    } | null,
  ) => void
  /** a GET navigation to `pathname` started: its page's modules may load with its data */
  preload: (pathname: string) => void
  /** a URL path is one of the app's pages (by the route files' patterns): its links are the client's */
  isPage: (pathname: string) => boolean
  /** the page was rendered on the server (hydrated), not in the browser */
  hydrated: boolean
}

interface Visit {
  /** where the page goes in the history once it is on the screen: a new entry, this one, or none (Back, reload()) */
  history: 'push' | 'replace' | 'none'
  /** a POST form's body, from its form */
  body?: FormData | URLSearchParams | string
  form?: HTMLFormElement
  /** Back and Forward: where the entry was scrolled; reload(): undefined, the scroll stays */
  scroll?: { x: number; y: number } | null
  /** reload(), navigate(…, { keep }): the page keeps its state and the scroll, if the same component answers */
  keep?: boolean
  /** Back and Forward: the page the entry showed, put on the screen at once, then the server's in its place */
  kept?: Page
}

let visit: ((url: string, options: Visit) => void) | undefined
/** the page on the screen at another URL of its own, nothing asked for (`navigate(url, { shallow: true })`) */
let shallowTo: ((url: URL, replace: boolean) => void) | undefined
/** the URL of the page on the screen (its path and query): not `location`'s while a visit is being put on the screen */
let shownUrl: (() => URL) | undefined
/** the props of the page on the screen asked for, quietly (`defer()`, `reload({ only })`) */
let ask: ((names: string[]) => void) | undefined
/** a URL path is one of the app's pages (the client's, once it has started) */
let isAppPage: ((pathname: string) => boolean) | undefined

/**
 * Same-origin links and forms, Back and Forward, through the History API (as Void's client, MIT): the page fetched
 * as JSON, its URL in the history, the page shown in place, then the scroll position (Fondu's own, per history entry:
 * the browsers' differ). What isn't for it (another site, a new tab, a download, a modified click) is the browser's.
 */
export function startNavigation({
  initial,
  show,
  prerender,
  pending,
  preload,
  isPage,
  hydrated,
}: Options) {
  const scroll = scrollPositions()
  let version = initial.version
  let current: AbortController | undefined
  // the page each entry showed, for Back and Forward: in memory only (gone on reload), the last 50; all of them
  // forgotten once a form is sent (what it changed, a signed-out user's pages), its flash data not shown again
  const kept = new Map<string, Page>()
  const keep = (page: Page) => {
    const key = scroll.key()
    if (!key) return
    kept.delete(key)
    kept.set(key, { ...page, flash: {} })
    if (kept.size > 50) kept.delete(kept.keys().next().value!)
  }

  // the page on the screen, and how many were put there (an answer for another is dropped)
  let on = initial
  let shows = 0
  // The history entries (their keys) that show the page on the screen, at URLs of their own: the one that got it, the
  // ones shallow navigations added, the browser's own #fragment entries. Back and Forward between them ask for
  // nothing. A page put on the screen is its entry's alone: the others are normal entries again (Back asks)
  let group = new Set<string>()
  // the URL the page's props are the loader's answer for: `on.url` changes with a shallow navigation, this does not
  let answered = initial.url
  const asking = new Set<AbortController>()
  const put = async (page: Page, fresh: boolean, stale: () => boolean) => {
    await show(page, fresh, stale)
    if (stale()) return
    on = page
    shows++
    group = new Set([scroll.key()!])
    answered = page.url
    // the page they were for is gone
    for (const quiet of asking) quiet.abort()
  }
  shownUrl = () => new URL(on.url, location.href)
  const headers = () => ({ 'X-Fondu': 'true', ...(version && { 'X-Fondu-Version': version }) })
  /** where a page's JSON is: its URL, or its file (a prerendered build) */
  const source = (url: URL) =>
    prerender ? pageDataPath(url.pathname) + url.search : url.pathname + url.search

  // What a link's page answered when asked early (`prerender`), by the URL a navigation would ask: its file (the
  // text and the headers, read into memory), or null (no file: 204, its data is asked for at the click, when its
  // loader should run). A file runs nothing, so asking early costs the app nothing. Asked once in 30 seconds
  // (TanStack Router's default: a deploy in between is found at the click); the click waits for an answer on its
  // way, and every click in the 30 seconds uses it, its version checked as for any page object. The last 20
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
        const response = await fetch(key, { headers: { ...headers(), 'X-Fondu-Prefetch': 'true' } })
        if (response.status === 200 && response.headers.has('X-Fondu'))
          return { body: await response.text(), headers: response.headers }
      } catch {
        // offline: asked for again
        prefetched.delete(key)
      }
      return null
    })()
    prefetched.delete(key)
    prefetched.set(key, { answer, at: Date.now() })
    if (prefetched.size > 20) prefetched.delete(prefetched.keys().next().value!)
  }

  /**
   * Props of the page on the screen, asked for with a request of its own: the loader's answer for the same
   * component, with these props only. Quiet: no navigation state, no history entry, no scroll; it is aborted when
   * another page is put on the screen, and an answer for a page no longer there is dropped; whatever isn't the
   * page's answer is a failure, never a navigation. What came is merged into the page, its state kept; what didn't
   * is no longer pending (`<Deferred>` says it failed)
   */
  ask = async (names) => {
    const at = shows
    const page = on
    const controller = new AbortController()
    asking.add(controller)
    // a prop asked for that is neither here nor coming (it failed): pending again, `<Deferred>` shows its fallback
    const absent = names.filter((n) => !Object.hasOwn(page.props, n) && !page.deferred?.includes(n))
    if (absent.length)
      void show(
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
        response.ok && response.headers.has('X-Fondu') ? ((await response.json()) as Page) : null
      if (answer?.component === page.component)
        got = Object.fromEntries(
          Object.entries(answer.props).filter(([key]) => names.includes(key)),
        )
    } catch {} // offline, aborted
    asking.delete(controller)
    if (controller.signal.aborted || shows !== at) return
    // asked at the URL of a shallow entry, which the page has left since: not its answer
    if (page.url !== answered && page.url !== on.url) return
    const next: Page = {
      ...on,
      props: { ...on.props, ...got },
      deferred: on.deferred?.filter((n) => !names.includes(n)),
    }
    on = next // before the module is awaited: another answer merges into this one
    // asked at the URL of a shallow entry, not at the one the page was loaded at: an answer of its own, and this
    // entry's alone (those asked before the shallow navigation are the loader's answer still)
    if (got && page.url !== answered) {
      group = new Set([scroll.key()!])
      answered = page.url
    }
    await show(next, false, () => shows !== at)
    if (shows === at) keep(next)
  }
  /** a document load: in place of this entry, or after it */
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
    // the form being sent is aria-busy: for its submit buttons' pending state (CSS, or useNavigation()), and for
    // assistive technology
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
    // a GET that is not asked for again: the answer kept for it (never a form's POST, reload() or Back's)
    const found = !post && !options.keep && !shown ? prefetched.get(from) : undefined
    const entry = found && Date.now() - found.at < freshFor ? found : undefined
    void (async () => {
      try {
        if (shown) {
          scroll.commit()
          await put(shown, true, () => signal.aborted)
          if (signal.aborted) return
          announce()
          restore(options.scroll, url.hash)
        }
        // the file asked for early, waited for if it is on its way; none (null): the app is asked
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
        // a new build, another site: the document
        const to = response.headers.get('X-Fondu-Location')
        if (response.status === 409 && to) return documentLoad(to, options.history !== 'push')
        // a redirect to a #fragment, followed here: fetch() would lose it
        const redirect = response.headers.get('X-Fondu-Redirect')
        if (redirect) {
          if (isWebUrl(redirect))
            visit!(redirect, { history: options.history === 'push' ? 'push' : 'replace' })
          return
        }
        if (!response.headers.has('X-Fondu')) {
          // a proxy's error page, a file: the URL as a document (a POST's redirect: its target), this answer unread
          if (!post || response.redirected) {
            void response.body?.cancel()
            return documentLoad(post ? response.url : url.href, options.history !== 'push')
          }
          // the answer to a POST itself, which can't be asked for again: as the browser would show it
          const disposition = response.headers.get('Content-Disposition') ?? ''
          if (/^\s*attachment/i.test(disposition)) {
            // a file: downloaded, the page stays
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
        const page = (await response.json()) as Page
        if (signal.aborted) return
        if (version && page.version && page.version !== version)
          return documentLoad(page.url, options.history !== 'push')
        version = page.version
        // the answer to a form at the URL it was sent from: in place, its scroll position kept; back with errors,
        // the form and what was typed stay too
        const here = location.pathname + location.search
        const same = post && page.url === here
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
        // a form's answer at its URL replaces the entry; Back's or reload()'s page redirected elsewhere too
        const history =
          options.history === 'push' && same
            ? 'replace'
            : options.history === 'none' && asked !== page.url
              ? 'replace'
              : options.history
        if (history !== 'none') scroll.write(target, history === 'replace')
        scroll.commit()
        await put(page, fresh, () => signal.aborted)
        if (signal.aborted) return
        keep(page)
        if (page.deferred?.length) ask!(page.deferred)
        if (shown && !fresh) return
        if (!stay) announce()
        // a page asked for again stays where it is: reload(), navigate() with `keep`, a form's answer at its URL
        if (stay || same) return
        // at once, the page in the DOM (show() renders it synchronously): no frame drawn where it doesn't belong
        restore(options.history === 'none' ? options.scroll : null, url.hash)
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        if (shown) {
          // offline, Back: the kept page stays; what it was still waiting for is asked now, to fail rather than wait
          if (on.deferred?.length) ask!(on.deferred)
          return
        }
        // the form stays, to send again: the state says so
        if (post) {
          failed = true
          return
        }
        documentLoad(url.href, options.history !== 'push') // offline: the browser says so
      } finally {
        done()
      }
    })()
  }

  /**
   * The page on the screen at a URL of its own (its query, its #fragment), nothing asked for: a new history entry, or
   * this one's. The props stay the loader's answer for the URL that got the page; its `url` follows the address bar.
   */
  shallowTo = (url, replace) => {
    // A visit whose URL is in the history already, its page not on the screen yet (its modules load): no URL of the
    // page on the screen to change. A normal navigation, which supersedes that visit as any does
    if (location.pathname + location.search !== on.url) return navigate(url.href, { replace })
    current?.abort() // a visit still waiting for its answer: given up, as any newer navigation does
    const was = location.href
    scroll.save()
    const before = scroll.key()!
    replace ||= url.href === location.href
    scroll.write(url.href, replace, true)
    scroll.commit()
    scroll.save() // the new entry starts where the page is
    if (replace) group.delete(before)
    group.add(scroll.key()!)
    settle(true)
    // the browser fires no `hashchange` for pushState
    if (new URL(was).hash !== url.hash)
      dispatchEvent(new HashChangeEvent('hashchange', { oldURL: was, newURL: url.href }))
  }
  /**
   * The page on the screen follows the address bar (its `url`; a shallow navigation also drops its flash and errors,
   * which belonged to the answer before it), and is kept for the entry
   */
  const settle = (fresh: boolean) => {
    const at = shows
    on = {
      ...on,
      url: location.pathname + location.search,
      ...(fresh && { flash: {}, props: { ...on.props, errors: {} } }),
    }
    void show(on, false, () => shows !== at)
    keep(on)
  }

  /** a link the client may follow itself (same origin, this window, no download): its URL; `soft`, a shallow one */
  const linkOf = (target: EventTarget | null): { url: URL; soft: boolean } | undefined => {
    const link = (target as Element | null)?.closest?.('a[href]')
    if (!(link instanceof HTMLAnchorElement)) return
    if ((link.target && link.target !== '_self') || link.hasAttribute('download')) return
    const url = new URL(link.href)
    if (url.origin !== location.origin || !isWebUrl(url.href)) return
    // `data-shallow`: for the page on the screen's own URL (its query, its #fragment) a shallow navigation
    return {
      url,
      soft: link.hasAttribute('data-shallow') && url.pathname === shownUrl!().pathname,
    }
  }

  // links: a plain click on a same-origin <a href>, which the page let through
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
    // a URL that is none of the app's pages (a file, /llms.txt; an HTTP route; nothing at all): the browser's
    if (!isPage(url.pathname)) return
    event.preventDefault()
    visit!(url.href, { history: url.href === location.href ? 'replace' : 'push' })
  })

  // a link's page modules load before the click: when the pointer rests on it (80 ms), or a touch starts on it, and
  // a static page's data with them (its file: nothing runs); another page's data not, a loader runs for a visit,
  // never for a page that may not be visited. Not when the visitor asked to save data; not for the keyboard
  // (tabbing passes many links)
  if (!(navigator as { connection?: { saveData?: boolean } }).connection?.saveData) {
    const RESTING = 80 // milliseconds the pointer rests
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

  // forms: GET and POST to this origin, in this window, which the page let through
  document.addEventListener('submit', (event) => {
    if (event.defaultPrevented) return
    const form = event.target
    if (!(form instanceof HTMLFormElement)) return
    const submitter = event.submitter as HTMLButtonElement | HTMLInputElement | null
    const attr = (name: string, own: string) =>
      submitter?.getAttribute(own) ?? form.getAttribute(name) ?? ''
    const method = attr('method', 'formmethod').toLowerCase() || 'get'
    const target = attr('target', 'formtarget')
    if ((method !== 'get' && method !== 'post') || (target && target !== '_self')) return
    const url = new URL(attr('action', 'formaction') || location.href, location.href)
    if (url.origin !== location.origin || !isWebUrl(url.href)) return
    event.preventDefault()
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
      return visit!(url.href, { history: 'push', body, form })
    }
    url.search = new URLSearchParams(fields).toString()
    visit!(url.href, { history: 'push', form })
  })

  // Back and Forward: the entry's page, where it was scrolled
  window.addEventListener('popstate', (event) => {
    closing = false
    const popped = scroll.pop(event.state)
    // an entry that shows the page on the screen, at a URL of its own: its URL, nothing asked for, the scroll where it
    // is. A visit on its way is given up, as any Back does
    if (!popped.fragment && popped.key && group.has(popped.key)) {
      current?.abort()
      pending(null)
      scroll.commit()
      return settle(false)
    }
    if (popped.fragment) {
      if (!popped.key) group.add(scroll.key()!) // an entry the browser made (no key yet): of this page
      // a #fragment that names no element (a dialog's `#settings/account`) leaves the page where it is, as the browser does
      if (!popped.position && location.hash && !fragmentTarget(location.hash.slice(1))) return
      return restore(popped.position, location.hash)
    }
    visit!(location.href, {
      history: 'none',
      scroll: popped.position,
      kept: kept.get(popped.key ?? ''),
    })
  })
  // leaving the document (a reload, another site): its position, put back by the document when it is loaded again.
  // The browser's own restoration stays off: engines restore at times of their own, or not (WebKit, an entry once
  // manual; Firefox, a #fragment), and over the page's own (Firefox, at load, a page rendered in the browser at 0)
  window.addEventListener('pagehide', scroll.save)
  // the browser's own #fragment navigations: the entry gets its key
  window.addEventListener('hashchange', () => {
    // an entry the browser made (no key yet; a popstate may have given it one): of the page on the screen
    if (scroll.commit()) group.add(scroll.key()!)
  })
  addEventListener('pageshow', () => (closing = false))

  // a page rendered on the server is where it belongs already, before its first paint: at its entry's position (its
  // document's script: a reload, Back from another site), else at its #fragment (the browser). One rendered here has
  // its content only now: its entry's position, or its #fragment's target
  const position = scroll.start()
  group.add(scroll.key()!)
  if (!hydrated) {
    restore(position, location.hash, true)
    if (position) holdUntilLoaded(position)
  }
  keep(initial)
  // A prerendered page's file is made without a query, and the document it hydrates is too: once it is hydrated, its URL
  // is the browser's (a state the query holds works at a direct load; its loader never saw the query). A page
  // rendered per request has its query in its URL already
  if (location.pathname + location.search !== on.url) settle(false)
  if (initial.deferred?.length) ask(initial.deferred)
}

/**
 * What this client adds to `history.state` (beside the scroll key, `paths.ts`), and what outlives a deploy: an entry's
 * own state, read by the build that is running when the browser comes back to it.
 * `__fondu_shallow: true`: the entry was pushed by a shallow navigation, from the entry below it, which showed the
 * same page. `closeShallow()` goes back (one step) from such an entry; any other it replaces in place.
 */
const SHALLOW = '__fondu_shallow'
/** `closeShallow()` has gone back, and the browser has not landed yet: a second call waits (until the entry is there) */
let closing = false

/**
 * Scroll positions, per history entry (a key in `history.state`), in memory and in sessionStorage (a reload, a page
 * of another site and back): the browser's restoration is off. Each belongs to the entry on the screen, even once
 * the browser has started a traversal away from it.
 */
function scrollPositions() {
  const KEY = SCROLL_KEY
  const STORAGE = SCROLL_STORAGE
  const positions = new Map<string, { x: number; y: number }>()
  const keyOf = (state: unknown) =>
    state &&
    typeof state === 'object' &&
    typeof (state as Record<string, unknown>)[KEY] === 'string'
      ? ((state as Record<string, string>)[KEY] as string)
      : null
  const newKey = () => Math.random().toString(36).slice(2, 10)
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
    positions.set(rendered, position)
    try {
      sessionStorage.setItem(STORAGE + rendered, JSON.stringify(position))
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
        if (rendered === key) positions.set(key, { x: scrollX, y: scrollY })
      })
    },
    { passive: true },
  )
  /** this entry's key, given one if it has none (a first visit, a #fragment the browser navigated to): true if so */
  const commit = () => {
    let key = keyOf(history.state)
    const added = !key
    if (!key)
      history.replaceState({ ...(history.state as object | null), [KEY]: (key = newKey()) }, '')
    rendered = key
    renderedUrl = location.pathname + location.search
    return added
  }
  return {
    save,
    commit,
    /** the key of the entry on the screen */
    key: () => rendered,
    /**
     * The document's entry: its key, and where it was scrolled, if it was (an entry this client pushed, loaded again:
     * a reload, Back from another site past it)
     */
    start() {
      history.scrollRestoration = 'manual'
      commit()
      return read(rendered)
    },
    /**
     * The page on the screen, at `url`: a new entry or this one. `shallow`: by a shallow navigation, which marks a
     * new entry (SHALLOW); a replaced entry keeps its state, but another URL, by a navigation that is not
     * shallow, takes the mark away: `closeShallow()` there must not go Back off it.
     */
    write(url: string, replace: boolean, shallow = false) {
      const state: Record<string, unknown> = {
        ...(replace ? (history.state as object | null) : {}),
        [KEY]: newKey(),
      }
      if (shallow) {
        if (!replace) state[SHALLOW] = true
      } else {
        // the same URL (a form's answer, reload()): the same overlay. Another page: not a shallow entry
        const to = new URL(url, location.href)
        if (to.pathname + to.search !== location.pathname + location.search) delete state[SHALLOW]
      }
      if (replace) history.replaceState(state, '', url)
      else history.pushState(state, '', url)
    },
    /** Back or Forward to `state`'s entry: where it was; `fragment`: the same page, another #fragment */
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

/** an entry's position, or its #fragment, or the top */
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

/**
 * A position kept until the page has loaded: browsers scroll on their own until then (Firefox, a page rendered in
 * the browser back to the top), as the document's script does it for a page rendered on the server. Not once the
 * visitor has scrolled, typed or clicked.
 */
function holdUntilLoaded(position: { x: number; y: number }) {
  if (document.readyState === 'complete') return
  let held = true
  const off = () => (held = false)
  for (const type of ['wheel', 'touchstart', 'keydown', 'mousedown'])
    addEventListener(type, off, { once: true, passive: true })
  addEventListener('load', () => setTimeout(() => held && window.scrollTo(position.x, position.y)))
}

/** the element a #fragment names: decoded, or as it is (`#100%` doesn't decode); null for none */
function fragmentTarget(fragment: string): HTMLElement | null {
  try {
    return (
      document.getElementById(decodeURIComponent(fragment)) ?? document.getElementById(fragment)
    )
  } catch {
    return document.getElementById(fragment)
  }
}

/** the new page's title, for screen readers: a navigation in place is otherwise silent */
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

/** a Content-Disposition's file name: `filename*=UTF-8''…` (RFC 6266), else `filename="…"`; '' for none */
function fileName(disposition: string): string {
  const encoded = /filename\*\s*=\s*UTF-8''([^;\s]+)/i.exec(disposition)?.[1]
  if (encoded)
    try {
      return decodeURIComponent(encoded)
    } catch {}
  const m = /filename\s*=\s*(?:"([^"]*)"|([^;\s]+))/i.exec(disposition)
  return m?.[1] ?? m?.[2] ?? ''
}

/**
 * `href` loaded as a document. Every other navigation is the client's, links and forms: this is for what a page
 * can't change in place (`<html lang>`: another language).
 */
export function loadDocument(href: string) {
  location.assign(href)
}

/**
 * `href` visited as a link to it would be: a page of the app in place (a new history entry, or this one's with
 * `replace`), anything else as a document. `keep`: the answer is shown as `reload()` shows its own, the page keeps
 * its state (a focused input, what was typed) and the scroll position, nothing is announced: a search box that
 * `navigate()`s to its query as it is typed. Another page's component is shown as any navigation's.
 *
 * `shallow`: the query and #fragment of the page on the screen change, and nothing is asked for: the page keeps its
 * props, its state and the scroll position, `usePage().url` follows, and a changed #fragment fires `hashchange` (the
 * browser doesn't scroll to it, and `:target` stays as it was). Only this page's own pathname; another page throws.
 * Not with `keep`: a shallow navigation keeps the page anyway. Before the app has started, a document load. While a
 * visit is being put on the screen (its URL is in the history, its page is not there yet), a normal navigation.
 */
export function navigate(
  href: string,
  options:
    | { replace?: boolean; keep?: boolean; shallow?: false }
    | { replace?: boolean; keep?: never; shallow: true } = {},
) {
  const { replace = false, keep = false, shallow = false } = options as Record<string, boolean>
  if (shallow && keep)
    throw new Error('fondu: a shallow navigation takes no `keep`: the page stays as it is')
  const shown = shownUrl?.()
  // a shallow navigation is relative to the page on the screen, whose URL `location` may have left
  const url = new URL(href, shallow ? (shown ?? location.href) : location.href)
  if (shallow) {
    if (url.origin !== location.origin || url.pathname !== (shown ?? location).pathname)
      throw new Error(
        `fondu: a shallow navigation stays on this page (its query, its #fragment); ${url.origin === location.origin ? url.pathname : url.href} is another page: leave out \`shallow\``,
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
  visit(url.href, { history: replace || url.href === location.href ? 'replace' : 'push', keep })
}

/**
 * Closes what `navigate(…, { shallow: true })` or a `data-shallow` link opened (a dialog, a drawer), one step. An
 * entry that was pushed by a shallow navigation, from the entry below it: Back, to the page as it was. Any other (a
 * document loaded at this URL, a reload, an entry replaced…): `to` in its place, a shallow navigation with `replace`
 * (`to` is a URL of this page, as that takes it). Never leaves the page, and never adds an entry. A second call before
 * the first one's Back has landed does nothing: a double click closes one level.
 */
export function closeShallow(to: string) {
  if (closing) return
  if ((history.state as Record<string, unknown> | null)?.[SHALLOW] === true) {
    closing = true
    history.back()
  } else navigate(to, { shallow: true, replace: true })
}

/** the page asked for again, its state and the scroll position kept */
export function again(only?: string[]) {
  if (!visit) return location.reload()
  if (!only) return visit(location.href, { history: 'none', keep: true })
  if (only.length) ask!(only)
}
