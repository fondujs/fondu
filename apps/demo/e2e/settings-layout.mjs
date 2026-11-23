// Keep Account and Usage aligned, including while the usage request is in flight.
export async function checkSettingsLayout({ browser, base, ok, watchProblems }) {
  const page = await browser.newPage()
  watchProblems(page)
  const popup = '[data-testid=settings]'
  let release = () => {}
  let gate = Promise.resolve()
  await page.setRequestInterception(true)
  page.on('request', async (request) => {
    if (new URL(request.url()).pathname === '/api/usage') await gate
    await request.continue()
  })
  const geometry = () =>
    page.$eval(`${popup} [data-slot=dialog-panel]`, (panel) => {
      const box = (el) => {
        const { x, y, width, height } = el.getBoundingClientRect()
        return { x, y, width, height }
      }
      const list = panel.firstElementChild
      return {
        popup: box(panel.closest('[data-testid=settings]')),
        list: box(list),
        column: parseFloat(getComputedStyle(list).gridTemplateColumns),
        rows: getComputedStyle(list).gridTemplateRows,
        cells: [...list.querySelectorAll('dt, dd')].map(box),
        labels: [...list.querySelectorAll('dt')].map((el) => {
          const range = document.createRange()
          range.selectNodeContents(el)
          return {
            height: el.getBoundingClientRect().height,
            line: parseFloat(getComputedStyle(el).lineHeight),
            gap:
              el.nextElementSibling.getBoundingClientRect().left -
              range.getBoundingClientRect().right,
          }
        }),
        overflow: list.scrollWidth > list.clientWidth,
      }
    })
  const sameBox = (a, b) =>
    ['x', 'y', 'width', 'height'].every((key) => Math.abs(a[key] - b[key]) <= 0.5)
  try {
    for (const width of [320, 390, 1280]) {
      await page.setViewport({ width, height: 900 })
      await page.goto(base + '/account#settings/account', { waitUntil: 'networkidle0' })
      await page.waitForSelector('[data-testid=settings-email]')
      await page.evaluate(() => document.fonts.ready)
      await page.$eval(popup, (el) =>
        Promise.all(el.getAnimations().map((animation) => animation.finished)),
      )
      const account = await geometry()
      ok(
        `settings (${width}px): Account labels fit on one line with space before the values`,
        account.labels.length === 2 &&
          account.labels.every((label) => label.height <= label.line && label.gap >= 8) &&
          !account.overflow,
        JSON.stringify(account),
      )
      gate = new Promise((resolve) => (release = resolve))
      await page.click('[data-testid=settings-tab-usage]')
      await page.waitForSelector('[data-testid=usage-loading]')
      const loading = await geometry()
      ok(
        `settings (${width}px): Usage has two skeleton rows, labelled and busy`,
        await page.$eval(
          '[data-testid=usage-loading]',
          (el) =>
            el.tagName === 'DL' &&
            el.getAttribute('aria-busy') === 'true' &&
            el.getAttribute('aria-label') === 'Loading usage' &&
            el.querySelectorAll('dt').length === 2 &&
            el.querySelectorAll('dd').length === 2 &&
            el.querySelectorAll('[data-slot=skeleton]').length === 4,
        ),
      )
      release()
      await page.waitForSelector('[data-testid=usage-contacts]')
      const loaded = await geometry()
      ok(
        `settings (${width}px): Account, loading Usage and loaded Usage share a label width`,
        account.column > 96 &&
          account.column === loading.column &&
          account.column === loaded.column &&
          loaded.labels.every((label) => label.height <= label.line && label.gap >= 8) &&
          !loading.overflow &&
          !loaded.overflow,
        JSON.stringify([account.column, loading.column, loaded.column]),
      )
      ok(
        `settings (${width}px): Usage arriving moves no row or dialog edge`,
        sameBox(loading.popup, loaded.popup) &&
          sameBox(loading.list, loaded.list) &&
          loading.rows === loaded.rows &&
          loading.cells.length === 4 &&
          loaded.cells.length === 4 &&
          loading.cells.every((cell, index) => {
            const next = loaded.cells[index]
            // A 16px bar is centred in the same 20px line box as the text that replaces it.
            return (
              Math.abs(cell.x - next.x) <= 0.5 &&
              Math.abs(cell.width - next.width) <= 0.5 &&
              Math.abs(cell.y + cell.height / 2 - next.y - next.height / 2) <= 0.5
            )
          }),
        JSON.stringify({ loading, loaded }),
      )
      ok(
        `settings (${width}px): loaded Usage is no longer busy or a skeleton`,
        (await page.$('[data-testid=usage-loading]')) === null &&
          (await page.$$(`${popup} [data-slot=skeleton]`)).length === 0 &&
          (await page.$eval(`${popup} dl`, (el) => el.getAttribute('aria-busy'))) === 'false',
      )
    }
  } finally {
    release()
    await page.close()
  }
}
