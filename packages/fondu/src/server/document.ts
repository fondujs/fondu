/// <reference path="../virtual.d.ts" />
import type { Context, MiddlewareHandler } from 'hono'
import type { ReactElement } from 'react'
import { assetTags } from 'virtual:fondu/assets'
import { renderMarkup, renderPage } from 'virtual:fondu/ssr'

import type { Page } from '../client/navigation.js'
import { SCROLL_KEY, SCROLL_STORAGE } from '../paths.js'

/**
 * The HTML document around a page: `{head}` and `{body}` (in JSX, or `${head}` in a string) are where the page goes.
 * An inline `<script>` of a JSX document gets the request's nonce, so the Content Security Policy runs it; a string's
 * writes it: `<script nonce="${nonce}">`.
 */
export interface DocumentParts {
  /** the tags the page renders (`<title>`, `<meta>`: server render), then the client's styles and scripts */
  head: string
  /** the page data (`<script data-page>`) and the rendered page (`<div id="app">`) */
  body: string
  c: Context
  /** the request's Content Security Policy nonce (`''` without one) */
  nonce: string
}
/** the document as JSX (`<html>…</html>`), or as an HTML string */
export type DocumentTemplate = (parts: DocumentParts) => ReactElement | string

const defaultTemplate: DocumentTemplate = ({ head, body }) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${head}</head><body>${body}</body></html>`

/** the options of the app (`createApp`) a request belongs to */
export const settings = new WeakMap<Context, { document?: DocumentTemplate; errorPage: boolean }>()

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

/** the page data, `/` and `<` escaped (no `</script>` in it), no HTML entities */
const pageScript = (page: Page) =>
  `<script data-page="app" type="application/json">${JSON.stringify(page).replace(/\//g, '\\/').replace(/</g, '\\u003c')}</script>`

/**
 * A reload, Back to a page of another site: this entry's position, where fondu/client left it, before the first
 * paint (the stylesheets are in: the page is laid out), and again once the page has loaded: browsers scroll on
 * their own until then (to the #fragment, WebKit and Firefox), fondu/client keeping their restoration off. Not once
 * the visitor has scrolled, typed or clicked: their own scrolling wins.
 */
const restoreScroll = (nonce: string | undefined) =>
  `<script${nonce ? ` nonce="${nonce}"` : ''}>try{var k=history.state&&history.state[${JSON.stringify(SCROLL_KEY)}],p=k&&JSON.parse(sessionStorage.getItem(${JSON.stringify(SCROLL_STORAGE)}+k));if(p){var go=function(){scrollTo(+p.x||0,+p.y||0)},off=function(){go=0};go();["wheel","touchstart","keydown","mousedown"].forEach(function(t){addEventListener(t,off,{once:!0,passive:!0})});addEventListener("load",function(){setTimeout(function(){go&&go()})})}}catch(e){}</script>`

// where the page goes, in the document a template returns: replaced before the page is in, so a page's content is
// never read as one
const HEAD = 'fondu:document-head'
const BODY = 'fondu:document-body'

/**
 * The document's own markup. JSX: rendered (no whitespace between tags), its inline scripts given the nonce. A string
 * is taken as it is: what it interpolates isn't escaped, so a nonce added there would run whatever got in.
 */
async function shell(
  template: DocumentTemplate,
  c: Context,
  nonce: string | undefined,
): Promise<string> {
  const out = template({ head: HEAD, body: BODY, c, nonce: nonce ?? '' })
  if (typeof out === 'string') return out
  const html = `<!doctype html>${await renderMarkup(out)}`
  if (!nonce) return html
  return html.replace(/<script\b(?![^>]*\s(?:src|nonce)=)/gi, `<script nonce="${nonce}"`)
}

export async function renderDocument(c: Context, page: Page): Promise<string> {
  const nonce = (c.get as (key: string) => unknown)('secureHeadersNonce') as string | undefined
  let ssr: { head: string; body: string } | null = null
  try {
    // the page as the browser gets it, through JSON (a Date a string): the markup is the same on both sides
    if (renderPage && !browserOnly.has(c)) ssr = await renderPage(JSON.parse(JSON.stringify(page)))
  } catch (error) {
    // like Laravel: a page that fails to render on the server is still sent, and rendered in the browser
    console.error(
      `[fondu] server render of "${page.component}" failed, sending it to render in the browser:`,
      error,
    )
  }
  // the page data first: the client reads the first `script[data-page]` in the document, so nothing in the page's
  // content can come before it
  // the position back for a page rendered here (one rendered in the browser has nothing to scroll yet)
  const body = pageScript(page) + (ssr ? ssr.body + restoreScroll(nonce) : '<div id="app"></div>')
  const template = settings.get(c)?.document ?? defaultTemplate
  const html = await shell(template, c, nonce)
  const [before, between, after, ...more] = html.split(new RegExp(`${HEAD}|${BODY}`))
  if (after === undefined || more.length || html.indexOf(HEAD) > html.indexOf(BODY))
    throw new Error(
      'fondu: the document must have `head` once, in <head>, and `body` once, in <body>',
    )
  // the stylesheets first, right after <meta charset>: found, and asked for, before anything else of the head, the
  // document's own tags included (React puts a JSX document's links and metas before `head`). A browser that lays
  // the page out early (Firefox's, with its tools open) has them sooner
  const tags = assetTags(page.component, nonce)
  const css = tags.match(/<link rel="stylesheet"[^>]*>/g)?.join('') ?? ''
  const charset = /<meta charset=[^>]*>/i
  const top =
    css && charset.test(before) ? before.replace(charset, (meta) => meta + css) : before + css
  return (
    top +
    tags.replace(/<link rel="stylesheet"[^>]*>/g, '') +
    (ssr?.head ?? '') +
    between +
    body +
    after
  )
}
