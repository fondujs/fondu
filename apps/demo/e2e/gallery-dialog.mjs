export async function checkGalleryDialog({ browser, base, ok, watchProblems }) {
  const page = await browser.newPage()
  watchProblems(page)
  await page.setViewport({ width: 1100, height: 850 })
  const card = '[data-testid=dialog-photo-pine-forest]',
    popup = '[data-testid=photo-dialog]'
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.setRequestInterception(true)
  page.on('request', (request) =>
    new URL(request.url()).hostname === 'images.unsplash.com'
      ? request.respond({ status: 200, contentType: 'image/png', body: pixel })
      : request.continue(),
  )
  const made = []
  page.on('request', (request) => {
    if (request.headers()['x-fondu']) made.push(request.url())
  })
  const opened = async () => {
    await page.waitForSelector(`${popup}:not([data-starting-style])`)
    await page.$eval(popup, (element) =>
      Promise.allSettled(
        element.getAnimations({ subtree: true }).map((animation) => animation.finished),
      ),
    )
  }
  const gone = () => page.waitForSelector(popup, { hidden: true })
  const path = () => page.evaluate(() => location.pathname)
  const scroll = () => page.evaluate(() => scrollY)
  try {
    await page.goto(base + '/transitions', { waitUntil: 'networkidle0' })
    ok(
      'gallery dialog: both sections use the same photo URLs, with shallow only on the dialog cards',
      await page.$$eval(
        '[data-testid=dialog-gallery] a[data-shallow]',
        (links) =>
          links.length === 6 &&
          links.every(
            (link) =>
              document
                .querySelector(
                  `[data-testid=photo-${link.dataset.testid.slice('dialog-photo-'.length)}]`,
                )
                ?.getAttribute('href') === link.getAttribute('href') &&
              !link.hasAttribute('data-transition'),
          ),
      ),
    )
    await page.$eval(card, (element) => element.scrollIntoView({ block: 'center' }))
    await page.$eval(`${card} img`, (img) => img.decode())
    const before = await scroll()
    made.length = 0
    await page.click(card)
    await page.waitForSelector(`${popup}:not([data-starting-style])`)
    ok(
      'gallery dialog: the card clips and moves into an accessible dialog, with no page request',
      (await page.$eval(
        popup,
        (element) =>
          element.getAttribute('role') === 'dialog' &&
          document.getElementById(element.getAttribute('aria-labelledby'))?.textContent ===
            'Pine forest' &&
          element.style.getPropertyValue('--photo-origin-clip').startsWith('inset(') &&
          element
            .getAnimations({ subtree: true })
            .some((animation) => animation.transitionProperty === 'transform'),
      )) && made.length === 0,
    )
    await opened()
    ok(
      'gallery dialog: the URL changes but the gallery and its scroll stay',
      (await path()) === '/transitions/pine-forest' &&
        (await page.$('[data-testid=gallery]')) !== null &&
        Math.abs((await scroll()) - before) <= 1,
    )
    await page.keyboard.press('Escape')
    await page.waitForSelector(`${popup}[data-ending-style]`)
    ok(
      'gallery dialog: Escape shrinks back to the card',
      await page.$eval(popup, (element) =>
        element
          .getAnimations({ subtree: true })
          .some((animation) => animation.transitionProperty === 'transform'),
      ),
    )
    await gone()
    ok(
      'gallery dialog: Escape keeps scroll, restores focus and unlocks the gallery',
      (await path()) === '/transitions' &&
        Math.abs((await scroll()) - before) <= 1 &&
        (await page.$eval(card, (element) => element === document.activeElement)) &&
        !(await page.evaluate(() => document.documentElement.hasAttribute('data-gallery-dialog'))),
    )
    await page.goForward()
    await opened()
    ok(
      'gallery dialog: Forward reopens without another request or author animation',
      (await path()) === '/transitions/pine-forest' &&
        made.length === 0 &&
        (await page.$eval(popup, (element) => !element.hasAttribute('data-animate'))),
    )
    await page.goBack()
    await gone()
    ok(
      'gallery dialog: Back closes without another request or scroll change',
      (await path()) === '/transitions' &&
        made.length === 0 &&
        Math.abs((await scroll()) - before) <= 1,
    )
    for (const close of ['photo-dialog-close', 'photo-dialog-backdrop']) {
      await page.click(card)
      await opened()
      if (close === 'photo-dialog-close')
        await page.evaluate(() => {
          const close = document.querySelector('[data-testid=photo-dialog-close]')
          close.click()
          close.click()
        })
      else await page.click(`[data-testid=${close}]`, { offset: { x: 8, y: 8 } })
      await gone()
      ok(`gallery dialog: ${close} closes one entry`, (await path()) === '/transitions')
    }
    await page.click(card)
    await opened()
    await page.reload({ waitUntil: 'networkidle0' })
    ok(
      'gallery dialog: reload loads the existing standalone photo route, not a dialog',
      (await page.$('[data-testid=photo-title]')) !== null &&
        (await page.$(popup)) === null &&
        (await page.$('[data-testid=gallery]')) === null,
    )
    await page.goto(base + '/transitions', { waitUntil: 'networkidle0' })
    const target = browser.waitForTarget(
      (target) =>
        target.type() === 'page' &&
        target !== page.target() &&
        target.url().endsWith('/transitions/pine-forest'),
    )
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.down(modifier)
    try {
      await page.click(card)
    } finally {
      await page.keyboard.up(modifier)
    }
    const tab = await (await target).page()
    await tab.waitForSelector('[data-testid=photo-title]')
    ok(
      'gallery dialog: a modified click opens the standalone page in a new tab',
      (await tab.$(popup)) === null &&
        (await page.$(popup)) === null &&
        (await path()) === '/transitions',
    )
    await tab.close()
    await page.setViewport({ width: 375, height: 812 })
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await page.click(card)
    await opened()
    ok(
      'gallery dialog: mobile reduced motion has no animation or horizontal overflow',
      await page.$eval(
        popup,
        (element) =>
          getComputedStyle(element).transitionDuration === '0s' &&
          element.scrollWidth <= element.clientWidth,
      ),
    )
    await page.keyboard.press('Escape')
    await gone()
    await page.setJavaScriptEnabled(false)
    await page.goto(base + '/transitions', { waitUntil: 'networkidle0' })
    await page.click(card)
    await page.waitForSelector('[data-testid=photo-title]')
    ok(
      'gallery dialog: without JavaScript the same link loads the photo page',
      (await path()) === '/transitions/pine-forest' &&
        (await page.$(popup)) === null &&
        (await page.$('[data-testid=gallery]')) === null,
    )
  } finally {
    await page.close()
  }
}
