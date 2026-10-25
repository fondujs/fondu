// Browser end-to-end checks of the Cloudflare example. Start it first (`bun run dev` or `bun run preview`), then:
//   CHROME_PATH=/path/to/chrome node e2e/run.mjs http://localhost:5173 [label]
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const LABEL = process.argv[3] ?? BASE
const ORIGIN = new URL(BASE).origin
if (!process.env.CHROME_PATH) {
  console.error('Set CHROME_PATH to a Chrome/Chromium executable.')
  process.exit(2)
}

const results = []
const ok = (name, cond, extra = '') => {
  results.push(Boolean(cond))
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  — ${extra}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox'],
  headless: true,
})
const page = await browser.newPage()
await page.setViewport({ width: 1100, height: 720 })

const problems = []
const watchProblems = (p) => {
  p.on('console', (m) => {
    // the browser's own log line for the intentional 401 / 404 / 409 / 422 / 500 responses below
    if (
      ['error', 'warning'].includes(m.type()) &&
      !/favicon|status of (401|403|404|409|422|500|502)\b/.test(m.text())
    )
      problems.push(`[${m.type()}] ${m.text().slice(0, 240)}`)
  })
  p.on('pageerror', (e) => problems.push(`[pageerror] ${String(e).slice(0, 240)}`))
}
watchProblems(page)
const docs = []
const fetches = []
page.on('request', (r) => {
  if (r.resourceType() === 'document') docs.push(r.url())
  if (r.headers()['x-fondu'])
    fetches.push({ url: r.url().replace(BASE, ''), method: r.method(), headers: r.headers() })
})
// the page objects fondu/client receives
const pageJson = []
page.on('response', async (r) => {
  if (!r.request().headers()['x-fondu']) return
  try {
    pageJson.push({
      url: r.url().replace(BASE, ''),
      status: r.status(),
      req: r.request().headers(),
      headers: r.headers(),
      body: r.status() === 200 ? await r.json() : null,
    })
  } catch {}
})

await page.evaluateOnNewDocument(() => {
  window.__fcp = null
  new PerformanceObserver((list) => {
    for (const e of list.getEntries())
      if (e.name === 'first-contentful-paint' && window.__fcp === null)
        window.__fcp = getComputedStyle(document.body).margin
  }).observe({ type: 'paint', buffered: true })
})

const text = (p = page) => p.evaluate(() => document.body.innerText)
const waitText = (t, p = page, timeout = 8000) =>
  p.waitForFunction((t) => document.body?.innerText.includes(t), { timeout }, t)
const path = (p = page) => p.evaluate(() => location.pathname + location.search)
const h1 = (t, p = page) =>
  p.waitForFunction((t) => document.querySelector('h1')?.textContent === t, { timeout: 8000 }, t)
const testid = (id, p = page) =>
  p.$eval(`[data-testid=${id}]`, (e) => e.textContent).catch(() => null)
const nav = (href, p = page) =>
  p.evaluate((h) => document.querySelector(`aside a[href="${h}"]`).click(), href)
const setValue = async (sel, v, p = page) => {
  await p.click(sel, { count: 3 }) // select what is there: typing replaces it, as a person would
  await p.keyboard.press('Backspace')
  await p.type(sel, v)
}
const signIn = async (p = page) => {
  await p.goto(BASE + '/login', { waitUntil: 'networkidle0' })
  if (!(await p.$('input[name=password]'))) return
  await p.type('input[name=email]', 'demo@fondu.dev')
  await p.type('input[name=password]', 'fondu-demo')
  await Promise.all([
    p.waitForFunction(() => location.pathname === '/account'),
    p.click('main form button'),
  ])
}
const signOut = async (p = page) => {
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  if (await p.$('[data-testid=user]')) {
    await p.click('[data-testid=user]') // the account menu
    await (await p.waitForSelector('[data-testid=sign-out]')).click()
    await p.waitForSelector('[data-testid=sign-in]')
  }
}
let assetVersion = null
const fondu = (extra = {}) => ({
  'X-Fondu': 'true',
  ...(assetVersion && { 'X-Fondu-Version': assetVersion }),
  ...extra,
})
const cookieHeader = async () =>
  (await page.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join('; ')
const fetchAs = async (url, init = {}) =>
  fetch(url, { ...init, headers: { ...init.headers, cookie: await cookieHeader() } })
const lastJson = (url) =>
  pageJson.filter((p) => p.body && (p.url === url || p.url.startsWith(url + '?'))).at(-1)

// warm-up (lets dev mode optimise dependencies before measuring)
for (const p of [
  '/',
  '/props',
  '/contacts',
  '/errors',
  '/signup',
  '/redirects',
  '/ssr',
  '/ssr/browser',
  '/http',
  '/navigation',
  '/routes',
  '/i18n',
  '/login',
])
  await page.goto(BASE + p, { waitUntil: 'networkidle0' })
await signIn()
await page.goto(BASE + '/contacts/1', { waitUntil: 'networkidle0' })
await sleep(1000)
assetVersion = await page.evaluate(
  () => JSON.parse(document.querySelector('script[data-page]').textContent).version,
)
await signOut()
problems.length = 0
docs.length = 0
console.log(`\n===== ${LABEL} =====`)

// ---- the document
{
  const res = await fetch(BASE + '/props')
  const html = await res.text()
  ok(
    'document: shared props are in the server HTML (guest: the sign-in button)',
    html.includes('data-testid="sign-in"'),
  )
  const head = html.slice(0, html.indexOf('</head>'))
  const entry = head
    .match(/<script type="module" src="([^"]+)"/g)
    ?.at(-1)
    ?.match(/src="([^"]+)"/)?.[1]
  ok(
    'document: the client scripts are in <head>, the app entry once (not also preloaded)',
    Boolean(entry) && html.split(entry).length === 2,
    entry,
  )
  const body = html.slice(html.indexOf('<body>'))
  ok(
    'document: the page data first in <body>, then the rendered page',
    /^<body><script data-page="app" type="application\/json">[^<]*<\/script><div id="app"><\w/.test(
      body,
    ),
  )
  ok(
    'document: Cache-Control private, no-cache; Vary: X-Fondu',
    res.headers.get('cache-control') === 'private, no-cache' &&
      /X-Fondu/i.test(res.headers.get('vary') ?? ''),
  )
  const asset = html.match(/href="(\/assets\/[^"]+\.css)"/)?.[1]
  const assetCache = asset ? ((await fetch(BASE + asset)).headers.get('cache-control') ?? '') : ''
  ok(
    'document: hashed /assets/* are immutable (production) — dev serves sources',
    asset ? assetCache.includes('immutable') : true,
    `${asset} ${assetCache}`,
  )
  const [icon, robots] = await Promise.all([
    fetch(BASE + '/favicon.ico'),
    fetch(BASE + '/robots.txt'),
  ])
  ok(
    'document: public/ files are served from the site root',
    icon.status === 200 && robots.status === 200,
  )
}

// ---- navigation, titles
await page.goto(BASE + '/', { waitUntil: 'networkidle0' })
await page.waitForFunction(() => window.__fcp !== null, { timeout: 5000 }).catch(() => {})
ok(
  'no flash of unstyled content (styles applied at first paint)',
  (await page.evaluate(() => window.__fcp)) === '0px',
  String(await page.evaluate(() => window.__fcp)),
)
ok('title on a document load', (await page.title()) === 'Fondu demo', await page.title())
{
  const links = await page.evaluate(() =>
    ['docs', 'github'].map((id) => {
      const a = document.querySelector(`aside [data-testid=${id}]`)
      return [a?.href, a?.target]
    }),
  )
  ok(
    'the menu links to the docs and to the repository (in a new tab)',
    JSON.stringify(links) ===
      '[["https://fondu.dev/docs",""],["https://github.com/fondujs/fondu","_blank"]]',
    JSON.stringify(links),
  )
}
fetches.length = 0
docs.length = 0
await nav('/props')
await h1('Props')
const propsFetches = fetches.filter((f) => f.url === '/props')
ok(
  'a sidebar link: one page object fetched, no document',
  propsFetches.length === 1 && docs.length === 0,
  JSON.stringify({ propsFetches, docs }),
)
await page
  .waitForFunction(() => document.title === 'Props · Fondu demo', { timeout: 3000 })
  .catch(() => {})
ok(
  'title after a navigation, one <title>',
  (await page.title()) === 'Props · Fondu demo' &&
    (await page.evaluate(() => document.querySelectorAll('title').length)) === 1,
  await page.title(),
)
ok(
  'props: values, an object, a date as JSON delivers it, shared props',
  (await text()).includes('Hello from Hono') &&
    (await text()).includes('"roles": [') &&
    /T\d\d:/.test(await testid('computed-at')) &&
    (await text()).includes('"user": null') &&
    (await text()).includes('"auth"'),
)
ok(
  'the badge says how the document was rendered: SSR, hydrated',
  (await testid('render-mode')) === 'SSR: hydrated',
)

// ---- forms and validation: guests see the contacts; adding, changing, deleting need an account
await nav('/contacts')
await h1('Forms & validation')
{
  const guestPost = await fetch(BASE + '/contacts', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ name: 'Guest', email: `guest-${Date.now()}@x.org` }),
  })
  ok(
    'contacts: a guest gets the list and a way to sign in, not the forms; its POST is sent to sign in',
    (await page.$('[data-testid=sign-in-first]')) !== null &&
      (await page.$('[data-testid=add-contact]')) === null &&
      (await page.$('[data-testid=contacts] button')) === null &&
      guestPost.status === 303 &&
      (guestPost.headers.get('location') ?? '').includes('/login?next='),
    `${guestPost.status} ${guestPost.headers.get('location')}`,
  )
}
await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.30' }) // its own address: Better Auth's rate limit
await signIn()
await page.setExtraHTTPHeaders({})
await page.goto(BASE + '/contacts', { waitUntil: 'networkidle0' })
{
  const entries = await page.evaluate(() => navigation.entries().length)
  await setValue('[data-testid=add-contact] input[name=name]', 'x')
  await page.click('[data-testid=add-contact] button')
  await page.waitForSelector('[data-testid=err-email]')
  const formErrors = [await testid('err-name'), await testid('err-email')]
  ok(
    'a form: an invalid submit comes back with the field errors, what was typed kept, URL and history unchanged',
    formErrors.every(Boolean) &&
      (await path()) === '/contacts' &&
      (await page.$eval('[data-testid=add-contact] input[name=name]', (e) => e.value)) === 'x' &&
      (await page.evaluate(() => navigation.entries().length)) === entries,
    JSON.stringify(formErrors),
  )
}
await page
  .waitForFunction(() => document.activeElement?.name === 'name', { timeout: 2000 })
  .catch(() => {})
ok(
  'an invalid submit: the first field to fix has the focus',
  await page.evaluate(() => document.activeElement?.name === 'name'),
  await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)),
)
await setValue('[data-testid=add-contact] input[name=name]', 'Grace Hopper')
const graceEmail = `grace-${Date.now()}@x.org`
await setValue('[data-testid=add-contact] input[name=email]', graceEmail)
await page.$eval('[data-testid=add-contact] button', (b) => b.click())
await waitText('Added Grace Hopper')
ok(
  'a form: a valid submit -> 303 back, flash, list updated, the form empty again',
  (await text()).includes(graceEmail) &&
    (await page.$eval('[data-testid=add-contact] input[name=name]', (e) => e.value)) === '',
)
{
  // the same address again, typed in capitals: refused by the server's schema
  await setValue('[data-testid=add-contact] input[name=name]', 'Grace Again')
  await setValue('[data-testid=add-contact] input[name=email]', graceEmail.toUpperCase())
  await page.focus('[data-testid=add-contact] input[name=name]')
  await page.$eval('[data-testid=add-contact] button', (b) => b.click())
  await page.waitForSelector('[data-testid=err-email]', { timeout: 6000 }).catch(() => {})
  await page
    .waitForFunction(() => document.activeElement?.name === 'email', { timeout: 4000 })
    .catch(() => {})
  ok(
    'an address already in the contacts (any case): refused, the focus on it',
    (await testid('err-email')) === 'Already in your contacts' &&
      (await page.evaluate(() => document.activeElement?.name)) === 'email' &&
      !(await text()).includes('Added Grace Again'),
  )
}
{
  const rows = (await page.$$('[data-testid=contacts] li')).length
  await page.$eval('[data-testid=contacts] li:last-child button', (b) => b.click())
  const asked = await page.waitForSelector('[role=alertdialog]', { timeout: 3000 }).then(
    () => true,
    () => false,
  )
  await page.click('[data-testid=confirm-delete]')
  await waitText('Contact deleted')
  ok(
    'delete: confirmed first, then the row is gone',
    asked && (await page.$$('[data-testid=contacts] li')).length === rows - 1,
    `${asked} ${rows}`,
  )
}
const api = await fetch(BASE + '/api/contacts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  body: JSON.stringify({ name: '', email: '' }),
})
ok('an API client gets 401 when signed out', api.status === 401)
await page.evaluate(() => document.querySelector('[data-testid=contacts] a').click())
await page.waitForSelector('[data-testid=contact-name]')
const histBefore = await page.evaluate(() => history.length)
await setValue('[data-testid=rename] input', 'x')
await page.click('[data-testid=rename] button')
await page.waitForSelector('[data-testid=err-rename]')
ok(
  'two forms: the rename errors show under its field only',
  (await page.$('[data-testid=err-email]')) === null && Boolean(await testid('err-rename')),
  await testid('err-rename'),
)
await page
  .waitForFunction(
    () => document.activeElement === document.querySelector('[data-testid=rename] input'),
    { timeout: 2000 },
  )
  .catch(() => {})
ok(
  "the server's errors put the focus on the field",
  await page.evaluate(
    () => document.activeElement === document.querySelector('[data-testid=rename] input'),
  ),
)
await setValue('[data-testid=email] input', 'nope')
await page.click('[data-testid=email] button')
await page.waitForSelector('[data-testid=err-email]')
ok(
  'two forms: the other form, its own field',
  (await testid('err-email')) === 'Enter a valid email' &&
    (await page.$('[data-testid=err-rename]')) === null,
)
const original = await testid('contact-name')
await page.goto(BASE + page.url().replace(BASE, ''), { waitUntil: 'networkidle0' })
await setValue('[data-testid=rename] input', original + ' B')
await page.click('[data-testid=rename] button')
await page.waitForFunction(
  (n) => document.querySelector('[data-testid=contact-name]').textContent === n,
  {},
  original + ' B',
)
ok(
  'renamed in place, no extra history entries',
  (await page.evaluate(() => history.length)) === histBefore,
)
await setValue('[data-testid=rename] input', original)
await page.click('[data-testid=rename] button')
await waitText('Renamed')
const missing = await fetch(BASE + '/contacts/999999', { headers: { Accept: 'text/html' } })
ok(
  'a 404 thrown in a loader: the 404 page, status 404',
  missing.status === 404 && (await missing.text()).includes('Page not found'),
)

// ---- without JavaScript
{
  const nojs = await browser.newPage()
  await nojs.setJavaScriptEnabled(false)
  await nojs.goto(BASE + '/contacts', { waitUntil: 'load' })
  ok(
    'no JS: the form is a real form (method=post, action)',
    await nojs.$eval(
      '[data-testid=add-contact]',
      (f) => f.method === 'post' && new URL(f.action).pathname === '/contacts',
    ),
  )
  await nojs.type('[data-testid=add-contact] input[name=name]', 'Q')
  await nojs.type('[data-testid=add-contact] input[name=email]', 'not-an-email')
  let [n] = await Promise.all([
    nojs.waitForNavigation(),
    nojs.click('[data-testid=add-contact] button'),
  ])
  ok(
    'no JS: an invalid submit -> back to the page with the errors',
    new URL(n.url()).pathname === '/contacts' &&
      (await testid('err-email', nojs)) === 'Enter a valid email',
  )
  await nojs.type('[data-testid=add-contact] input[name=name]', 'Nora NoJS')
  await nojs.type('[data-testid=add-contact] input[name=email]', `nora-${Date.now()}@x.org`)
  ;[n] = await Promise.all([
    nojs.waitForNavigation(),
    nojs.click('[data-testid=add-contact] button'),
  ])
  ok('no JS: a valid submit -> back, flash', (await text(nojs)).includes('Added Nora NoJS'))
  const rows = (await nojs.$$('[data-testid=contacts] li')).length
  ;[n] = await Promise.all([
    nojs.waitForNavigation(),
    nojs.$$eval('[data-testid=contacts] li', (lis) => lis.at(-1).querySelector('button').click()),
  ])
  ok(
    'no JS: one of the actions (POST /contacts?delete)',
    (await nojs.$$('[data-testid=contacts] li')).length === rows - 1 &&
      (await text(nojs)).includes('Contact deleted'),
  )
  await nojs.close()
  const early = await browser.newPage()
  await early.setRequestInterception(true)
  early.on('request', (r) => {
    if (r.resourceType() === 'script' && /\/app\/app\.tsx|\/assets\/app-/.test(r.url()))
      setTimeout(() => r.continue().catch(() => {}), 5000)
    else r.continue().catch(() => {})
  })
  const loading = early
    .goto(BASE + '/contacts', { waitUntil: 'load', timeout: 60000 })
    .catch(() => {})
  await early.waitForSelector('[data-testid=add-contact] button')
  await early.$eval('[data-testid=add-contact] input[name=name]', (e) => {
    e.value = 'Early Bird'
  })
  await early.$eval('[data-testid=add-contact] input[name=email]', (e) => {
    e.value = `early-${Date.now()}@x.org`
  })
  ;[n] = await Promise.all([
    early.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    early.click('[data-testid=add-contact] button'),
  ])
  const added = await early
    .waitForFunction(() => document.body?.innerText.includes('Added Early Bird'), {
      timeout: 10000,
    })
    .then(
      () => true,
      () => false,
    )
  ok(
    'before hydration: the click is a native POST (not lost), back + flash',
    added && n.request().redirectChain()[0]?.method() === 'POST',
  )
  await loading
  await early.close()
}
await signOut()

// ---- redirects
await page.goto(BASE + '/redirects', { waitUntil: 'networkidle0' })
docs.length = 0
await page.click('[data-testid=back]')
await waitText('Redirected back with a flash message')
ok(
  'back(c): 303 to the page, flash, no document load',
  (await path()) === '/redirects' && docs.length === 0,
)
await page.click('[data-testid=to-props]')
await h1('Props')
ok(
  'redirect to another page: a navigation, flash carried',
  (await path()) === '/props' &&
    (await text()).includes('Redirected from /redirects') &&
    docs.length === 0,
)
await page.goto(BASE + '/redirects', { waitUntil: 'networkidle0' })
docs.length = 0
await page.click('[data-testid=external]')
await page
  .waitForFunction(() => location.pathname === '/api/health', { timeout: 5000 })
  .catch(() => {})
ok(
  'location(c, url): 409 + X-Fondu-Location, the browser loads it as a document',
  (await path()) === '/api/health' && docs.some((d) => d.endsWith('/api/health')),
)
await page.goBack({ waitUntil: 'load' })
await sleep(400)
ok(
  'back from a document-loaded JSON URL: the previous page is not blank',
  (await path()) === '/redirects' && (await text()).includes('Redirects'),
)

// ---- asset versioning
await page.goto(BASE + '/versioning', { waitUntil: 'networkidle0' })
await page.click('[data-testid=stale]')
await page.waitForSelector('[data-testid=stale-answer]')
const stale = JSON.parse(await testid('stale-answer'))
ok(
  'a navigation from another build: 409 + X-Fondu-Location (production); dev has no version',
  assetVersion
    ? stale.status === 409 && stale['X-Fondu-Location'].endsWith('/versioning')
    : stale.status === 200,
  JSON.stringify(stale),
)
{
  await page.setRequestInterception(true)
  let once = true
  const fake = (r) => {
    if (r.isInterceptResolutionHandled()) return
    if (once && r.headers()['x-fondu'] && new URL(r.url()).pathname === '/props') {
      once = false
      return void r.respond({
        status: 409,
        headers: { 'X-Fondu-Location': BASE + '/props' },
        body: '',
      })
    }
    r.continue().catch(() => {})
  }
  page.on('request', fake)
  docs.length = 0
  await nav('/props')
  await h1('Props')
  page.off('request', fake)
  await page.setRequestInterception(false)
  ok(
    'a 409 from the server: the page is loaded as a document',
    docs.length === 1 && docs[0].endsWith('/props'),
    JSON.stringify(docs),
  )
}

// ---- server-side rendering
{
  const ssr = await (await fetch(BASE + '/ssr')).text()
  const browserOnly = await (await fetch(BASE + '/ssr/browser')).text()
  ok(
    'SSR: a document is server-rendered',
    /<div id="app"><\w/.test(ssr) && ssr.includes('Server-side rendering</h1>'),
  )
  ok(
    'withoutSsr(): this route is rendered in the browser only (the page data, an empty #app)',
    browserOnly.includes('</script><div id="app"></div></body>') &&
      browserOnly.includes('"component":"ssr"'),
  )
  await page.goto(BASE + '/ssr/browser', { waitUntil: 'networkidle0' })
  ok(
    "withoutSsr(): rendered in the browser with the loader's props",
    (await testid('route-ssr'))?.includes('withoutSsr') &&
      (await testid('render-mode')) === 'Rendered in the browser' &&
      /\d+px/.test(await testid('mounted')),
  )
  ok(
    'a browser-only part: the fallback is in the server HTML, the browser part is not',
    ssr.includes('Rendered on the server: no window here.') && !ssr.includes('Window width'),
  )
}

// ---- navigation
await page.goto(BASE + '/routes', { waitUntil: 'networkidle0' })
ok(
  'href(): the link has the filled URL',
  (await page.$eval('[data-testid=contact-1]', (e) => e.getAttribute('href'))) === '/contacts/1',
)
await nav('/navigation')
await h1('Navigation')
await page.click('[data-testid=click]')
await page.click('[data-testid=click]')
{
  const served = await testid('served-at')
  await page.click('[data-testid=reload]')
  await page.waitForFunction(
    (s) => document.querySelector('[data-testid=served-at]').textContent !== s,
    {},
    served,
  )
  ok('reload(): new props, the component state kept', (await testid('clicks')) === '2')
}
await page.click('[data-testid=reset-state]')
await page
  .waitForFunction(() => document.querySelector('[data-testid=clicks]').textContent === '0', {
    timeout: 5000,
  })
  .catch(() => {})
ok('a link to the same page mounts it anew', (await testid('clicks')) === '0')
{
  await page.click('[data-testid=slow]')
  await sleep(300)
  const during = await testid('navigating')
  await page.waitForFunction(
    () => document.querySelector('[data-testid=navigating]').textContent === 'idle',
    { timeout: 5000 },
  )
  ok('useNavigating(): true while the next page is on its way', during === 'navigating')
}
{
  const served = await testid('served-at')
  await page.evaluate(() => window.scrollTo(0, 200))
  await page.click('[data-testid=to-props]')
  await h1('Props')
  fetches.length = 0
  docs.length = 0
  await page.goBack()
  await h1('Navigation')
  const atOnce = await testid('served-at')
  await page.waitForFunction(
    (s) => document.querySelector('[data-testid=served-at]').textContent !== s,
    { timeout: 5000 },
    served,
  )
  ok(
    "Back: the page as it was at once, then the server's, no document",
    atOnce === served && fetches.some((f) => f.url.startsWith('/navigation')) && docs.length === 0,
    JSON.stringify({ atOnce, served, fetches, docs }),
  )
}

// ---- sign in, the API, the account
docs.length = 0
await nav('/account')
await h1('Sign in')
ok(
  'a protected page: a guest is sent to /login?next=… (a navigation)',
  (await path()) === '/login?next=%2Faccount' && docs.length === 0,
  await path(),
)
await page.click('main form button')
await page.waitForSelector('[data-testid=err-password]')
ok(
  'login: an empty submit comes back with the field errors',
  (await text()).includes('Enter a valid email') && (await text()).includes('Enter your password'),
)
ok(
  'an invalid field is marked (aria-invalid: its styles, screen readers)',
  (await page.$eval('input[name=email]', (e) => e.getAttribute('aria-invalid'))) === 'true',
)
await setValue('input[name=email]', 'demo@fondu.dev')
await setValue('input[name=password]', 'wrong')
await page.click('main form button')
await waitText('Invalid email or password')
ok(
  'login: a wrong password -> one generic error, the email kept',
  (await path()) === '/login?next=%2Faccount' &&
    (await page.$eval('input[name=email]', (e) => e.value)) === 'demo@fondu.dev',
)
await setValue('input[name=password]', 'fondu-demo')
await page.click('main form button')
await waitText('Signed in as Demo User')
ok(
  'login: redirect to ?next, flash, the shared user in the header',
  (await path()) === '/account' &&
    (await page.$eval('[data-testid=user]', (e) => e.getAttribute('aria-label'))) === 'Demo User' &&
    (await testid('account-email')) === 'demo@fondu.dev',
)
await nav('/props')
await h1('Props')
ok(
  'flash is sent once (the toast stays until it times out)',
  Object.keys(lastJson('/props')?.body.flash ?? {}).length === 0,
  JSON.stringify(lastJson('/props')?.body.flash),
)
await nav('/http')
await h1('HTTP requests')
await page.click('[data-testid=load]')
ok('fetch: loading while the request runs', (await testid('load')) === 'Loading…')
await page.waitForSelector('[data-testid=api-users]')
ok('fetch: the response', (await page.$$('[data-testid=api-users] li')).length > 0)
await page.click('[data-testid=create] button')
await page.waitForSelector('[data-testid=err-email]')
ok(
  'fetch: a 422 { errors } becomes field errors',
  (await testid('err-name')) === 'Name must be at least 2 characters' &&
    (await testid('err-email')) === 'Enter a valid email',
)
await page
  .waitForFunction(
    () => document.activeElement === document.querySelector('[data-testid=create] input'),
    {
      timeout: 2000,
    },
  )
  .catch(() => {})
ok(
  'the first field to fix has the focus',
  await page.evaluate(
    () => document.activeElement === document.querySelector('[data-testid=create] input'),
  ),
)
await nav('/account')
await h1('Account')
await setValue('main form input[name=name]', 'Demo Person')
await page.click('main form button')
await waitText('Profile saved')
await page
  .waitForFunction(
    () => document.querySelector('[data-testid=user]')?.ariaLabel === 'Demo Person',
    {
      timeout: 4000,
    },
  )
  .catch(() => {})
ok(
  "the profile saved by Better Auth, the header's user renewed with it (its session cookie)",
  (await page.$eval('[data-testid=user]', (e) => e.ariaLabel)) === 'Demo Person',
)
await setValue('main form input[name=name]', 'Demo User')
await page.click('main form button')
await page.waitForFunction(
  () => document.querySelector('[data-testid=user]')?.ariaLabel === 'Demo User',
)

// ---- errors: the error page, and the development report
{
  const dev = !assetVersion
  await nav('/errors')
  await h1('Errors')
  await page.click('[data-testid=visit-403-forbidden]')
  await page.waitForSelector('[data-testid=error-status]')
  ok(
    'HTTPException(403) during a navigation: the error page with the status, in the layout',
    (await testid('error-status')) === '403' && (await page.$('aside')) !== null,
  )
  await page.goBack()
  await h1('Errors')
  docs.length = 0
  await page.click('[data-testid=visit-500-loader]')
  if (dev) {
    await waitText('The loader failed')
    ok(
      'a thrown error during a navigation (development): the report, loaded as a document',
      (await text()).includes('Stack') && docs.some((d) => d.endsWith('/errors/loader')),
    )
  } else {
    await page.waitForSelector('[data-testid=error-status]')
    ok(
      'a thrown error during a navigation (production): the error page, status 500',
      (await testid('error-status')) === '500',
    )
  }
  await page.goto(BASE + '/errors', { waitUntil: 'networkidle0' })
  const missingPage = await (
    await fetch(BASE + '/errors/missing', { headers: { Accept: 'text/html' } })
  ).text()
  ok(
    'a page that does not exist: said so (development), the error page (production)',
    dev
      ? missingPage.includes('create app/pages/reports/yearly.tsx')
      : missingPage.includes('"status":500'),
  )
  const failed = await fetchAs(BASE + '/errors?fail', {
    method: 'POST',
    headers: { ...fondu(), Origin: ORIGIN },
  })
  ok(
    'an action that throws: 500, a report or the error page',
    failed.status === 500 &&
      (dev
        ? (await failed.text()).includes('The action failed')
        : (await failed.json()).props.status === 500),
  )
  const api500 = await fetch(BASE + '/errors/loader')
  ok(
    '… for an API client: plain text',
    api500.status === 500 && (await api500.text()) === 'Internal Server Error',
  )
  // a proxy's own page (here, the app's route standing in for one): what the browser would show
  docs.length = 0
  await page.click('[data-testid=visit-502-proxy]')
  await page
    .waitForFunction(() => document.querySelector('h1')?.textContent === 'Bad gateway', {
      timeout: 8000,
    })
    .catch(() => {})
  ok(
    "an answer that isn't a page, to a link: loaded as a document",
    (await path()) === '/errors/proxy' && docs.some((d) => d.endsWith('/errors/proxy')),
    JSON.stringify(docs),
  )
  await page.goto(BASE + '/errors', { waitUntil: 'networkidle0' })
  await page.click('[data-testid=action-proxy]')
  await page
    .waitForFunction(() => document.querySelector('h1')?.textContent === 'Bad gateway', {
      timeout: 8000,
    })
    .catch(() => {})
  ok(
    "an answer that isn't a page, to a form: it replaces the page, as without JavaScript",
    (await page.evaluate(() => document.querySelector('h1')?.textContent)) === 'Bad gateway',
  )
  await page.goto(BASE + '/errors', { waitUntil: 'networkidle0' })
}

// ---- flash data: toasts, data of the app's own, once
{
  await nav('/flash')
  await h1('Flash data')
  const toastText = (t) =>
    page
      .waitForFunction(
        (t) =>
          [...document.querySelectorAll('[data-slot=toast-title]')].some(
            (e) => e.textContent === t,
          ),
        { timeout: 5000 },
        t,
      )
      .then(() => true)
      .catch(() => false)
  await page.click('[data-testid=flash-saved]')
  const saved = await toastText('Saved, said the server')
  await page.click('[data-testid=flash-failed]')
  const failed = await toastText('Not saved: the server said no')
  ok('flash: message and error, as toasts after the redirect', saved && failed)
  await page.click('[data-testid=pick-teal]')
  await page
    .waitForFunction(
      () => document.querySelector('[data-testid=picked]')?.textContent.includes('teal'),
      { timeout: 5000 },
    )
    .catch(() => {})
  const picked = await testid('picked')
  await page.click('[data-testid=flash-reload]')
  await page
    .waitForFunction(
      () => document.querySelector('[data-testid=picked]')?.textContent.startsWith('Nothing'),
      { timeout: 5000 },
    )
    .catch(() => {})
  ok(
    'flash: data of its own for the next page, gone on the next one',
    picked === 'Picked teal, on this page only' &&
      (await testid('picked')) === 'Nothing picked on this page' &&
      (await testid('flash-json')) === '{}',
    JSON.stringify([picked, await testid('flash-json')]),
  )
}

// ---- file uploads: a File in the body, checked by the schema
{
  await nav('/uploads')
  await h1('File uploads')
  await page.click('[data-testid=upload-send]')
  await page.waitForSelector('[data-testid=err-file]', { timeout: 5000 }).catch(() => {})
  const missing = await testid('err-file')
  const dir = mkdtempSync(join(tmpdir(), 'upload-'))
  writeFileSync(join(dir, 'big.txt'), 'x'.repeat(1024 * 1024 + 1))
  writeFileSync(join(dir, 'note.txt'), 'A note for the upload demo.\n')
  const input = await page.$('[data-testid=upload] input[type=file]')
  await input.uploadFile(join(dir, 'big.txt'))
  await page.click('[data-testid=upload-send]')
  await page
    .waitForFunction(
      () => document.querySelector('[data-testid=err-file]')?.textContent === 'At most 1 MB',
      { timeout: 8000 },
    )
    .catch(() => {})
  const big = await testid('err-file')
  await input.uploadFile(join(dir, 'note.txt'))
  await page.click('[data-testid=upload-send]')
  await waitText('Received note.txt, 1 kB').catch(() => {})
  ok(
    'uploads: required, too big, then received (multipart, checked by z.file())',
    missing === 'Choose a file' &&
      big === 'At most 1 MB' &&
      (await text()).includes('Received note.txt, 1 kB') &&
      (await page.$('[data-testid=err-file]')) === null,
    JSON.stringify([missing, big]),
  )
}

// ---- admin: a guard, a layout of its own, no server render
{
  await page.goto(BASE + '/admin/dashboard', { waitUntil: 'networkidle0' })
  ok('a user who is not an admin: 403', (await testid('error-status')) === '403')
  await signOut()
  await page.goto(BASE + '/login', { waitUntil: 'networkidle0' })
  await page.type('input[name=email]', 'admin@fondu.dev')
  await page.type('input[name=password]', 'fondu-admin')
  // from an address of its own: the sign-ins above may have used this one's tries (Better Auth: 3 in 10 s)
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.20' })
  await Promise.all([
    page.waitForFunction(() => location.pathname === '/account'),
    page.click('main form button'),
  ])
  await page.setExtraHTTPHeaders({})
  ok('Better Auth: the admin account, its role', (await testid('account-role')) === 'admin')
  const doc = await (await fetchAs(BASE + '/admin/dashboard')).text()
  ok(
    '/admin: rendered in the browser only (withoutSsr in routes/admin/_middleware.ts)',
    doc.includes('<div id="app"></div>') && doc.includes('"component":"admin\\/dashboard"'),
  )
  await page.goto(BASE + '/admin/dashboard', { waitUntil: 'networkidle0' })
  ok(
    '/admin: its own layout (pages/admin/_layout.tsx), the accounts',
    (await page.$('[data-testid=admin-home]')) !== null &&
      (await page.$('aside')) === null &&
      (await text()).includes('demo@fondu.dev'),
  )
  await page.$$eval('[data-testid=accounts] tbody tr', (rows) =>
    rows
      .find((r) => r.textContent.includes('demo@fondu.dev'))
      .querySelector('button')
      .click(),
  )
  await waitText('Role changed to admin')
  await page.$$eval('[data-testid=accounts] tbody tr', (rows) =>
    rows
      .find((r) => r.textContent.includes('demo@fondu.dev'))
      .querySelector('button')
      .click(),
  )
  await waitText('Role changed to user')
  ok("an admin action (Better Auth's setRole), there and back", true)
  // signed out from here, Back: the admin page is not shown again (clearHistory(): the kept pages forgotten)
  await page.click('[data-testid=user]')
  await (await page.waitForSelector('[data-testid=sign-out]')).click()
  await page.waitForSelector('[data-testid=sign-in]')
  await page.evaluate(() => {
    window.__headings = []
    const t0 = performance.now()
    const tick = () => {
      window.__headings.push(document.querySelector('h1')?.textContent)
      if (performance.now() - t0 < 2000) requestAnimationFrame(tick)
    }
    tick()
  })
  await page.goBack()
  await page
    .waitForFunction(() => location.pathname === '/login', { timeout: 8000 })
    .catch(() => {})
  await sleep(400)
  const seen = await page.evaluate(() => window.__headings ?? [])
  ok(
    'signed out on /admin: Back never shows it (the kept pages forgotten; asked again: the sign-in page)',
    !seen.includes('Accounts') && (await path()).startsWith('/login'),
    JSON.stringify([...new Set(seen)]),
  )
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.21' })
  await signIn()
  await page.setExtraHTTPHeaders({})
  await page.goto(BASE + '/admin/dashboard', { waitUntil: 'networkidle0' })
  await page.click('main a[href="/"]')
  await page.waitForSelector('aside')
}

// ---- sign up: turned off in the demo (Better Auth's disableSignUp); its answer shows under the field
{
  const sp = await (await browser.createBrowserContext()).newPage() // signed out
  await sp.goto(BASE + '/signup', { waitUntil: 'networkidle0' })
  await sp.type('[data-testid=signup] input[name=name]', 'New Person')
  await sp.type('[data-testid=signup] input[name=email]', `new-${Date.now()}@x.org`)
  await sp.type('[data-testid=signup] input[name=password]', 'long-enough-1')
  await sp.click('[data-testid=signup] button')
  await sp.waitForSelector('[data-testid=err-email]')
  ok(
    "sign up is turned off: Better Auth's answer under the field, still signed out",
    (await testid('err-email', sp)) === 'Email and password sign up is not enabled' &&
      (await path(sp)) === '/signup' &&
      (await sp.$('[data-testid=sign-in]')) !== null,
    await testid('err-email', sp),
  )
  await sp.close()
}

// ---- small screens: the menu is a drawer from the left
{
  const mp = await browser.newPage()
  await mp.setViewport({ width: 390, height: 760 })
  await mp.goto(BASE + '/props', { waitUntil: 'networkidle0' })
  await mp.waitForFunction(
    () => document.querySelector('[data-testid=render-mode]')?.textContent === 'SSR: hydrated',
  )
  const shown = () => mp.evaluate(() => Boolean(document.querySelector('#menu')?.checkVisibility()))
  const closed = await shown()
  await mp.click('[data-testid=menu]')
  await mp.waitForSelector('#menu a[href="/flash"]', { visible: true }).catch(() => {})
  const opened = await shown()
  await mp.evaluate(() => document.querySelector('#menu a[href="/flash"]').click())
  await h1('Flash data', mp)
  await mp
    .waitForFunction(() => !document.querySelector('#menu')?.checkVisibility(), { timeout: 3000 })
    .catch(() => {})
  ok(
    'mobile: the menu opens in a drawer from its button and closes after a navigation',
    !closed && opened && !(await shown()),
    JSON.stringify([closed, opened]),
  )
  const wide = []
  for (const p of new Set([
    ...(await mp.evaluate(() =>
      [...document.querySelectorAll('#menu a[href^="/"], aside a[href^="/"]')].map((a) =>
        a.getAttribute('href'),
      ),
    )),
    '/contacts/1',
    '/ssr/browser',
    '/de/i18n',
    '/login',
    '/nope',
  ])) {
    await mp.goto(BASE + p, { waitUntil: 'networkidle0' })
    if (await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth)) wide.push(p)
  }
  ok('mobile: no page is wider than the screen', wide.length === 0, JSON.stringify(wide))
  await mp.close()
}

// ---- the theme: a cookie, <html class> written by the server
{
  const tp = await (await browser.createBrowserContext()).newPage()
  await tp.goto(BASE + '/props', { waitUntil: 'networkidle0' })
  await tp.waitForFunction(
    () => document.querySelector('[data-testid=render-mode]')?.textContent === 'SSR: hydrated',
  )
  const before = await tp.evaluate(() => document.documentElement.className)
  await tp.click('[data-testid=theme]')
  await tp.waitForSelector('[role=menuitemradio]')
  await tp.evaluate(() =>
    [...document.querySelectorAll('[role=menuitemradio]')]
      .find((e) => e.textContent.includes('Dark'))
      .click(),
  )
  const now = await tp.evaluate(() => [
    document.documentElement.className,
    getComputedStyle(document.body).colorScheme,
  ])
  await tp.reload({ waitUntil: 'networkidle0' })
  const served = await tp.evaluate(() => document.documentElement.className)
  ok(
    'theme: system at first; Dark applies at once and the server writes it on the next load',
    before === 'system' && now[0] === 'dark' && now[1] === 'dark' && served === 'dark',
    JSON.stringify([before, now, served]),
  )
  await tp.evaluate(() => fetch('/redirects?back', { method: 'POST', redirect: 'manual' })) // a flash for the next document
  await tp.goto(BASE + '/', { waitUntil: 'networkidle0' })
  const toast = await tp
    .waitForSelector('[data-slot=toast-title]', { timeout: 4000 })
    .then((e) => e.evaluate((n) => n.textContent))
    .catch(() => null)
  ok(
    'flash on a full page load: a toast (the first page brings its flash too)',
    toast === 'Redirected back with a flash message',
    toast,
  )
  await tp.close()
}

// ---- languages: one route file, a URL per language (routes/[[locale]]/, Paraglide)
{
  const ctx = await browser.createBrowserContext()
  const lp = await ctx.newPage()
  watchProblems(lp)
  const lang = () => lp.evaluate(() => document.documentElement.lang)
  await lp.goto(BASE + '/i18n', { waitUntil: 'networkidle0' })
  ok(
    'languages: /i18n in English, the base language, without a prefix',
    (await testid('greeting', lp)) === 'Hello, Ada!' && (await lang()) === 'en',
  )
  await Promise.all([
    lp.waitForNavigation({ waitUntil: 'networkidle0' }),
    lp.click('[data-testid=locale-de]'),
  ])
  const german = [
    await path(lp),
    await lang(),
    await testid('greeting', lp),
    await testid('books', lp),
    await testid('date', lp),
    await lp.$eval('aside a[href="/i18n"]', (a) => a.getAttribute('aria-current')),
  ]
  ok(
    'languages: setLocale() loads /de/i18n; the messages, plurals, formats and <html lang> in German',
    JSON.stringify(german) ===
      '["/de/i18n","de","Hallo, Ada!","1 Buch · 3 Bücher","16. Oktober 2026","page"]',
    JSON.stringify(german),
  )
  await nav('/', lp)
  await h1('Fondu demo', lp).catch(() => {})
  await nav('/i18n', lp)
  await lp
    .waitForFunction(() => location.pathname === '/de/i18n', { timeout: 4000 })
    .catch(() => {})
  ok(
    'languages: away and back from the menu (/i18n, a navigation): the language picked, /de/i18n',
    (await path(lp)) === '/de/i18n' && (await testid('greeting', lp)) === 'Hallo, Ada!',
    await path(lp),
  )
  await lp.click('[data-testid=say-hello]')
  await lp.waitForSelector('[data-testid=err-name]', { timeout: 4000 }).catch(() => {})
  ok(
    "languages: the server's validation error in the URL's language",
    (await testid('err-name', lp)) === 'Bitte gib deinen Namen ein',
    await testid('err-name', lp),
  )
  await lp.type('input[name=name]', 'Grace')
  await lp.click('[data-testid=say-hello]')
  await waitText('Der Server sagt Hallo, Grace!', lp).catch(() => {})
  ok(
    'languages: the flash, written on the server in German; the page stays /de/i18n',
    (await text(lp)).includes('Der Server sagt Hallo, Grace!') && (await path(lp)) === '/de/i18n',
  )
  await ctx.close()

  const html = await (await fetch(BASE + '/zh/i18n')).text()
  ok(
    'languages: /zh/i18n rendered by the server in Chinese, with links to each language (hreflang)',
    html.includes('<html lang="zh"') &&
      html.includes('你好，Ada！') &&
      ['en', 'de', 'zh', 'x-default'].every((l) =>
        html.includes(
          `hrefLang="${l}" href="${ORIGIN}${l === 'en' || l === 'x-default' ? '' : '/' + l}/i18n"`,
        ),
      ),
  )
  const statuses = await Promise.all(
    ['/xx/i18n', '/en/i18n', '/DE/i18n', '/de'].map(async (p) => (await fetch(BASE + p)).status),
  )
  ok(
    'languages: a first segment that is not one of the languages (or the base one): a 404',
    statuses.every((s) => s === 404),
    JSON.stringify(statuses),
  )

  // a first visit: the browser's language; once one is picked, that one
  const ctx2 = await browser.createBrowserContext()
  const fp = await ctx2.newPage()
  watchProblems(fp)
  await fp.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' })
  await fp.goto(BASE + '/i18n?from=search', { waitUntil: 'networkidle0' })
  ok(
    "languages: a first visit to /i18n goes to the browser's language, the query kept",
    (await path(fp)) === '/zh/i18n?from=search' && (await testid('greeting', fp)) === '你好，Ada！',
    await path(fp),
  )
  await Promise.all([
    fp.waitForNavigation({ waitUntil: 'networkidle0' }),
    fp.click('[data-testid=locale-en]'),
  ])
  await fp.goto(BASE + '/i18n', { waitUntil: 'networkidle0' })
  ok(
    'languages: English picked, /i18n stays English',
    (await path(fp)) === '/i18n' && (await testid('greeting', fp)) === 'Hello, Ada!',
    await path(fp),
  )
  await ctx2.close()
}

// ---- 404
{
  const pageNope = await fetchAs(BASE + '/nope', { headers: fondu() })
  ok(
    'a missing URL, as a navigation: the 404 page object, status 404',
    pageNope.status === 404 && (await pageNope.json()).component === 'error',
  )
  const doc404 = await fetch(BASE + '/nope', { headers: { Accept: 'text/html' } })
  ok(
    '… as a document: status 404, the rendered page',
    doc404.status === 404 && (await doc404.text()).includes('Page not found'),
  )
  const api404 = await fetch(BASE + '/api/nope')
  ok(
    '… from an API client: a plain 404',
    api404.status === 404 && (api404.headers.get('content-type') ?? '').startsWith('text/plain'),
  )
}

// ---- security
{
  const evil = { Origin: 'https://evil.example' }
  const csrf = []
  for (const [label, headers, body] of [
    [
      'urlencoded',
      { ...evil, 'Content-Type': 'application/x-www-form-urlencoded' },
      'name=x&email=y',
    ],
    ['multipart', { ...evil, 'Content-Type': 'multipart/form-data; boundary=x' }, '--x--'],
    ['text/plain', { ...evil, 'Content-Type': 'text/plain' }, '{}'],
    [
      'Sec-Fetch-Site: cross-site',
      { 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'text/plain' },
      '{}',
    ],
  ]) {
    for (const target of ['/contacts', '/login', '/logout']) {
      let r = await fetch(BASE + target, { method: 'POST', headers, body })
      if (r.status === 500) r = await fetch(BASE + target, { method: 'POST', headers, body }) // dev: the workerd proxy now and then drops one
      csrf.push(`${label} ${target}=${r.status}`)
    }
  }
  ok(
    'CSRF (createApp default): cross-site form-like POSTs -> 403',
    csrf.every((x) => x.endsWith('=403')),
    csrf.filter((x) => !x.endsWith('=403')).join(', '),
  )
  const same = await page.evaluate(
    async () =>
      (
        await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: '{}',
        })
      ).status,
  )
  ok('CSRF: the same request from the app itself passes', same !== 403, String(same))
  const doc = await fetch(BASE + '/', { headers: { Accept: 'text/html' } })
  const csp = doc.headers.get('content-security-policy') ?? ''
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1]
  const scripts = [
    ...(await doc.text()).matchAll(/<script(?![^>]*application\/json)([^>]*)>/g),
  ].map((m) => m[1])
  ok(
    "CSP: script-src 'self' + a nonce; every script carries it",
    scripts.length > 0 && scripts.every((a) => a.includes(`nonce="${nonce}"`)),
    `${scripts.length} scripts`,
  )
  ok(
    'CSP: a fresh nonce per response',
    nonce &&
      !((await fetch(BASE + '/')).headers.get('content-security-policy') ?? '').includes(nonce),
  )
  ok(
    'secure headers (createApp default): Referrer-Policy same-origin, nosniff',
    doc.headers.get('referrer-policy') === 'same-origin' &&
      doc.headers.get('x-content-type-options') === 'nosniff',
  )
  const sameSite = { Origin: ORIGIN }
  const json = { 'Content-Type': 'application/json' }
  const manual = (headers, init = {}) => ({ redirect: 'manual', ...init, headers })
  const guestApi = await Promise.all([
    fetch(BASE + '/api/contacts'),
    fetch(BASE + '/api/contacts/1', { method: 'DELETE', headers: sameSite }),
  ])
  ok(
    'API: guests get 401',
    guestApi.every((r) => r.status === 401),
    guestApi.map((r) => r.status).join(),
  )
  const login = (body, headers = {}) =>
    fetch(
      BASE + '/login',
      manual(
        { ...json, ...sameSite, 'X-Fondu': 'true', ...headers },
        { method: 'POST', body: JSON.stringify(body) },
      ),
    )
  const nexts = []
  // each from its own address: Better Auth limits sign-ins per client (cf-connecting-ip)
  for (const [i, next] of ['/\\evil.com', '//evil.com/x', '/contacts?x=2'].entries()) {
    const r = await login(
      { email: 'demo@fondu.dev', password: 'fondu-demo', next },
      { 'CF-Connecting-IP': `203.0.113.${i + 1}` },
    )
    nexts.push(`${next} -> ${r.status} ${r.headers.get('location')}`)
  }
  ok(
    'login: `next` is followed only into this site',
    nexts.join('|') ===
      [
        '/\\evil.com -> 303 /account',
        '//evil.com/x -> 303 /account',
        '/contacts?x=2 -> 303 /contacts?x=2',
      ].join('|'),
    nexts.join(' | '),
  )
  const tries = []
  for (let i = 0; i < 4; i++)
    tries.push(
      await login(
        { email: 'demo@fondu.dev', password: 'wrong' },
        { 'CF-Connecting-IP': '203.0.113.9' },
      ),
    )
  const tooMany = decodeURIComponent(tries.at(-1).headers.get('set-cookie') ?? '')
  ok(
    "login: Better Auth's rate limit (3 sign-ins in 10 s per client), shown under the field",
    tooMany.includes('Too many attempts'),
    tooMany.slice(0, 160),
  )
  const slash = await fetch(BASE + '/contacts/?x=2', {
    redirect: 'manual',
    headers: { Accept: 'text/html' },
  })
  ok(
    'trailing slash: /contacts/?x=2 -> 301 /contacts?x=2',
    slash.status === 301 &&
      new URL(slash.headers.get('location')).pathname +
        new URL(slash.headers.get('location')).search ===
        '/contacts?x=2',
  )
  const doubleSlash = await fetch(BASE + '//evil.com/', { redirect: 'manual' })
  ok(
    'trailing slash redirect stays on this site',
    doubleSlash.status !== 301 || new URL(doubleSlash.headers.get('location')).origin === ORIGIN,
    `${doubleSlash.status} ${doubleSlash.headers.get('location')}`,
  )
  const sources = await Promise.all(
    [
      '/app/modules/auth/auth.server.ts?raw',
      '/app/routes/login.ts?raw',
      '/app/server.ts?raw',
      '/app/routes/login.ts?import&raw',
    ].map(async (u) => [u, (await fetch(BASE + u)).status]),
  )
  ok(
    'server code is never served to the browser',
    sources.every(([, s]) => s >= 400),
    JSON.stringify(sources),
  )
  const builtIns = await Promise.all(
    ['constructor', 'toString', '__proto__'].map(
      async (name) =>
        (
          await fetchAs(BASE + `/contacts?${name}`, {
            method: 'POST',
            headers: { ...json, ...sameSite, 'X-Fondu': 'true' },
            body: '{}',
            redirect: 'manual',
          })
        ).status,
    ),
  )
  ok(
    '?constructor and other built-in names are not actions (404)',
    builtIns.every((s) => s === 404),
    builtIns.join(),
  )
  const protoPost = () =>
    fetchAs(BASE + '/contacts', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        ...sameSite,
        Referer: BASE + '/contacts',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `__proto__[x]=1&constructor=y&name=Proto+Field&email=proto-${Date.now()}%40x.org`,
    })
  let proto = await protoPost()
  if (proto.status === 500) proto = await protoPost() // dev: the workerd proxy now and then drops one
  ok(
    'form fields named __proto__ / constructor are ignored',
    proto.status === 303 && proto.headers.get('location').endsWith('/contacts'),
    String(proto.status),
  )
  let secure = await fetch(BASE + '/logout', {
    method: 'POST',
    redirect: 'manual',
    headers: { ...sameSite, 'X-Forwarded-Proto': 'https' },
  })
  if (secure.status === 403)
    secure = await fetch(BASE + '/logout', {
      method: 'POST',
      redirect: 'manual',
      headers: { Origin: ORIGIN.replace('http:', 'https:'), 'X-Forwarded-Proto': 'https' },
    })
  const flashCookie = secure.headers.getSetCookie().find((c) => c.includes('fondu-flash=')) ?? ''
  ok(
    'flash cookie over https: __Host- prefix, Secure',
    flashCookie.startsWith('__Host-fondu-flash=') && /;\s*Secure/i.test(flashCookie),
    flashCookie.slice(0, 60),
  )
  // what fondu/client reads when the content has a page-data element of its own (it takes the first one)
  const fp = await browser.newPage()
  await fp.setRequestInterception(true)
  const real = await (await fetch(BASE + '/props')).text()
  const forged = real.replace(
    '<main',
    '<script data-page="app" type="application/json">{"component":"errors/404","props":{"errors":{}},"url":"/props","version":null,"flash":{}}</script><main',
  )
  fp.on('request', (r) =>
    r.isNavigationRequest() && new URL(r.url()).pathname === '/props'
      ? r.respond({ status: 200, contentType: 'text/html', body: forged })
      : r.continue(),
  )
  await fp.goto(BASE + '/props', { waitUntil: 'networkidle0' })
  await sleep(400)
  ok(
    'a page-data element injected into the content is not read (the real one comes first)',
    (await fp.evaluate(() => document.querySelector('h1')?.textContent)) === 'Props',
  )
  await fp.close()
}

// ---- back / forward, signing out
{
  const hp = await browser.newPage()
  watchProblems(hp)
  const requests = []
  hp.on('request', (r) => {
    if (r.headers()['x-fondu']) requests.push(new URL(r.url()).pathname)
  })
  const at = (p) => hp.waitForFunction((x) => location.pathname === x, {}, p)
  await hp.goto(BASE + '/flash', { waitUntil: 'networkidle0' })
  await nav('/contacts', hp)
  await at('/contacts')
  await hp.waitForSelector('[data-testid=contacts] li')
  await hp.evaluate(() => window.scrollTo(0, 300))
  await nav('/props', hp)
  await at('/props')
  requests.length = 0
  await hp.goBack()
  await at('/contacts')
  await sleep(500)
  ok(
    "Back: the page as it was left, the scroll position too, then the server's",
    (await hp.$('[data-testid=contacts] li')) !== null &&
      (await hp.evaluate(() => Math.round(scrollY))) === 300 &&
      requests.includes('/contacts'),
    JSON.stringify(requests),
  )
  await hp.goForward()
  await at('/props')
  await sleep(300)
  ok(
    'Forward too',
    (await hp.evaluate(() => document.querySelector('h1')?.textContent)) === 'Props',
  )
  await nav('/account', hp)
  await at('/account')
  await nav('/', hp)
  await at('/')
  await hp.click('[data-testid=user]')
  await (await hp.waitForSelector('[data-testid=sign-out]')).click()
  await hp.waitForFunction(() =>
    [...document.querySelectorAll('[data-slot=toast-title]')].some(
      (t) => t.textContent === 'Signed out',
    ),
  )
  await hp.evaluate(() => {
    window.__headings = []
    const t0 = performance.now()
    const tick = () => {
      window.__headings.push(document.querySelector('h1')?.textContent)
      if (performance.now() - t0 < 2000) requestAnimationFrame(tick)
    }
    tick()
  })
  await hp.goBack()
  await hp.waitForFunction(() => location.pathname === '/login', { timeout: 8000 }).catch(() => {})
  await sleep(400)
  const seen = await hp.evaluate(() => window.__headings ?? [])
  ok(
    'signed out: Back to a private page never shows it (the kept pages forgotten; asked again: the sign-in page)',
    !seen.includes('Account') && (await hp.evaluate(() => location.pathname)) === '/login',
    JSON.stringify([...new Set(seen)]),
  )
  await hp.close()
}

// ---- dev only: an edit to a route's code updates the page's props in place, without reloading it
if ((await fetch(BASE + '/@vite/client').catch(() => null))?.ok) {
  const { readFileSync, writeFileSync } = await import('node:fs')
  const file = new URL('../app/routes/props.ts', import.meta.url)
  const source = readFileSync(file, 'utf8')
  const hp = await browser.newPage()
  try {
    await hp.goto(BASE + '/props', { waitUntil: 'networkidle0' })
    await hp.evaluate(() => (window.__kept = true))
    writeFileSync(file, source.replace("text: 'Hello from Hono'", "text: 'Hello again from Hono'"))
    await waitText('Hello again from Hono', hp).catch(() => {})
    ok(
      'dev: a route edited, its page gets the new props without a reload',
      (await text(hp)).includes('Hello again from Hono') &&
        (await hp.evaluate(() => window.__kept === true)),
    )
  } finally {
    writeFileSync(file, source)
    await hp.close()
  }
  // a route that throws as it is imported: the app doesn't load. Vite's overlay shows it, as a whole page; fixed, the
  // page is back
  const broken = await browser.newPage()
  try {
    await broken.goto(BASE + '/props', { waitUntil: 'networkidle0' })
    writeFileSync(file, `throw new Error('a route that fails to load')\n${source}`)
    await broken
      .waitForFunction(() => document.querySelector('vite-error-overlay'), { timeout: 10000 })
      .catch(() => {})
    await sleep(500)
    ok(
      "dev: an app that fails to load, Vite's overlay as a whole page",
      await broken.evaluate(() =>
        document
          .querySelector('vite-error-overlay')
          ?.shadowRoot?.textContent?.includes('a route that fails to load'),
      ),
    )
    writeFileSync(file, source)
    await waitText('Hello from Hono', broken).catch(() => {})
    ok(
      'dev: the route fixed, the page is back',
      (await text(broken)).includes('Hello from Hono') &&
        (await broken.evaluate(() => !document.querySelector('vite-error-overlay'))),
    )
  } finally {
    writeFileSync(file, source)
    await broken.close()
  }
}

ok(
  'no console errors or warnings (incl. hydration)',
  problems.length === 0,
  problems.slice(0, 3).join(' | '),
)
if (problems.length) console.log(problems.join('\n'))
// ---- the demo's reset (the cron of wrangler.jsonc), run by hand: the seed again, the changes above gone
{
  const reset = await fetch(BASE + '/cdn-cgi/handler/scheduled')
  const names = (
    await (await fetch(BASE + '/contacts', { headers: fondu() })).json()
  ).props.contacts.map((c) => c.name)
  ok(
    'the scheduled reset: the contacts are the seed again',
    reset.ok && JSON.stringify(names.sort()) === '["Ada Lovelace","Alan Turing","Grace Hopper"]',
    JSON.stringify(names),
  )
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
await browser.close()
process.exitCode = results.every(Boolean) ? 0 : 1
