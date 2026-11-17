// The gallery's app-owned dialog navigation: real route URLs, with an in-memory background only after a click.
export async function checkGalleryDialog({ browser, base, ok, watchProblems }) {
  const page = await browser.newPage()
  watchProblems(page)
  await page.setViewport({ width: 1100, height: 850 })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  )
  let holdLarge = true
  const held = []
  const requests = []
  const image = { status: 200, contentType: 'image/png', body: pixel }
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.hostname === 'images.unsplash.com') {
      if (holdLarge && url.searchParams.get('w') === '1200') held.push(request)
      else request.respond(image)
    } else {
      if (request.isNavigationRequest() || request.headers()['x-fondu']) requests.push(request)
      request.continue()
    }
  })
  const dialog = '[data-testid=photo-dialog]'
  const card = '[data-testid=dialog-photo-pine-forest]'
  const photoPath = '/transitions/dialog/pine-forest'
  const path = () => page.evaluate(() => location.pathname + location.search)
  const opened = async () => {
    await page.waitForSelector(`${dialog}:not([data-starting-style])`)
    await page.$eval(dialog, (popup) =>
      Promise.all(popup.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    )
  }
  const gone = () => page.waitForSelector(dialog, { hidden: true })
  const open = async () => {
    await page.click(card)
    await opened()
  }
  const gallery = () => page.goto(base + '/transitions', { waitUntil: 'networkidle0' })
  const navProps = () =>
    page.evaluate(() => document.querySelector('aside a[href="/props"]').click())

  try {
    await gallery()
    ok(
      'gallery: page-transition thumbnails have their own top corners, not only their parent’s clipping',
      await page.$$eval(
        '[data-testid=gallery] img',
        (images) =>
          images.length === 6 &&
          images.every((img) => {
            const style = getComputedStyle(img)
            return (
              parseFloat(style.borderTopLeftRadius) > 0 && style.borderBottomLeftRadius === '0px'
            )
          }),
      ),
    )
    ok(
      'gallery dialog: six distinct real detail links, separate from Card to page; no divider',
      await page.evaluate(() => {
        const links = [
          ...document.querySelectorAll('[data-testid=dialog-gallery] a[aria-haspopup=dialog]'),
        ]
        return (
          links.length === 6 &&
          new Set(links.map((a) => a.href)).size === 6 &&
          links.every(
            (a) =>
              a.getAttribute('href').startsWith('/transitions/dialog/') &&
              !a.hasAttribute('data-shallow'),
          ) &&
          getComputedStyle(document.querySelector('[aria-labelledby=dialog-gallery-title]'))
            .borderTopWidth === '0px'
        )
      }),
    )
    await page.$eval(card, (a) => a.scrollIntoView({ block: 'center' }))
    await page.$eval(`${card} img`, (img) => img.decode())
    const scroll = await page.evaluate(() => scrollY)
    const grid = await page.$('[data-testid=dialog-gallery]')
    const entry = await page.evaluateHandle(() => {
      const result = { animations: [] }
      const observer = new MutationObserver(() => {
        const popup = document.querySelector(
          '[data-testid=photo-dialog]:not([data-starting-style])',
        )
        if (!popup) return
        const animations = popup.getAnimations({ subtree: true })
        if (!animations.some((a) => a.transitionProperty === 'transform')) return
        result.animations = animations.map((a) => ({
          media: a.effect.target === popup.querySelector('img'),
          property: a.transitionProperty,
          frames: a.effect.getKeyframes(),
        }))
        observer.disconnect()
      })
      observer.observe(document.body, { subtree: true, childList: true, attributes: true })
      return { result, observer }
    })
    requests.length = 0
    await open()
    ok(
      'gallery dialog: a normal visit loads its photo route, keeps the same list and scroll, and opens an accessible modal',
      (await path()) === photoPath &&
        (await grid.evaluate((element) => element.isConnected)) &&
        (await page.evaluate(() => scrollY)) === scroll &&
        requests.some((r) => r.headers()['x-fondu'] && new URL(r.url()).pathname === photoPath) &&
        requests.every((r) => !r.isNavigationRequest()) &&
        (await page.$eval(
          dialog,
          (popup) =>
            popup.getAttribute('role') === 'dialog' &&
            popup.querySelector(`#${CSS.escape(popup.getAttribute('aria-labelledby'))}`)
              ?.textContent === 'Pine forest' &&
            popup.contains(document.activeElement),
        )) &&
        (await page.$('[data-testid=photo-page]')) === null,
    )
    const animations = await entry.evaluate(({ result, observer }) => {
      observer.disconnect()
      return result.animations
    })
    await entry.dispose()
    ok(
      'gallery dialog: entry animates the rounded image from the card, not just a centered fade',
      animations.some(
        (a) =>
          a.media &&
          a.property === 'transform' &&
          a.frames[0].transform !== 'none' &&
          a.frames.at(-1).transform === 'none',
      ) &&
        animations.some(
          (a) => a.property === 'clip-path' && a.frames[0].clipPath.includes('round'),
        ),
    )
    ok(
      'gallery dialog: a slow large image leaves the cached thumbnail visible during expansion',
      await page.$eval(
        `${dialog} img`,
        (img) =>
          img.complete && img.naturalWidth > 0 && new URL(img.src).searchParams.get('w') === '640',
      ),
    )
    holdLarge = false
    await Promise.all(held.splice(0).map((request) => request.respond(image)))

    for (const method of ['close button', 'Escape', 'backdrop', 'Back']) {
      if (method !== 'close button') await open()
      const exit = await page.evaluateHandle(() => {
        const popup = document.querySelector('[data-testid=photo-dialog]')
        const samples = []
        const observer = new MutationObserver(() => {
          if (!popup.isConnected || !popup.hasAttribute('data-ending-style')) return
          samples.push({
            title: popup.querySelector('[data-slot=dialog-title]')?.textContent,
            returning: popup
              .getAnimations({ subtree: true })
              .some(
                (a) =>
                  a.transitionProperty === 'transform' &&
                  a.effect.getKeyframes().at(-1).transform !== 'none',
              ),
          })
        })
        observer.observe(popup, { attributes: true, childList: true, subtree: true })
        return { samples, observer }
      })
      if (method === 'Back') await page.goBack()
      else if (method === 'Escape') await page.keyboard.press('Escape')
      else if (method === 'backdrop') await page.mouse.click(8, 8)
      else await page.click('[data-testid=photo-dialog-close]')
      await gone()
      await page.waitForFunction(
        () => document.activeElement?.getAttribute('data-testid') === 'dialog-photo-pine-forest',
      )
      const samples = await exit.evaluate(({ samples, observer }) => {
        observer.disconnect()
        return samples
      })
      await exit.dispose()
      ok(
        `gallery dialog: ${method} returns to the card, keeps its content while shrinking, restores focus and unlocks scroll`,
        (await path()) === '/transitions' &&
          Math.abs((await page.evaluate(() => scrollY)) - scroll) <= 1 &&
          samples.some((sample) => sample.returning) &&
          samples.every((sample) => sample.title === 'Pine forest') &&
          (await page.$eval(
            '#dialog-photo-pine-forest',
            (img) => getComputedStyle(img).visibility === 'visible',
          )) &&
          (await page.evaluate(() =>
            [document.documentElement, document.body].every(
              (element) => getComputedStyle(element).overflowY !== 'hidden',
            ),
          )),
      )
    }
    await open()
    await page.evaluate(() => {
      const close = document.querySelector('[data-testid=photo-dialog-close]')
      close.click()
      // The second press happens while the retained content is still animating out.
      setTimeout(() => {
        if (close.isConnected) close.click()
      }, 50)
    })
    await gone()
    ok(
      'gallery dialog: a repeated close during the exit animation goes back only one entry',
      (await path()) === '/transitions' && (await grid.evaluate((element) => element.isConnected)),
    )
    await grid.dispose()
    await page.goForward()
    await opened()
    ok(
      'gallery dialog: Forward reopens the dialog over the gallery',
      (await path()) === photoPath && (await page.$('[data-testid=dialog-gallery]')) !== null,
    )

    // An app-initiated visit while the modal is open must not lose its origin when its route's layout goes away.
    await navProps()
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Props')
    await gone()
    ok(
      'gallery dialog: another demo has no leftover modal, backdrop or scroll lock',
      (await path()) === '/props' &&
        (await page.$('.gallery-dialog-backdrop')) === null &&
        (await page.evaluate(() =>
          [document.documentElement, document.body].every(
            (element) => getComputedStyle(element).overflowY !== 'hidden',
          ),
        )),
    )
    await page.goBack()
    await opened()
    ok(
      'gallery dialog: Back from another demo restores the dialog, not the standalone page',
      (await path()) === photoPath &&
        (await page.$('[data-testid=dialog-gallery]')) !== null &&
        (await page.$('[data-testid=photo-page]')) === null &&
        Math.abs((await page.evaluate(() => scrollY)) - scroll) <= 1,
    )
    await page.goForward()
    await gone()
    ok('gallery dialog: Forward leaves for the other demo again', (await path()) === '/props')
    await page.goBack()
    await opened()
    await page.click('[data-testid=photo-dialog-close]')
    await gone()
    ok(
      'gallery dialog: closing after Back goes one entry to the gallery',
      (await path()) === '/transitions',
    )
    await page.goForward()
    await opened()
    await page.goForward()
    await gone()
    await page.evaluate(() => history.go(-2))
    await page.waitForFunction(() => location.pathname === '/transitions')
    await gone()
    await page.evaluate(() => history.go(2))
    await page.waitForFunction(() => location.pathname === '/props')
    await gone()
    ok(
      'gallery dialog: traversal across multiple entries neither reopens a skipped modal nor traps navigation',
      (await path()) === '/props',
    )

    // The same URL in a new, ordinary navigation is not the dialog entry we visited earlier.
    await page.evaluate(() => {
      const link = document.createElement('a')
      link.href = '/transitions/dialog/pine-forest'
      document.body.append(link)
      link.click()
      link.remove()
    })
    await page.waitForSelector('[data-testid=photo-page]')
    ok(
      'gallery dialog: an ordinary link from another demo does not reopen a previously visited dialog',
      (await path()) === photoPath &&
        (await page.$(dialog)) === null &&
        (await page.$('[data-testid=gallery]')) === null,
    )
    await page.goBack()
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Props')
    await page.goBack()
    await opened()
    ok(
      'gallery dialog: Back restores the original dialog entry even after an ordinary visit to the same URL',
      (await path()) === photoPath && (await page.$('[data-testid=photo-page]')) === null,
    )
    await page.goForward()
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Props')
    await page.goForward()
    await page.waitForSelector('[data-testid=photo-page]')
    ok(
      'gallery dialog: Forward restores the separate standalone entry at that same URL',
      (await path()) === photoPath && (await page.$(dialog)) === null,
    )
    await page.goBack()
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Props')
    await page.goBack()
    await opened()
    await page.reload({ waitUntil: 'networkidle0' })
    ok(
      'gallery dialog: a reload renders only the standalone photo, with no gallery, modal, dark panel or close button',
      (await path()) === photoPath &&
        (await page.$('[data-testid=photo-page]')) !== null &&
        (await page.$('[data-testid=dialog-gallery]')) === null &&
        (await page.$(dialog)) === null &&
        (await page.$eval(
          '[data-testid=photo-page]',
          (element) =>
            element.querySelector('h1')?.textContent === 'Pine forest' &&
            !element.querySelector('button') &&
            element.querySelector('a[href="/transitions"]') !== null &&
            getComputedStyle(element).backgroundColor === 'rgba(0, 0, 0, 0)',
        )),
    )
    await page.goto(base + '/transitions/dialog/misty-ridge', { waitUntil: 'networkidle0' })
    ok(
      'gallery dialog: a shared or new-tab URL is its own detail page',
      (await page.$eval('h1', (h1) => h1.textContent)) === 'Misty ridge' &&
        (await page.$('[data-testid=gallery]')) === null &&
        (await page.$(dialog)) === null,
    )
    await page.click('main a[href="/transitions"]')
    await page.waitForSelector('[data-testid=gallery]')
    await open()
    await page.keyboard.press('Escape')
    await gone()
    await page.click('[data-testid=photo-pine-forest]')
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Pine forest')
    ok(
      'gallery dialog: Card to page still opens its different, non-modal route after using a dialog',
      (await path()) === '/transitions/pine-forest' &&
        (await page.$(dialog)) === null &&
        (await page.$('[data-testid=photo-page]')) === null,
    )

    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await page.setViewport({ width: 390, height: 844 })
    await gallery()
    await page.$eval(card, (a) => {
      a.scrollIntoView({ block: 'center' })
      a.focus()
    })
    await page.keyboard.press('Enter')
    await opened()
    ok(
      'gallery dialog: keyboard opening, mobile layout and reduced motion',
      await page.$eval(dialog, (popup) => {
        const img = popup.querySelector('img')
        const rect = img.getBoundingClientRect()
        return (
          popup.contains(document.activeElement) &&
          rect.width > 0 &&
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          getComputedStyle(popup).transitionDuration === '0s' &&
          getComputedStyle(img).transitionDuration === '0s' &&
          getComputedStyle(document.querySelector('.gallery-dialog-backdrop'))
            .transitionDuration === '0s'
        )
      }),
    )
    await page.keyboard.press('Escape')
    await gone()

    await page.setJavaScriptEnabled(false)
    await gallery()
    await page.click(card)
    await page.waitForSelector('[data-testid=photo-page]')
    ok(
      'gallery dialog: without JavaScript the same card is an ordinary link to the standalone page',
      (await path()) === photoPath &&
        (await page.$eval('h1', (h1) => h1.textContent)) === 'Pine forest' &&
        (await page.$('[data-testid=gallery]')) === null,
    )
    await page.setJavaScriptEnabled(true)
    await page.evaluateOnNewDocument(() =>
      Object.defineProperty(window, 'navigation', { value: undefined }),
    )
    await gallery()
    await page.click(card)
    await opened()
    ok(
      'gallery dialog: without the Navigation API the card still opens a dialog',
      (await path()) === photoPath &&
        (await page.$('[data-testid=photo-page]')) === null &&
        (await page.$('[data-testid=gallery]')) !== null,
    )
    await page.keyboard.press('Escape')
    await gone()
    ok(
      'gallery dialog: an unknown photo is a 404',
      (await fetch(base + '/transitions/dialog/nope')).status === 404,
    )
  } finally {
    await page.close()
  }
}
