import { pageDataPath } from '../paths.js'

/** what the server sends for a page: its id (its route file, `users/[id]`), its props, its URL, the build's version */
export interface Page {
  component: string
  props: Record<string, unknown>
  url: string
  version: string | null
  flash: Record<string, unknown>
}

/** how a document load goes in the history: see `documentLoad` */
type History = 'push' | 'replace' | 'instead'

type Info = { fondu?: { page: Page; scroll: boolean; fresh: boolean } | 'document' | 'reload' }

interface Options {
  initial: Page
  /**
   * puts the page on the screen (in the DOM once it resolves); `fresh`: mounted anew, else it keeps its state (a form
   * back with its errors, reload())
   */
  show: (page: Page, fresh: boolean) => Promise<void>
  /** `fondu({ prerender: true })`: GET navigations read `/_fondu/pages/<path>.json` */
  prerender: boolean
  /** a navigation started (true; `form`: a form's submission) or ended (false) */
  pending: (pending: boolean, form: boolean) => void
  /** a GET navigation to `pathname` started: its page's modules may load with its data */
  preload: (pathname: string) => void
}

const noop = () => {}
const navigation = () =>
  (globalThis as unknown as { navigation?: Navigation }).navigation as Navigation | undefined

/**
 * Same-origin links, GET and POST forms, Back and Forward, through the Navigation API: the page fetched as JSON and
 * shown in place. Without the Navigation API, links and forms load documents.
 */
export function startNavigation({ initial, show, prerender, pending, preload }: Options) {
  const nav = navigation()
  if (!nav) return
  let version = initial.version
  let submitting: AbortController | undefined
  let current = 0
  // the form being sent is aria-busy: for its submit buttons' pending state (CSS, or useNavigating()), and for
  // assistive technology
  const begin = (form: HTMLFormElement | null = null) => {
    const id = ++current
    form?.setAttribute('aria-busy', 'true')
    pending(true, form !== null)
    return () => {
      form?.removeAttribute('aria-busy')
      if (id === current) pending(false, false)
    }
  }

  const here = () => location.pathname + location.search
  const display = (page: Page, scroll: boolean, fresh: boolean, history: 'push' | 'replace') =>
    nav.navigate(page.url, { history, info: { fondu: { page, scroll, fresh } } satisfies Info })
  /**
   * A document load: a POST's after the page it was sent from (`push`); a GET's in place of the entry it committed:
   * `instead` when that entry was pushed. A document replacing it would take the entries before it, of this
   * document, for its own (Chromium): Back would change the URL only. So back to the entry it was pushed from, then
   * the document pushed from there.
   */
  const documentLoad = async (url: string, history: History) => {
    const info = { fondu: 'document' } satisfies Info
    if (history === 'instead') await nav.back({ info }).committed?.catch(noop)
    nav.navigate(url, { history: history === 'replace' ? 'replace' : 'push', info })
  }

  /** the page a response is, or undefined when it's handled here (a new build, not a page) */
  const read = async (
    response: Response,
    url: string,
    history: History,
  ): Promise<Page | undefined> => {
    const post = history === 'push'
    const to = response.headers.get('X-Fondu-Location')
    if (response.status === 409 && to) return void documentLoad(to, history)
    // a redirect to a #fragment, followed here: fetch() would lose it
    const redirect = response.headers.get('X-Fondu-Redirect')
    if (redirect) return void nav.navigate(redirect, { history: post ? 'push' : 'replace' })
    if (!response.headers.has('X-Fondu')) {
      // a proxy's error page, a file: the URL as a document (a POST's redirect: its target); the answer to a POST
      // itself can't be asked for again
      if (!post || response.redirected) return void documentLoad(url, history)
      const html = await response.text()
      document.open()
      document.write(html)
      document.close()
      return
    }
    const page = (await response.json()) as Page
    if (version && page.version && page.version !== version)
      return void documentLoad(page.url, history)
    version = page.version
    return page
  }
  const headers = () => ({ 'X-Fondu': 'true', ...(version && { 'X-Fondu-Version': version }) })
  const failed = (url: string, history: History) => (error: unknown) => {
    if ((error as Error).name !== 'AbortError') void documentLoad(url, history) // offline: the browser says so
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
      const { page, scroll, fresh } = info.fondu
      event.intercept({
        scroll: 'manual',
        // the same page (a form back with its errors): the focus stays where it was, as the scroll position does
        focusReset: fresh ? 'after-transition' : 'manual',
        async handler() {
          await show(page, fresh)
          if (scroll) scrollAfter(event)
        },
      })
      return
    }

    // a POST form: sent outside the navigation (no history entry for the POST), its answer shown by one
    if (event.formData) {
      event.preventDefault()
      const done = begin(formOf(event))
      const controller = (submitting = new AbortController())
      fetch(url, {
        method: 'POST',
        body: event.formData,
        headers: headers(),
        signal: controller.signal,
      })
        .then(async (response) => {
          const page = await read(response, response.url, 'push')
          if (!page || controller.signal.aborted) return
          // the same URL: in place, at the same scroll position; back with errors, the form and its values stay too
          const same = page.url === here()
          const errors = Object.keys((page.props.errors as object | undefined) ?? {}).length > 0
          // pending until the page is on the screen
          const shown = display(page, !same, !(same && errors), same ? 'replace' : 'push')
          await shown.finished?.catch(noop)
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
        const done = begin(formOf(event))
        const pushed: History = event.navigationType === 'push' ? 'instead' : 'replace'
        try {
          // Back and Forward too: the server's page, as for a link (nothing kept in memory to go stale, as a
          // private page after signing out); the scroll position is the browser's
          const path = url.pathname + url.search
          preload(url.pathname)
          const from = prerender ? pageDataPath(url.pathname) + url.search : url
          const response = await fetch(from, { headers: headers(), signal: event.signal })
          const page = await read(response, url.href, pushed)
          if (!page || event.signal.aborted) return
          // redirected: the page at its own URL, in place of this entry
          if (page.url !== path)
            return void (await display(page, true, true, 'replace').finished?.catch(noop))
          const reload = event.navigationType === 'reload'
          // Back and Forward commit after the navigate event: scrolled before, the page would show at the top first
          await (nav.transition as { committed?: Promise<unknown> } | null)?.committed
          await show(page, !reload)
          if (!reload) scrollAfter(event)
        } catch (error) {
          failed(url.href, pushed)(error)
        } finally {
          done()
        }
      },
    })
  })
}

/** the form a navigation sends (a POST's, a GET form's): the element it started from, a form or its submitter */
function formOf(event: NavigateEvent): HTMLFormElement | null {
  const from = (event as { sourceElement?: Element | null }).sourceElement
  if (from instanceof HTMLFormElement) return from
  return (from as HTMLButtonElement | null | undefined)?.form ?? null
}

/**
 * `href` loaded as a document. Every other navigation is the client's, `location.assign()` and `location.href = …`
 * too: this is for what a page can't change in place (`<html lang>`: another language).
 */
export function loadDocument(href: string) {
  const nav = navigation()
  if (nav) nav.navigate(href, { info: { fondu: 'document' } satisfies Info })
  else location.assign(href)
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
