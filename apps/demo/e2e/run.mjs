// Browser end-to-end checks of the Cloudflare example. Start it first (`bun run dev` or `bun run preview`), then:
//   CHROME_PATH=/path/to/chrome node e2e/run.mjs http://localhost:5173 [label]
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
const precognition = []
page.on('request', (r) => {
  if (r.resourceType() === 'document') docs.push(r.url())
  if (r.headers().precognition) precognition.push(r.url().replace(BASE, ''))
  if (r.headers()['x-inertia'])
    fetches.push({
      url: r.url().replace(BASE, ''),
      method: r.method(),
      purpose: r.headers().purpose ?? '',
      headers: r.headers(),
    })
})
// the page objects Inertia receives
const pageJson = []
page.on('response', async (r) => {
  if (!r.request().headers()['x-inertia'] || r.request().headers().purpose) return
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
  window.__vt = 0
  const orig = document.startViewTransition?.bind(document)
  if (orig)
    document.startViewTransition = (cb) => {
      window.__vt++
      return orig(cb)
    }
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
const inertia = (extra = {}) => ({
  'X-Inertia': 'true',
  ...(assetVersion && { 'X-Inertia-Version': assetVersion }),
  ...extra,
})
const cookieHeader = async () =>
  (await page.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join('; ')
const fetchAs = async (url, init = {}) =>
  fetch(url, { ...init, headers: { ...init.headers, cookie: await cookieHeader() } })
const until = async (cond, ms = 3000) => {
  for (let t = 0; t < ms && !cond(); t += 50) await sleep(50)
}
const lastBody = () => pageJson.filter((p) => p.body).at(-1)
const lastJson = (url) =>
  pageJson.filter((p) => p.body && (p.url === url || p.url.startsWith(url + '?'))).at(-1)

// warm-up (lets dev mode optimise dependencies before measuring)
for (const p of [
  '/',
  '/props',
  '/partial',
  '/deferred',
  '/merging',
  '/infinite',
  '/once',
  '/contacts',
  '/errors',
  '/signup',
  '/redirects',
  '/history',
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
    /^<body><script data-page="app" type="application\/json">[^<]*<\/script><div data-server-rendered="true" id="app">/.test(
      body,
    ),
  )
  ok(
    'document: Cache-Control private, no-cache; Vary: X-Inertia',
    res.headers.get('cache-control') === 'private, no-cache' &&
      /X-Inertia/i.test(res.headers.get('vary') ?? ''),
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

// ---- navigation, prefetch, titles
await page.goto(BASE + '/', { waitUntil: 'networkidle0' })
await page.waitForFunction(() => window.__fcp !== null, { timeout: 5000 }).catch(() => {})
ok(
  'no flash of unstyled content (styles applied at first paint)',
  (await page.evaluate(() => window.__fcp)) === '0px',
  String(await page.evaluate(() => window.__fcp)),
)
ok('title on a document load', (await page.title()) === 'Overview · Fondu demo', await page.title())
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
await page.hover('aside a[href="/props"]')
await sleep(600)
await nav('/props')
await h1('Props')
const propsFetches = fetches.filter((f) => f.url === '/props')
ok(
  'a sidebar link is prefetched on hover, and the click reuses it',
  propsFetches.length === 1 && propsFetches[0].purpose === 'prefetch',
  JSON.stringify(propsFetches.map((f) => f.purpose)),
)
await page
  .waitForFunction(() => document.title === 'Props · Fondu demo', { timeout: 3000 })
  .catch(() => {})
ok('title after a visit', (await page.title()) === 'Props · Fondu demo', await page.title())
ok(
  'props: values, an object, a function called when sent, shared props',
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

// ---- partial reloads
await nav('/partial')
await h1('Partial reloads')
const before = {
  time: await testid('time'),
  random: await testid('random'),
  count: Number(await testid('request-count')),
}
await page.click('[data-testid=only-time]')
await page.waitForFunction(
  (t) => document.querySelector('[data-testid=time]').textContent !== t,
  {},
  before.time,
)
await sleep(200)
let res = lastJson('/partial')
ok(
  'only: X-Inertia-Partial-Data: time -> time, the always prop and errors',
  res?.req['x-inertia-partial-data'] === 'time' &&
    JSON.stringify(Object.keys(res.body.props).sort()) === '["errors","requestCount","time"]' &&
    (await testid('random')) === before.random,
  JSON.stringify(res && Object.keys(res.body.props)),
)
ok(
  'always: requestCount is sent with every reload',
  Number(await testid('request-count')) > before.count,
)
await page.click('[data-testid=except-random]')
await sleep(600)
res = lastJson('/partial')
ok(
  'except: everything but random (an optional prop still only on request)',
  res?.req['x-inertia-partial-except'] === 'random' &&
    !('random' in res.body.props) &&
    'time' in res.body.props &&
    !('report' in res.body.props),
  JSON.stringify(res && Object.keys(res.body.props)),
)
const firstHtml = await (await fetch(BASE + '/partial')).text()
ok('optional: not in the first page', !firstHtml.includes('"report"'))
await page.click('[data-testid=load-report]')
await page.waitForSelector('[data-testid=report]')
ok('optional: computed when a partial reload asks for it', /128 rows/.test(await testid('report')))
await page.goto(BASE + '/partial', { waitUntil: 'networkidle0' })
await page.evaluate(() =>
  document
    .querySelector('[data-testid=load-report]')
    .closest('section')
    .nextElementSibling.scrollIntoView(),
)
await page.waitForSelector('[data-testid=report-visible]', { timeout: 5000 }).catch(() => {})
ok(
  '<WhenVisible>: the prop is requested when its card scrolls into view',
  /128 rows/.test((await testid('report-visible')) ?? ''),
)
const times = new Set()
await page.click('[data-testid=poll]')
for (let i = 0; i < 12; i++) {
  times.add(await testid('time'))
  await sleep(250)
}
await page.click('[data-testid=poll]')
ok(
  'usePoll: the time is reloaded every second while polling',
  times.size >= 2,
  `${times.size} values in 3s`,
)

// ---- deferred props
{
  const html = await (await fetch(BASE + '/deferred')).text()
  ok(
    'deferred: the first HTML has the page and deferredProps, not the values',
    html.includes(
      '"deferredProps":{"default":["stats","flaky"],"slow":["activity","recommendations"]}',
    ) && !html.includes('1,284'),
  )
  await nav('/props')
  await h1('Props')
  fetches.length = 0
  await nav('/deferred')
  await h1('Deferred props')
  ok(
    'deferred: the page shows before its deferred values',
    (await page.$('[data-testid=stats]')) === null,
  )
  await page.waitForSelector('[data-testid=stats]')
  await page.waitForSelector('[data-testid=activity]')
  await page.waitForSelector('[data-testid=recommendations]')
  const groups = fetches
    .filter((f) => f.url === '/deferred' && f.headers['x-inertia-partial-data'])
    .map((f) => f.headers['x-inertia-partial-data'])
    .sort()
  ok(
    'deferred: one request per group',
    JSON.stringify(groups) === '["activity,recommendations","stats,flaky"]',
    JSON.stringify(groups),
  )
  await page.waitForSelector('[data-testid=rescued]')
  const rescued = pageJson
    .filter((p) => p.url === '/deferred' && p.req['x-inertia-partial-data'] === 'stats,flaky')
    .at(-1)
  ok(
    'deferred: a failing prop with rescue: true -> rescuedProps, the rescue slot, the rest of the group still arrives',
    rescued?.status === 200 &&
      JSON.stringify(rescued.body.rescuedProps) === '["flaky"]' &&
      !('flaky' in rescued.body.props) &&
      (await text()).includes('1,284'),
  )
}

// ---- merging props
await nav('/merging')
await h1('Merging props')
await page.click('[data-testid=more]')
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid=messages] li').length === 6,
)
res = lastJson('/merging')
ok(
  'merge: page 2 is appended; mergeProps and matchPropsOn are announced',
  JSON.stringify(res?.body.mergeProps) === '["messages"]' &&
    JSON.stringify(res?.body.matchPropsOn) === '["messages.id"]' &&
    (await path()) === '/merging',
)
await page.click('[data-testid=more]')
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid=messages] li').length === 9,
)
await page.click('[data-testid=reset]')
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid=messages] li').length === 3,
)
await sleep(200)
ok(
  'merge: X-Inertia-Reset replaces instead (no mergeProps)',
  lastJson('/merging')?.req['x-inertia-reset'] === 'messages' &&
    !lastJson('/merging')?.body.mergeProps,
)
const firstLog = await page.$eval('[data-testid=log] li', (e) => e.textContent)
await page.click('[data-testid=add-log]')
await page.waitForFunction(() => document.querySelectorAll('[data-testid=log] li').length === 2)
ok(
  'prepend: the new entry comes first',
  (await page.$$eval('[data-testid=log] li', (l) => l.map((e) => e.textContent)))[1] === firstLog,
)
await page.click('[data-testid=count-archive]')
await page.waitForFunction(() =>
  document.querySelector('[data-testid=counters]').textContent.includes('archive'),
)
const counters = JSON.parse(await testid('counters'))
ok(
  'deepMerge: nested keys are merged',
  'inbox' in counters.unread && 'archive' in counters.unread,
  JSON.stringify(counters),
)

// ---- infinite scroll
{
  const html = await (await fetch(BASE + '/infinite')).text()
  ok(
    'scroll(): scrollProps in the page, 15 people',
    html.includes(
      '"scrollProps":{"people":{"pageName":"page","currentPage":1,"previousPage":null,"nextPage":2,"reset":false}}',
    ) && html.includes('"mergeProps":["people.data"]'),
  )
  await nav('/infinite')
  await h1('Infinite scroll')
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  await page
    .waitForFunction(() => document.querySelectorAll('[data-testid=people] li').length >= 30, {
      timeout: 8000,
    })
    .catch(() => {})
  await sleep(300)
  const more = pageJson.filter((p) => p.url.startsWith('/infinite?page=2')).at(-1)
  ok(
    '<InfiniteScroll>: scrolling down appends page 2 (merge intent: append), the URL follows',
    (await page.$$('[data-testid=people] li')).length >= 30 &&
      more?.req['x-inertia-infinite-scroll-merge-intent'] === 'append' &&
      more.body.scrollProps.people.currentPage === 2,
    `${(await page.$$('[data-testid=people] li')).length} ${await path()}`,
  )
  const p3 = await (
    await fetch(BASE + '/infinite?page=3', {
      headers: inertia({
        'X-Inertia-Partial-Component': 'infinite',
        'X-Inertia-Partial-Data': 'people',
        'X-Inertia-Infinite-Scroll-Merge-Intent': 'prepend',
      }),
    })
  ).json()
  ok(
    'scroll(): loading the previous page prepends',
    JSON.stringify(p3.prependProps) === '["people.data"]' &&
      p3.scrollProps.people.previousPage === 2 &&
      p3.props.people.data[0].id === 31,
  )
}

// ---- once props
await nav('/once')
await h1('Once props')
await page.waitForFunction(() =>
  /\d/.test(document.querySelector('[data-testid=permissions]')?.textContent ?? ''),
)
const plans = await testid('plans')
const permissions = await testid('permissions')
await page.click('[data-testid=second]')
await waitText("You're on the second page")
await sleep(200)
res = lastJson('/once?page=second')
ok(
  'once: the client lists what it holds, the server skips it, the page still shows it',
  (res?.req['x-inertia-except-once-props'] ?? '').split(',').sort().join() ===
    'permissions,plans,rates' &&
    !('plans' in res.body.props) &&
    (await testid('plans')) === plans,
  JSON.stringify(res && [res.req['x-inertia-except-once-props'], Object.keys(res.body.props)]),
)
ok(
  'once(defer()): deferred on the first visit only; held, it is not asked for again',
  !res?.body.deferredProps && (await testid('permissions')) === permissions,
  JSON.stringify(res?.body.deferredProps),
)
const noHeader = await (await fetch(BASE + '/once?page=second', { headers: inertia() })).json()
ok(
  'once: computed when the client does not hold it',
  typeof noHeader.props.plans === 'string' && noHeader.onceProps.rates.expiresAt > Date.now(),
)
await page.click('[data-testid=fresh]')
await waitText("You're on the first page")
await sleep(200)
ok(
  'once: fresh sends it although the client holds it',
  'plans' in (lastJson('/once?fresh')?.body.props ?? {}) && (await testid('plans')) !== plans,
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
await page.click('[data-testid=add-contact] button')
await page.waitForSelector('[data-testid=err-email]')
const formErrors = [await testid('err-name'), await testid('err-email')]
ok(
  '<Form>: an invalid submit comes back with the field errors, URL unchanged',
  formErrors.every(Boolean) && (await path()) === '/contacts',
  JSON.stringify(formErrors),
)
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
await page.waitForFunction(
  () => !document.querySelector('[data-testid=add-contact] button').disabled,
)
await page.$eval('[data-testid=add-contact] button', (b) => b.click())
await waitText('Added Grace Hopper')
ok(
  '<Form>: a valid submit -> 303 back, flash, list updated, form reset',
  (await text()).includes(graceEmail) &&
    (await page.$eval('[data-testid=add-contact] input[name=name]', (e) => e.value)) === '',
)
{
  // the same address again, typed in capitals: checked as the field is left (Precognition), refused on submit
  const before = precognition.length
  await setValue('[data-testid=add-contact] input[name=email]', graceEmail.toUpperCase())
  const typing = precognition.length - before
  await page.keyboard.press('Tab')
  await page
    .waitForSelector('[data-testid=add-contact] [data-testid=err-email]', { timeout: 6000 })
    .catch(() => {})
  const live = await testid('err-email')
  await setValue('[data-testid=add-contact] input[name=name]', 'Grace Again')
  await page.$eval('[data-testid=add-contact] button', (b) => b.click())
  await page
    .waitForFunction(() => document.activeElement?.name === 'email', { timeout: 4000 })
    .catch(() => {})
  ok(
    'an address already in the contacts (any case): refused when the field is left, and on submit',
    typing === 0 &&
      live === 'Already in your contacts' &&
      (await testid('err-email')) === 'Already in your contacts' &&
      !(await text()).includes('Added Grace Again'),
    JSON.stringify({ typing, live }),
  )
}
{
  const rows = (await page.$$('[data-testid=contacts] li')).length
  await page.setRequestInterception(true)
  const hold = (r) => {
    if (r.isInterceptResolutionHandled()) return
    if (r.method() === 'POST' && r.url().endsWith('/contacts?delete'))
      setTimeout(() => r.continue().catch(() => {}), 1500)
    else r.continue().catch(() => {})
  }
  page.on('request', hold)
  await page.$eval('[data-testid=contacts] li:last-child button', (b) => b.click())
  const asked = await page.waitForSelector('[role=alertdialog]', { timeout: 3000 }).then(
    () => true,
    () => false,
  )
  await page.click('[data-testid=confirm-delete]')
  await sleep(300)
  const during = (await page.$$('[data-testid=contacts] li')).length
  await waitText('Contact deleted')
  page.off('request', hold)
  await page.setRequestInterception(false)
  ok(
    'delete: confirmed first, then the row is gone before the server answers (optimistic)',
    asked &&
      during === rows - 1 &&
      (await page.$$('[data-testid=contacts] li')).length === rows - 1,
    `${asked} ${rows} -> ${during}`,
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
// the form shows its bag's errors only (useForm with errorBag: the response's errors.rename)
ok(
  'error bags: the rename errors arrive in its bag and show only there',
  fetches.filter((f) => f.method === 'POST').at(-1)?.headers['x-inertia-error-bag'] === 'rename' &&
    (await page.$('[data-testid=err-email]')) === null &&
    Boolean(await testid('err-rename')),
  await testid('err-rename'),
)
await page
  .waitForFunction(
    () => document.activeElement === document.querySelector('[data-testid=rename] input'),
    {
      timeout: 2000,
    },
  )
  .catch(() => {})
ok(
  "useForm in Base UI's form: the server's errors put the focus on the field",
  await page.evaluate(
    () => document.activeElement === document.querySelector('[data-testid=rename] input'),
  ),
)
await setValue('[data-testid=email] input', 'nope')
await page.click('[data-testid=email] button')
await page.waitForSelector('[data-testid=err-email]')
await until(() => lastBody()?.body.props.errors?.email)
{
  const bagged = await fetchAs(BASE + '/contacts/1?email', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      ...inertia(),
      'X-Inertia-Error-Bag': 'email',
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      Referer: BASE + '/contacts/1',
    },
    body: '{"email":"nope"}',
  })
  ok(
    'error bags: the other form, its own bag',
    (await testid('err-email')) === 'Enter a valid email' &&
      decodeURIComponent(bagged.headers.get('set-cookie') ?? '').includes(
        '"errors":{"email":{"email":"Enter a valid email"}}',
      ),
  )
}
const original = await testid('contact-name')
await setValue('[data-testid=rename] input', original + ' B')
await page.click('[data-testid=rename] button')
await page.waitForFunction(
  (n) => document.querySelector('[data-testid=contact-name]').textContent === n,
  {},
  original + ' B',
)
ok(
  'useForm: renamed in place, no extra history entries',
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
    'no JS: <Form> is a real form (method=post, action)',
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
  'redirect to another page: an Inertia visit, flash carried',
  (await path()) === '/props' &&
    (await text()).includes('Redirected from /redirects') &&
    docs.length === 0,
)
await page.goto(BASE + '/redirects', { waitUntil: 'networkidle0' })
docs.length = 0
await page.click('[data-testid=fragment]')
await page.waitForFunction(() => location.hash === '#target', { timeout: 5000 }).catch(() => {})
await sleep(500)
const fragment = pageJson.find((p) => p.url === '/redirects?fragment')
ok(
  'redirect with a #fragment: 409 + X-Inertia-Redirect, the client visits it and scrolls there',
  fragment?.status === 409 &&
    fragment.headers['x-inertia-redirect'] === '/redirects#target' &&
    (await page.evaluate(() => location.hash)) === '#target' &&
    (await page.evaluate(() => scrollY)) > 300 &&
    docs.length === 0,
  `${fragment?.status} ${await page.evaluate(() => location.href)} ${await page.evaluate(() => scrollY)}`,
)
await page.evaluate(() => scrollTo(0, 0))
await page.click('[data-testid=external]')
await page
  .waitForFunction(() => location.pathname === '/api/health', { timeout: 5000 })
  .catch(() => {})
ok(
  'location(c, url): 409 + X-Inertia-Location, the browser loads it as a document',
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
  'a visit from another build: 409 + X-Inertia-Location (production); dev has no version',
  assetVersion
    ? stale.status === 409 && stale['X-Inertia-Location'].endsWith('/versioning')
    : stale.status === 200,
  JSON.stringify(stale),
)
{
  await page.setRequestInterception(true)
  let once = true
  const fake = (r) => {
    if (r.isInterceptResolutionHandled()) return
    if (once && r.headers()['x-inertia'] && new URL(r.url()).pathname === '/props') {
      once = false
      return void r.respond({
        status: 409,
        headers: { 'X-Inertia-Location': BASE + '/props' },
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

// ---- history encryption
await nav('/history')
await h1('History encryption')
// Inertia writes the history entry once it is encrypted (Web Crypto: asynchronous)
await page.waitForFunction(() => window.history.state?.page, { timeout: 3000 }).catch(() => {})
await page.click('[data-testid=read]')
ok(
  'encryptHistory: the page state in history is encrypted',
  /^encrypted: \d+ bytes$/.test(await testid('stored')),
  await testid('stored'),
)
// the page object after the redirect, read from its own response (the response listener above may miss its body)
const cleared = page.waitForResponse(
  (r) =>
    r.url() === BASE + '/history' &&
    r.status() === 200 &&
    r.request().headers()['x-inertia'] !== undefined,
  { timeout: 8000 },
)
await page.click('[data-testid=clear]')
const clearedPage = await cleared.then((r) => r.json()).catch(() => null)
await waitText('History cleared')
ok(
  'clearHistory(c): the next page clears the history (clearHistory: true)',
  clearedPage?.clearHistory === true,
)

// ---- server-side rendering
{
  const ssr = await (await fetch(BASE + '/ssr')).text()
  const browserOnly = await (await fetch(BASE + '/ssr/browser')).text()
  ok(
    'SSR: a document is server-rendered',
    ssr.includes('<div data-server-rendered="true" id="app">') &&
      ssr.includes('Server-side rendering</h1>'),
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
    '<WhenMounted>: the fallback is in the server HTML, the browser part is not',
    ssr.includes('Rendered on the server: no window here.') && !ssr.includes('Window width'),
  )
}

// ---- navigation
await page.goto(BASE + '/navigation', { waitUntil: 'networkidle0' })
await page.evaluate(() => {
  window.__vt = 0
})
await nav('/routes')
await h1('Routes & actions')
await nav('/navigation')
await h1('Navigation')
ok('no view transition on ordinary visits', (await page.evaluate(() => window.__vt)) === 0)
await page.click('[data-testid=vt]')
await h1('Routes & actions')
await sleep(400)
ok('<Link viewTransition> runs one', (await page.evaluate(() => window.__vt)) === 1)
ok(
  'href(): the link has the filled URL',
  (await page.$eval('[data-testid=contact-1]', (e) => e.getAttribute('href'))) === '/contacts/1',
)
await nav('/navigation')
await h1('Navigation')
await page.click('[data-testid=click]')
await page.click('[data-testid=click]')
const served = await testid('served-at')
await page.click('[data-testid=preserve]')
await page.waitForFunction(
  (s) => document.querySelector('[data-testid=served-at]').textContent !== s,
  {},
  served,
)
ok('preserveState: new props, the component state kept', (await testid('clicks')) === '2')
await page.click('[data-testid=reset-state]')
await page
  .waitForFunction(() => document.querySelector('[data-testid=clicks]').textContent === '0', {
    timeout: 5000,
  })
  .catch(() => {})
ok('a plain visit to the same page resets it', (await testid('clicks')) === '0')
await page.type('[data-testid=note]', 'remember me')
await nav('/props')
await h1('Props')
await page.goBack()
await h1('Navigation')
await sleep(200)
ok(
  'useRemember: the input is restored by Back',
  (await page.$eval('[data-testid=note]', (e) => e.value)) === 'remember me',
)

// ---- sign in, the API, the account
docs.length = 0
await nav('/account')
await h1('Sign in')
ok(
  'a protected page: a guest is sent to /login?next=… (client visit)',
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
ok('useHttp: processing while the request runs', (await testid('load')) === 'Loading…')
await page.waitForSelector('[data-testid=api-users]')
ok('useHttp: the response', (await page.$$('[data-testid=api-users] li')).length > 0)
await page.click('[data-testid=create] button')
await page.waitForSelector('[data-testid=err-email]')
ok(
  'useHttp: a 422 { errors } becomes field errors',
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
  "Base UI's form, given useHttp's errors: the first field to fix has the focus",
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
  "<Form>: the profile saved by Better Auth, the header's user renewed with it (its session cookie)",
  (await page.$eval('[data-testid=user]', (e) => e.ariaLabel)) === 'Demo Person',
)
await setValue('main form input[name=name]', 'Demo User')
await page.click('main form button')
await page.waitForFunction(
  () => document.querySelector('[data-testid=user]')?.ariaLabel === 'Demo User',
)

// ---- live validation (Precognition) and the same schema in the browser
{
  await nav('/contacts')
  await h1('Forms & validation')
  await page.type('[data-testid=add-contact] input[name=email]', 'nope')
  await page.keyboard.press('Tab')
  await page
    .waitForSelector('[data-testid=add-contact] [data-testid=err-email]', { timeout: 6000 })
    .catch(() => {})
  ok(
    "Precognition: the field is checked by the action's schema when it is left (nothing is added)",
    precognition.at(-1) === '/contacts' &&
      (await testid('err-email')) === 'Enter a valid email' &&
      !(await text()).includes('Added'),
    `${precognition.length} requests`,
  )
  // then, while it is wrong, as it is typed in: the error goes once the address is valid, without a submit
  await setValue('[data-testid=add-contact] input[name=email]', `typed-${Date.now()}@x.org`)
  await page
    .waitForFunction(
      () => !document.querySelector('[data-testid=add-contact] [data-testid=err-email]'),
      { timeout: 6000 },
    )
    .catch(() => {})
  ok(
    'Precognition: a field with an error is checked again as it is typed in, and the error goes',
    (await page.$('[data-testid=add-contact] [data-testid=err-email]')) === null &&
      (await page.evaluate(() => document.activeElement?.name)) === 'email' &&
      !(await text()).includes('Added'),
  )
  const before = fetches.length
  const firstQuick = () =>
    document.activeElement === document.querySelector('[data-testid=quick-contact] input')
  await page.click('[data-testid=quick-contact] button')
  await page.waitForSelector('[data-testid=quick-err-name]')
  await page.waitForFunction(firstQuick, { timeout: 2000 }).catch(() => {})
  ok(
    "the same schema in the browser: errors at once, no request; Base UI's form focuses the first",
    (await testid('quick-err-email')) === 'Enter a valid email' &&
      fetches.length === before &&
      (await page.evaluate(firstQuick)),
  )
  // what is typed clears its field's error, so the form can be sent again
  const quickName = `Quick ${Date.now()}`
  await setValue('[data-testid=quick-contact] > :nth-child(1) input', quickName)
  await setValue('[data-testid=quick-contact] > :nth-child(2) input', `quick-${Date.now()}@x.org`)
  const cleared = (await page.$('[data-testid=quick-err-name]')) === null
  await page.click('[data-testid=quick-contact] button')
  await waitText(`Added ${quickName}`)
  ok(
    "useForm: typing clears the field's error, and the fixed form is sent",
    cleared && (await text()).includes(`Added ${quickName}`),
  )
}

// ---- errors: the error page, and the development report in Inertia's dialog
{
  const dev = !assetVersion
  await nav('/errors')
  await h1('Errors')
  await page.click('[data-testid=visit-403-forbidden]')
  await page.waitForSelector('[data-testid=error-status]')
  ok(
    'HTTPException(403) during a visit: the error page with the status, in the layout',
    (await testid('error-status')) === '403' && (await page.$('aside')) !== null,
  )
  await page.goBack()
  await h1('Errors')
  await page.click('[data-testid=visit-500-loader]')
  if (dev) {
    await page.waitForSelector('dialog#inertia-error-dialog iframe')
    const report = await page.$eval('dialog#inertia-error-dialog iframe', (f) => f.srcdoc)
    ok(
      "a thrown error during a visit (development): the report, in Inertia's dialog",
      report.includes('The loader failed') && report.includes('Stack'),
    )
    await page.keyboard.press('Escape')
  } else {
    await page.waitForSelector('[data-testid=error-status]')
    ok(
      'a thrown error during a visit (production): the error page, status 500',
      (await testid('error-status')) === '500',
    )
    await page.goBack()
    await h1('Errors')
  }
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
    headers: { ...inertia(), Origin: ORIGIN },
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
  // a proxy's own page (here, the app's route standing in for one), during a visit
  await page.click('[data-testid=visit-502-proxy]')
  if (dev) {
    await page
      .waitForSelector('dialog#inertia-error-dialog iframe', { timeout: 8000 })
      .catch(() => {})
    const shown = await page
      .$eval('dialog#inertia-error-dialog iframe', (f) => f.srcdoc)
      .catch(() => '')
    ok(
      "an answer that isn't a page (development): in Inertia's dialog",
      shown.includes('Bad gateway'),
    )
    await page.keyboard.press('Escape')
  } else {
    await page
      .waitForFunction(() => location.pathname === '/errors/proxy', { timeout: 8000 })
      .catch(() => {})
    const loaded = await page.evaluate(() => [
      location.pathname,
      document.querySelector('h1')?.textContent,
      Boolean(document.querySelector('#inertia-error-dialog')),
    ])
    ok(
      "an answer that isn't a page (production): loaded as a document, not in Inertia's dialog",
      JSON.stringify(loaded) === '["/errors/proxy","Bad gateway",false]' &&
        docs.includes(BASE + '/errors/proxy'),
      JSON.stringify(loaded),
    )
    await page.goBack()
    await h1('Errors')
  }
  // the same page after a form (a POST): Inertia's dialog, in production too, and the form as it was
  await page.type('[data-testid=proxy-message]', 'kept')
  await page.click('[data-testid=action-proxy]')
  await page
    .waitForSelector('dialog#inertia-error-dialog iframe', { timeout: 8000 })
    .catch(() => {})
  const afterForm = await page
    .$eval('dialog#inertia-error-dialog iframe', (f) => f.srcdoc)
    .catch(() => '')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('dialog#inertia-error-dialog[open]'), {
    timeout: 3000,
  })
  const form = await page.evaluate(() => [
    location.pathname,
    document.querySelector('[data-testid=proxy-message]')?.value,
  ])
  ok(
    "an answer that isn't a page, after a form: in Inertia's dialog, the form kept",
    afterForm.includes('Bad gateway') && JSON.stringify(form) === '["/errors","kept"]',
    JSON.stringify(form),
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
  // signed out from here, Back: the admin page is not shown again (encrypted in history, cleared)
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
    'signed out on /admin: Back never shows it (history cleared; asked again: the sign-in page)',
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
  await mp.waitForSelector('#menu a[href="/partial"]', { visible: true }).catch(() => {})
  const opened = await shown()
  await mp.evaluate(() => document.querySelector('#menu a[href="/partial"]').click())
  await h1('Partial reloads', mp)
  await mp
    .waitForFunction(() => !document.querySelector('#menu')?.checkVisibility(), { timeout: 3000 })
    .catch(() => {})
  ok(
    'mobile: the menu opens in a drawer from its button and closes after a visit',
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
    'flash on a full page load: a toast (Inertia fires `flash` for the first page too)',
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
    'languages: away and back from the menu (/i18n, a visit): the language picked, /de/i18n',
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
  const inertiaNope = await fetchAs(BASE + '/nope', { headers: inertia() })
  ok(
    'a missing URL, as a visit: the 404 page object, status 404',
    inertiaNope.status === 404 && (await inertiaNope.json()).component === 'error',
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
        { ...json, ...sameSite, 'X-Inertia': 'true', ...headers },
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
      '/app/lib/auth.server.ts?raw',
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
            headers: { ...json, ...sameSite, 'X-Inertia': 'true' },
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
  // what Inertia's client reads when the content has a page-data element of its own (it takes the first one)
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
    if (r.headers()['x-inertia']) requests.push(new URL(r.url()).pathname)
  })
  const at = (p) => hp.waitForFunction((x) => location.pathname === x, {}, p)
  hp.on('request', (r) => {
    if (r.headers()['x-inertia-partial-data']) requests.push(r.headers()['x-inertia-partial-data'])
  })
  await hp.goto(BASE + '/deferred', { waitUntil: 'networkidle0' })
  await hp.waitForSelector('[data-testid=recommendations]')
  await nav('/contacts', hp)
  await at('/contacts')
  await hp.waitForSelector('[data-testid=contacts] li')
  requests.length = 0
  await hp.goBack()
  await at('/deferred')
  const restored =
    (await hp.$('[data-testid=recommendations]')) !== null &&
    (await hp.$('[data-testid=stats]')) !== null
  await sleep(500)
  // Inertia asks again only for the group of the rescued prop (it is missing from the page)
  ok(
    'Back renders the page as it was left, deferred values included, without asking for them again',
    restored && requests.every((r) => r === '/deferred' || r === 'flaky'),
    JSON.stringify(requests),
  )
  requests.length = 0
  await hp.goForward()
  await at('/contacts')
  await sleep(300)
  ok(
    'Forward too',
    (await hp.$('[data-testid=add-contact]')) !== null &&
      !requests.some((r) => r.startsWith('/contacts')),
    JSON.stringify(requests),
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
    'signed out: Back to a private page never shows it (history cleared; asked again: the sign-in page)',
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
  // a route that throws as it is imported: the app doesn't load. Vite's overlay shows it, as a whole page (its error
  // page in Inertia's dialog would be blank); fixed, the page is back
  const broken = await browser.newPage()
  try {
    await broken.goto(BASE + '/props', { waitUntil: 'networkidle0' })
    writeFileSync(file, `throw new Error('a route that fails to load')\n${source}`)
    await broken
      .waitForFunction(() => document.querySelector('vite-error-overlay'), { timeout: 10000 })
      .catch(() => {})
    await sleep(500)
    ok(
      "dev: an app that fails to load, Vite's overlay as a whole page (no blank Inertia dialog)",
      await broken.evaluate(
        () =>
          !document.querySelector('#inertia-error-dialog') &&
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
    await (await fetch(BASE + '/contacts', { headers: inertia() })).json()
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
