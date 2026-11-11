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
  /** reload(): the page keeps its state */
  keep?: boolean
  /** Back and Forward: the page the entry showed, put on the screen at once, then the server's in its place */
  kept?: Page
}

let visit: ((url: string, options: Visit) => void) | undefined
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
  const asking = new Set<AbortController>()
  const put = async (page: Page, fresh: boolean, stale: () => boolean) => {
    await show(page, fresh, stale)
    if (stale()) return
    on = page
    shows++
    // the page they were for is gone
    for (const quiet of asking) quiet.abort()
  }
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
    let got: Record<string, unknown> = {}
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
    const next: Page = {
      ...on,
      props: { ...on.props, ...got },
      deferred: on.deferred?.filter((n) => !names.includes(n)),
    }
    on = next // before the module is awaited: another answer merges into this one
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
        // the kept page's entry: the server's page in its place, its state kept; redirected (signed out), anew
        const fresh = shown ? asked !== page.url : !options.keep && !(same && errors)
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
        if (!options.keep) announce()
        // a page asked for again stays where it is: reload(), a form's answer at its URL
        if (options.keep || same) return
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

  /** the URL of a link the client may follow itself: same origin, this window, no download */
  const linkOf = (target: EventTarget | null): URL | undefined => {
    const link = (target as Element | null)?.closest?.('a[href]')
    if (!(link instanceof HTMLAnchorElement)) return
    if ((link.target && link.target !== '_self') || link.hasAttribute('download')) return
    const url = new URL(link.href)
    if (url.origin !== location.origin || !isWebUrl(url.href)) return
    return url
  }

  // links: a plain click on a same-origin <a href>, which the page let through
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const url = linkOf(event.target)
    if (!url) return
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
      const url = linkOf(event.target)
      clearTimeout(timer)
      if (url && isPage(url.pathname))
        timer = setTimeout(() => {
          preload(url.pathname)
          void prefetch(url)
        }, RESTING)
    })
    document.addEventListener('mouseout', () => clearTimeout(timer))
    document.addEventListener(
      'touchstart',
      (event) => {
        const url = linkOf(event.target)
        if (!url || !isPage(url.pathname)) return
        preload(url.pathname)
        void prefetch(url)
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
    const popped = scroll.pop(event.state)
    if (popped.fragment) {
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
  window.addEventListener('hashchange', scroll.commit)

  // a page rendered on the server is where it belongs already, before its first paint: at its entry's position (its
  // document's script: a reload, Back from another site), else at its #fragment (the browser). One rendered here has
  // its content only now: its entry's position, or its #fragment's target
  const position = scroll.start()
  if (!hydrated) {
    restore(position, location.hash, true)
    if (position) holdUntilLoaded(position)
  }
  keep(initial)
  if (initial.deferred?.length) ask(initial.deferred)
}

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
  /** this entry's key, given one if it has none (a first visit, a #fragment the browser navigated to) */
  const commit = () => {
    let key = keyOf(history.state)
    if (!key)
      history.replaceState({ ...(history.state as object | null), [KEY]: (key = newKey()) }, '')
    rendered = key
    renderedUrl = location.pathname + location.search
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
    /** the page on the screen, at `url`: a new entry or this one */
    write(url: string, replace: boolean) {
      const state = { ...(replace ? (history.state as object | null) : {}), [KEY]: newKey() }
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
 * `replace`), anything else as a document
 */
export function navigate(href: string, { replace = false }: { replace?: boolean } = {}) {
  const url = new URL(href, location.href)
  const here = url.pathname + url.search === location.pathname + location.search
  if (!visit || url.origin !== location.origin || !isAppPage?.(url.pathname) || (here && url.hash))
    return replace ? location.replace(url.href) : location.assign(url.href) // a #fragment of this page: the browser's
  visit(url.href, { history: replace || url.href === location.href ? 'replace' : 'push' })
}

/** the page asked for again, its state and the scroll position kept */
export function again(only?: string[]) {
  if (!visit) return location.reload()
  if (!only) return visit(location.href, { history: 'none', keep: true })
  if (only.length) ask!(only)
}
