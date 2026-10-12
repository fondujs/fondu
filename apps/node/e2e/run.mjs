// Browser end-to-end checks of the Node / Bun example. Start it first (`bun run dev`, or build and `bun run start`
// / `bun run start:bun`), then:  CHROME_PATH=/path/to/chrome node e2e/run.mjs http://localhost:5173 [label]
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const LABEL = process.argv[3] ?? BASE
if (!process.env.CHROME_PATH) {
  console.error('Set CHROME_PATH to a Chrome/Chromium executable.')
  process.exit(2)
}

const results = []
const ok = (name, cond, extra = '') => {
  results.push(Boolean(cond))
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  — ${extra}` : ''}`)
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'], headless: true })
const page = await browser.newPage()
const problems = []
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/status of (404|422)\b/.test(m.text())) problems.push(m.text().slice(0, 240)) })
page.on('pageerror', (e) => problems.push(String(e).slice(0, 240)))
const docs = []
page.on('request', (r) => { if (r.resourceType() === 'document') docs.push(r.url()) })
const h1 = (t) => page.waitForFunction((t) => document.querySelector('h1')?.textContent === t, { timeout: 8000 }, t)
const text = () => page.evaluate(() => document.body.innerText)

for (const p of ['/', '/about', '/todos/1']) await page.goto(BASE + p, { waitUntil: 'networkidle0' }) // dev: warm up
problems.length = 0
console.log(`\n===== ${LABEL} =====`)

const html = await (await fetch(BASE + '/')).text()
ok('a document is server-rendered', /<\/script><div data-server-rendered="true" id="app">/.test(html) && html.includes('Read the Inertia docs'))

await page.goto(BASE + '/', { waitUntil: 'networkidle0' })
docs.length = 0
await page.click('main li a'); await h1('Read the Inertia docs')
ok('<Link>: a visit to /todos/:id (href() filled the URL), no document load', (await page.evaluate(() => location.pathname)) === '/todos/1' && docs.length === 0)
await page.click('nav a[href="/about"]'); await h1('About')
const runtime = await page.$eval('[data-testid=runtime]', (e) => e.textContent)
ok('the loader ran on the server runtime', /^(Node v|Bun)/.test(runtime), runtime)
await page.click('nav a[href="/"]'); await h1('Todos')

await page.click('main form button'); await page.waitForSelector('.error')
ok('action: invalid input -> back to the page with the error', (await text()).includes('At least 2 characters') && (await page.evaluate(() => location.pathname)) === '/')
const title = `Ship it ${Date.now()}`
await page.type('input[name=title]', title)
await page.click('main form button')
await page.waitForFunction((t) => document.body.innerText.includes(t), {}, title)
ok('action: a valid submit -> back, the list updated, the form reset', (await page.$eval('input[name=title]', (e) => e.value)) === '' && docs.length === 0)

const api = await (await fetch(BASE + '/api/todos')).json()
ok('server route GET /api/todos: JSON', Array.isArray(api) && api.some((t) => t.title === title))
const posted = await fetch(BASE + '/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'From the API' }) })
ok('server route POST /api/todos: 201', posted.status === 201 && (await posted.json()).title === 'From the API')
const cross = await fetch(BASE + '/', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'title=x' })
ok('CSRF protection is on by default', cross.status === 403)

const missing = await fetch(BASE + '/todos/999', { headers: { Accept: 'text/html' } })
ok('a 404 from a loader: the error page with the status', missing.status === 404 && (await missing.text()).includes('"props":{"status":404'))
ok('params that do not fit the schema (/todos/abc): 404', (await fetch(BASE + '/todos/abc')).status === 404)
await page.goto(BASE + '/nope', { waitUntil: 'networkidle0' })
ok('an unknown URL: the error page, rendered and hydrated', (await page.$eval('h1', (e) => e.textContent)) === 'Not found')
ok('no console errors or warnings (incl. hydration)', problems.length === 0, problems.slice(0, 3).join(' | '))
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
await browser.close()
process.exitCode = results.every(Boolean) ? 0 : 1
