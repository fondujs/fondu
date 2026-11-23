// The dashboard's settings overlay shares the POST answer with the entry below it.
export async function checkSettingsHistory({ page, ok }) {
  const dialog = '[data-testid=settings]'
  const original = await page.$eval('[data-testid=user]', (e) => e.getAttribute('aria-label'))
  const requests = []
  const watch = (r) => {
    if (new URL(r.url()).pathname === '/admin/dashboard') requests.push(r.method())
  }
  const open = async () => {
    await page.click('[data-testid=user]')
    await (await page.waitForSelector('[data-testid=settings-link]')).click()
    await page.waitForSelector(`${dialog} input[name=name]`)
  }
  const close = async () => {
    await page.click(`${dialog} button[aria-label=Close]`)
    await page.waitForFunction(() => !document.querySelector('[data-testid=settings]'))
    await page.waitForFunction(
      () => location.pathname === '/admin/dashboard' && location.hash === '',
    )
    await new Promise((resolve) => setTimeout(resolve, 100)) // a late dashboard request would count
  }
  const closed = () =>
    page.evaluate(() => location.pathname === '/admin/dashboard' && location.hash === '')
  page.on('request', watch)
  try {
    await open()
    await close()
    ok(
      'settings on /admin/dashboard: opened and closed without saving, no dashboard request',
      (await closed()) && requests.length === 0,
      JSON.stringify(requests),
    )
    for (const [kind, name] of [
      ['changed', 'Admin Person'],
      ['unchanged', 'Admin Person'],
      ['restored', original],
    ]) {
      await open()
      await page.click(`${dialog} input[name=name]`, { count: 3 })
      await page.keyboard.press('Backspace')
      await page.type(`${dialog} input[name=name]`, name)
      const before = requests.length
      await page.click(`${dialog} button[type=submit]`)
      await page.waitForFunction(
        (name) =>
          document.querySelector('[data-testid=settings-saved]')?.textContent === 'Name saved' &&
          document.querySelector('[data-testid=user]')?.getAttribute('aria-label') === name,
        {},
        name,
      )
      ok(
        `settings on /admin/dashboard: ${kind} name, one dashboard request for the POST answer`,
        requests.length === before + 1 && requests.at(-1) === 'GET',
        JSON.stringify(requests.slice(before)),
      )
      await close()
      ok(
        `settings on /admin/dashboard: closed after ${kind} name, no second dashboard request`,
        (await closed()) && requests.length === before + 1,
        JSON.stringify(requests.slice(before)),
      )
    }
  } finally {
    page.off('request', watch)
  }
}
