import { pageDataPath } from '../paths.js'

/** what the server sends for a page: its id (its route file, `users/[id]`), its props, its URL, the build's version */
export interface Page {
  component: string
  props: Record<string, unknown>
  url: string
  version: string | null
  flash: Record<string, unknown>
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
  /** a navigation started (true; `form`: a form's submission) or ended (false) */
  pending: (pending: boolean, form: boolean) => void
  /** a GET navigation to `pathname` started: its page's modules may load with its data */
  preload: (pathname: string) => void
}

interface Visit {
  /** where the page goes in the history once it is on the screen: a new entry, this one, or none (Back, reload()) */
  history: 'push' | 'replace' | 'none'
  /** a POST form's body, from its form */
  body?: FormData
  form?: HTMLFormElement
  /** Back and Forward: where the entry was scrolled; reload(): undefined, the scroll stays */
  scroll?: { x: number; y: number } | null
  /** reload(): the page keeps its state */
  keep?: boolean
  /** Back and Forward: the page the entry showed, put on the screen at once, then the server's in its place */
  kept?: Page
}

let visit: ((url: string, options: Visit) => void) | undefined

/**
 * Same-origin links and forms, Back and Forward, through the History API (as Void's client, MIT): the page fetched
 * as JSON, its URL in the history, the page shown in place, then the scroll position (Fondu's own, per history entry:
 * the browsers' differ). What isn't for it (another site, a new tab, a download, a modified click) is the browser's.
 */
export function startNavigation({ initial, show, prerender, pending, preload }: Options) {
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

  const headers = () => ({ 'X-Fondu': 'true', ...(version && { 'X-Fondu-Version': version }) })
  /** a document load: in place of this entry, or after it */
  const documentLoad = (url: string, replace: boolean) => {
    // http(s) only: a header's URL never runs as `javascript:` (an app's redirect to a URL it was given)
    if (!isWebUrl(url)) return console.error(`fondu: not loading ${url}: not an http(s) URL`)
    if (replace) location.replace(url)
    else location.assign(url)
  }

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
    // the form being sent is aria-busy: for its submit buttons' pending state (CSS, or useNavigating()), and for
    // assistive technology
    form?.setAttribute('aria-busy', 'true')
    pending(!shown, form !== null)
    const done = () => {
      form?.removeAttribute('aria-busy')
      if (!shown && current === controller) pending(false, false)
    }
    if (!post) preload(url.pathname)
    const from =
      !post && prerender ? pageDataPath(url.pathname) + url.search : url.pathname + url.search
    void (async () => {
      try {
        if (shown) {
          scroll.commit()
          await show(shown, true, () => signal.aborted)
          if (signal.aborted) return
          announce()
          restore(options.scroll, url.hash)
        }
        const response = await fetch(from, {
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
          // a proxy's error page, a file: the URL as a document (a POST's redirect: its target); the answer to a POST
          // itself can't be asked for again
          if (!post || response.redirected)
            return documentLoad(post ? response.url : url.href, options.history !== 'push')
          const html = await response.text()
          document.open() // the page's listeners gone with it, popstate's too
          document.write(html)
          document.close()
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
        // its URL first, as the browser's own navigations: a page's render reads it (`location`, a URL's language);
        // a redirect's, the fragment asked for if it is still this page's
        const target = page.url + (asked === page.url ? url.hash : '')
        // a form's answer at its URL replaces the entry; Back's or reload()'s page redirected elsewhere too
        const history =
          options.history === 'push' && same
            ? 'replace'
            : options.history === 'none' && asked !== page.url
              ? 'replace'
              : options.history
        if (history !== 'none') scroll.write(target, history === 'replace')
        scroll.commit()
        await show(page, fresh, () => signal.aborted)
        if (signal.aborted) return
        keep(page)
        if (shown && !fresh) return
        if (!options.keep) announce()
        // a page asked for again stays where it is: reload(), a form's answer at its URL
        if (options.keep || same) return
        // at once, the page in the DOM (show() renders it synchronously): no frame drawn where it doesn't belong
        restore(options.history === 'none' ? options.scroll : null, url.hash)
      } catch (error) {
        if ((error as Error).name === 'AbortError' || shown) return // offline, Back: the kept page stays
        if (post) throw error // the form stays, to send again
        documentLoad(url.href, options.history !== 'push') // offline: the browser says so
      } finally {
        done()
      }
    })()
  }

  // links: a plain click on a same-origin <a href>, which the page let through
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = (event.target as Element | null)?.closest?.('a[href]')
    if (!(link instanceof HTMLAnchorElement)) return
    if ((link.target && link.target !== '_self') || link.hasAttribute('download')) return
    const url = new URL(link.href)
    if (url.origin !== location.origin || !isWebUrl(url.href)) return
    // a #fragment of this page: the browser scrolls to it (the position left saved for Back)
    if (url.pathname + url.search === location.pathname + location.search && url.hash) {
      scroll.save()
      return
    }
    event.preventDefault()
    visit!(url.href, { history: url.href === location.href ? 'replace' : 'push' })
  })

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
    if (method === 'post') return visit!(url.href, { history: 'push', body: data, form })
    url.search = new URLSearchParams(
      [...data].map(([k, v]) => [k, typeof v === 'string' ? v : v.name]),
    ).toString()
    visit!(url.href, { history: 'push', form })
  })

  // Back and Forward: the entry's page, where it was scrolled
  window.addEventListener('popstate', (event) => {
    const popped = scroll.pop(event.state)
    if (popped.fragment) return restore(popped.position, location.hash)
    visit!(location.href, {
      history: 'none',
      scroll: popped.position,
      kept: kept.get(popped.key ?? ''),
    })
  })
  // leaving the document (a reload, another site): its position, and the browser's restoration back on for this
  // entry, so a reload or Back to it is scrolled at first paint, as any document
  window.addEventListener('pagehide', () => {
    scroll.save()
    history.scrollRestoration = 'auto'
  })
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) history.scrollRestoration = 'manual' // back from the back/forward cache
  })
  // the browser's own #fragment navigations: the entry gets its key
  window.addEventListener('hashchange', scroll.commit)

  restore(scroll.start(), location.hash, true)
  keep(initial)
}

/**
 * Scroll positions, per history entry (a key in `history.state`), in memory and in sessionStorage (a reload, a page
 * of another site and back): the browser's restoration is off. Each belongs to the entry on the screen, even once
 * the browser has started a traversal away from it.
 */
function scrollPositions() {
  const KEY = '__fondu'
  const STORAGE = 'fondu-scroll:'
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
     * The document's entry: its key; where it was scrolled, unless the browser did it (an entry it restores, the one
     * left by a reload): an entry this client pushed, loaded again (Back from another site past it)
     */
    start() {
      const restored = history.scrollRestoration === 'auto'
      history.scrollRestoration = 'manual'
      commit()
      return restored ? null : read(rendered)
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
  const target = hash && document.getElementById(decodeURIComponent(hash.slice(1)))
  if (target) return target.scrollIntoView()
  if (!first) window.scrollTo(0, 0)
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

/**
 * `href` loaded as a document. Every other navigation is the client's, links and forms: this is for what a page
 * can't change in place (`<html lang>`: another language).
 */
export function loadDocument(href: string) {
  location.assign(href)
}

/** the page asked for again, its state and the scroll position kept */
export function again() {
  if (visit) visit(location.href, { history: 'none', keep: true })
  else location.reload()
}
