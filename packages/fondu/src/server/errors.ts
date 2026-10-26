import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { settings } from './document.js'
import { wantsPage } from './http.js'
import { renderPage } from './protocol.js'

/** the error page's id: `app/routes/_error.tsx` */
export const ERROR_PAGE = '_error'

const TEXT: Record<number, string> = {
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  419: 'Page Expired',
  429: 'Too Many Requests',
  503: 'Service Unavailable',
}

/**
 * The answer to an unmatched URL or a thrown error (installed by `createApp`):
 * - API clients: the `HTTPException`'s response, or plain text
 * - pages, in development: a report of the error (a navigation loads it as a document)
 * - pages: the error page (`app/routes/_error.tsx`, `{ status }`) with the shared props
 */
export async function errorResponse(
  c: Context,
  status: number,
  error?: unknown,
): Promise<Response> {
  if (status >= 500) console.error(error)
  const code = status as ContentfulStatusCode
  const text = TEXT[status] ?? (status >= 500 ? 'Internal Server Error' : 'Error')
  if (!wantsPage(c))
    return error instanceof HTTPException ? error.getResponse() : c.text(text, code)
  if (import.meta.env.DEV && status >= 500) return c.html(report(c, error), 500)
  if (settings.get(c)?.errorPage) {
    try {
      return await renderPage(c, ERROR_PAGE, { status }, { status })
    } catch (failure) {
      console.error('[fondu] the error page failed to render:', failure)
    }
  }
  return c.text(text, code)
}

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

/**
 * the development error report: what failed, where (your files first), for which request; reloaded once an edit is
 * saved (Vite's client, as the app's pages have it)
 */
function report(c: Context, error: unknown): string {
  const err = error instanceof Error ? error : new Error(String(error))
  const frames = (err.stack ?? '')
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
  const nonce = (c.get as (key: string) => unknown)('secureHeadersNonce') as string | undefined
  const url = new URL(c.req.url)
  const frame = (line: string) => {
    const own = /\/app\//.test(line) && !line.includes('node_modules')
    return `<li class="${own ? 'own' : ''}">${escape(line.replace(/^at /, ''))}</li>`
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Something went wrong</title>
<style${nonce ? ` nonce="${nonce}"` : ''}>
*{box-sizing:border-box}body{margin:0;padding:clamp(16px,6vw,80px);font:14px/1.55 ui-sans-serif,system-ui,sans-serif;color:#1f2328;background:#f9f9f9;--x:clamp(16px,4vw,32px)}
article{background:#fff;border:1px solid #eaecef;border-radius:6px;overflow:hidden}
header{padding:28px var(--x) 22px;border-bottom:1px solid #eaecef;border-top:4px solid #d1242f}
.kind{font:600 12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#d1242f;margin:0 0 8px}
h1{margin:0;font-size:20px;font-weight:600;line-height:1.35;white-space:pre-wrap;word-break:break-word}
.req{margin:12px 0 0;font:13px ui-monospace,SFMono-Regular,Menlo,monospace;color:#57606a}
.req b{color:#1f2328;font-weight:600}
main{padding:20px var(--x) 28px}h2{margin:0 0 10px;font-size:12px;font-weight:600;color:#57606a}
ol{display:grid;grid-template-columns:minmax(100%,max-content);margin:0;padding:0;list-style:none;font:12.5px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;color:#8c959f;overflow-x:auto}
li{white-space:pre;padding:1px 8px;border-radius:4px}li.own{color:#1f2328;background:#fff8c5}
footer{padding:0 var(--x) 24px;color:#afb8c1;font-size:12px;font-weight:400}
</style></head><body><article>
<header><p class="kind">${escape(err.name)} · 500</p><h1>${escape(err.message)}</h1>
<p class="req"><b>${escape(c.req.method)}</b> ${escape(url.pathname + url.search)}${c.req.header('x-fondu') ? ' · navigation' : ''}</p></header>
<main><h2>Stack — your files are highlighted</h2><ol>${frames.map(frame).join('')}</ol></main>
<footer>Shown in development only. In production this request gets your error page with status 500.</footer>
</article>
<script type="module"${nonce ? ` nonce="${nonce}"` : ''}>
import { createHotContext } from '${import.meta.env.BASE_URL}@vite/client'
// fixed and saved: the page again (what the edit reached, a route or the browser's code)
const hot = createHotContext('/@fondu/error-report')
hot.on('fondu:props', () => location.reload())
hot.on('vite:afterUpdate', () => location.reload())
// Back and Forward to the app's entries before it (this document may be given them): their URL as a document
addEventListener('popstate', () => location.reload())
</script></body></html>`
}
