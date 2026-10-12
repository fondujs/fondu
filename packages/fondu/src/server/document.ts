/// <reference path="../virtual.d.ts" />
import type { Context, MiddlewareHandler } from 'hono'
import type { Page } from '@inertiajs/core'
import { assetTags } from 'virtual:fondu/assets'
import { renderPage } from 'virtual:fondu/ssr'

/** The HTML document around a page. */
export interface DocumentParts {
  /** the page's `<Head>` tags (server render), then the client's styles and scripts */
  head: string
  /** the page data (`<script data-page>`) and the rendered page (`<div id="app">`) */
  body: string
  c: Context
}
export type DocumentTemplate = (parts: DocumentParts) => string

const defaultTemplate: DocumentTemplate = ({ head, body }) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${head}</head><body>${body}</body></html>`

/** the options of the app (`createApp`) a request belongs to */
export const settings = new WeakMap<Context, { document?: DocumentTemplate; errorPage: string | false }>()

const browserOnly = new WeakSet<Context>()

/**
 * Pages of these requests are rendered in the browser only (Laravel's `withoutSsr`): in `routes/admin/_middleware.ts`,
 * `export default withoutSsr()`; for one route, `defineHandler(withoutSsr(), …)`. No server rendering at all:
 * `fondu({ ssr: false })`.
 */
export const withoutSsr = (): MiddlewareHandler => async (c, next) => {
  browserOnly.add(c)
  await next()
}

/** Inertia's own encoding of the page data (`buildSSRBody`): `/` and `<` escaped, no HTML entities. */
const pageScript = (page: Page) =>
  `<script data-page="app" type="application/json">${JSON.stringify(page).replace(/\//g, '\\/').replace(/</g, '\\u003c')}</script>`

export async function renderDocument(c: Context, page: Page): Promise<string> {
  const nonce = (c.get as (key: string) => unknown)('secureHeadersNonce') as string | undefined
  let ssr: { head: string[]; body: string } | null = null
  try {
    if (renderPage && !browserOnly.has(c)) ssr = await renderPage(page)
  } catch (error) {
    // like Laravel: a page that fails to render on the server is still sent, and rendered in the browser
    console.error(`[fondu] server render of "${page.component}" failed, sending it to render in the browser:`, error)
  }
  // the page data first, as Inertia writes it: its client reads the first `script[data-page]` in the document, so
  // nothing in the page's content can come before it
  const body = ssr?.body ?? `${pageScript(page)}<div id="app"></div>`
  const template = settings.get(c)?.document ?? defaultTemplate
  return template({ head: (ssr?.head.join('') ?? '') + assetTags(page.component, nonce), body, c })
}
