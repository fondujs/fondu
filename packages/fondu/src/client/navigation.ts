import { pageDataPath } from '../paths.js'

/** what the server sends for a page: the page module's name in `app/pages/`, its props, its URL, the build's version */
export interface Page {
  component: string
  props: Record<string, unknown>
  url: string
  version: string | null
  flash: Record<string, unknown>
  clearHistory?: true
}

type Info = { fondu?: { page: Page; scroll: boolean } | 'document' | 'reload' }

interface Options {
  initial: Page
  /** puts the page on the screen (in the DOM once it resolves) */
  show: (page: Page) => Promise<void>
  /** `fondu({ prerender: true })`: GET navigations read `/_fondu/pages/<path>.json` */
  prerender: boolean
  /** a navigation or a form submission started (true) or ended (false) */
  pending: (pending: boolean) => void
}

const navigation = () =>
  (globalThis as unknown as { navigation?: Navigation }).navigation as Navigation | undefined

/**
 * Same-origin links, GET and POST forms, Back and Forward, through the Navigation API: the page fetched as JSON and
 * shown in place. Without the Navigation API, links and forms load documents.
 */
export function startNavigation({ initial, show, prerender, pending }: Options) {
  const nav = navigation()
  if (!nav) return
  let version = initial.version
  let submitting: AbortController | undefined
  let current = 0
  // the page each history entry showed, for Back and Forward: in memory, gone on reload and on clearHistory()
  const saved = new Map<string, Page>()
  const remember = (page: Page) => {
    if (page.clearHistory) saved.clear()
    if (nav.currentEntry) saved.set(nav.currentEntry.key, page)
  }
  remember(initial)
  const begin = () => {
    const id = ++current
    pending(true)
    return () => id === current && pending(false)
  }

  const here = () => location.pathname + location.search
  const display = (page: Page, scroll: boolean, history: 'push' | 'replace') =>
    nav.navigate(page.url, { history, info: { fondu: { page, scroll } } satisfies Info })
  const documentLoad = (url: string) =>
    nav.navigate(url, { history: 'replace', info: { fondu: 'document' } satisfies Info })

  /** the page a response is, or undefined when it's handled here (a new build, not a page) */
  const read = async (
    response: Response,
    url: string,
    post: boolean,
  ): Promise<Page | undefined> => {
    const to = response.headers.get('X-Fondu-Location')
    if (response.status === 409 && to) return void documentLoad(to)
    if (!response.headers.has('X-Fondu')) {
      // a proxy's error page, a file: the URL as a document (a POST's redirect: its target); the answer to a POST
      // itself can't be asked for again
      if (!post || response.redirected) return void documentLoad(url)
      const html = await response.text()
      document.open()
      document.write(html)
      document.close()
      return
    }
    const page = (await response.json()) as Page
    if (version && page.version && page.version !== version) return void documentLoad(page.url)
    version = page.version
    return page
  }
  const headers = () => ({ 'X-Fondu': 'true', ...(version && { 'X-Fondu-Version': version }) })
  const failed = (url: string) => (error: unknown) => {
    if ((error as Error).name !== 'AbortError') documentLoad(url) // offline: the browser says so
  }

  nav.addEventListener('navigate', (event) => {
    const info = event.info as Info | undefined
    const url = new URL(event.destination.url)
    if (info?.fondu === 'document' || !event.canIntercept || event.hashChange) return
    // `location.reload()` (Vite's full reload, an app's own): the document, as asked; `reload()` is fondu/client's
    if (event.navigationType === 'reload' && info?.fondu !== 'reload') return
    if (event.downloadRequest !== null || url.origin !== location.origin) return
    submitting?.abort()

    // a page already fetched (a form's answer, a redirect's target): shown by this navigation
    if (typeof info?.fondu === 'object') {
      const { page, scroll } = info.fondu
      event.intercept({
        scroll: 'manual',
        // the same page (a form back with its errors): the focus stays where it was, as the scroll position does
        focusReset: scroll ? 'after-transition' : 'manual',
        async handler() {
          await show(page)
          remember(page)
          if (scroll) scrollAfter(event)
        },
      })
      return
    }

    // a POST form: sent outside the navigation (no history entry for the POST), its answer shown by one
    if (event.formData) {
      event.preventDefault()
      const done = begin()
      const controller = (submitting = new AbortController())
      fetch(url, {
        method: 'POST',
        body: event.formData,
        headers: headers(),
        signal: controller.signal,
      })
        .then(async (response) => {
          const page = await read(response, response.url, true)
          if (!page || controller.signal.aborted) return
          // the same URL (back with the errors): the form, its values and the scroll position stay
          const same = page.url === here()
          display(page, !same, same ? 'replace' : 'push')
        })
        .catch((error: Error) => {
          if (error.name !== 'AbortError') throw error // the form stays, to send again
        })
        .finally(done)
      return
    }

    event.intercept({
      scroll: 'manual',
      focusReset: event.navigationType === 'reload' ? 'manual' : 'after-transition',
      async handler() {
        const done = begin()
        try {
          const back = event.navigationType === 'traverse'
          const kept = back ? saved.get(event.destination.key) : undefined
          if (kept) {
            await show(kept)
            scrollAfter(event)
          }
          const path = url.pathname + url.search
          const from = prerender ? pageDataPath(url.pathname) + url.search : url
          const response = await fetch(from, { headers: headers(), signal: event.signal })
          const page = await read(response, url.href, false)
          if (!page || event.signal.aborted) return
          // redirected: the page at its own URL, in place of this entry
          if (page.url !== path) return void display(page, !kept, 'replace')
          await show(page)
          remember(page)
          if (!kept && event.navigationType !== 'reload') scrollAfter(event)
        } catch (error) {
          failed(url.href)(error)
        } finally {
          done()
        }
      },
    })
  })
}

/** a navigation of the app's own, as a link would be; with no Navigation API, a document */
export function go(url: string, history: 'auto' | 'push' | 'replace' = 'auto') {
  const nav = navigation()
  if (nav) nav.navigate(url, { history })
  else if (history === 'replace') location.replace(url)
  else location.assign(url)
}

/** the page asked for again, its state and the scroll position kept */
export function again() {
  const nav = navigation()
  if (nav) nav.reload({ info: { fondu: 'reload' } satisfies Info })
  else location.reload()
}

/**
 * Where a navigation leaves the page: Back and Forward where it was, a #fragment at its target, else the top (which
 * `event.scroll()` does too since whatwg/html#11987; Chromium 141 doesn't yet).
 */
function scrollAfter(event: NavigateEvent) {
  event.scroll()
  if (event.navigationType !== 'traverse' && !new URL(event.destination.url).hash)
    window.scrollTo(0, 0)
}
