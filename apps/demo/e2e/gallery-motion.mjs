// Browser-owned traversals and the native photo snapshots, separate from the ordinary dialog navigation cases.
export async function checkGalleryMotion({ browser, base, ok, watchProblems }) {
  const page = await browser.newPage()
  watchProblems(page)
  await page.setViewport({ width: 1100, height: 850 })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  )
  const image = { status: 200, contentType: 'image/png', body: pixel }
  let large = 'ok'
  const held = []
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.hostname !== 'images.unsplash.com') return void request.continue()
    if (url.searchParams.get('w') === '1200') {
      if (large === 'hold') return void held.push(request)
      if (large === 'invalid') return void request.respond({ ...image, body: 'invalid image' })
    }
    request.respond(image)
  })
  await page.evaluateOnNewDocument(() => {
    window.__nativeNext = false
    window.__nativeFrame = null
    window.__pausePhoto = false
    window.__photoReady = false
    window.__viewCalls = 0
    window.__decodeFailures = []
    // Model the browser's native-animation signal, not a physical Safari gesture. Capture precedes the app.
    addEventListener(
      'popstate',
      (event) => {
        if (!window.__nativeNext) return
        window.__nativeNext = false
        Object.defineProperty(event, 'hasUAVisualTransition', { value: true })
        requestAnimationFrame(() => {
          const popup = document.querySelector('[data-testid=photo-dialog]')
          const source = document.querySelector('#dialog-photo-pine-forest')
          window.__nativeFrame = {
            path: location.pathname,
            popup: !!popup,
            native: popup?.hasAttribute('data-native-transition'),
            backdrop: !!document.querySelector('.gallery-dialog-backdrop'),
            ownLock: document.documentElement.hasAttribute('data-gallery-dialog'),
            locked: [document.documentElement, document.body].some(
              (element) => getComputedStyle(element).overflowY === 'hidden',
            ),
            sourceVisible: source && getComputedStyle(source).visibility === 'visible',
            transform: popup && getComputedStyle(popup.querySelector('img')).transform,
            clip: popup && getComputedStyle(popup).clipPath,
            duration: popup && getComputedStyle(popup).transitionDuration,
            imageDuration: popup && getComputedStyle(popup.querySelector('img')).transitionDuration,
            backdropDuration:
              popup &&
              getComputedStyle(document.querySelector('.gallery-dialog-backdrop'))
                .transitionDuration,
            scroll: scrollY,
          }
        })
      },
      true,
    )
    const original = document.startViewTransition
    if (original)
      document.startViewTransition = function (arg) {
        window.__viewCalls++
        const view = original.call(this, arg)
        window.__view = view
        view.ready.then(
          () => {
            if (!window.__pausePhoto) return
            document.getAnimations().forEach((animation) => {
              animation.pause()
              animation.currentTime = 0
            })
            window.__photoReady = true
          },
          () => {},
        )
        return view
      }
    const decode = HTMLImageElement.prototype.decode
    HTMLImageElement.prototype.decode = function (...args) {
      const src = this.src
      return decode.apply(this, args).catch((error) => {
        window.__decodeFailures.push(src)
        throw error
      })
    }
  })
  const dialog = '[data-testid=photo-dialog]'
  const gone = () => page.waitForSelector(dialog, { hidden: true })
  const opened = async () => {
    await page.waitForSelector(`${dialog}:not([data-starting-style])`)
    await page.$eval(dialog, (popup) =>
      Promise.all(popup.getAnimations({ subtree: true }).map((a) => a.finished)),
    )
  }
  const native = async (forward = false) => {
    await page.evaluate(() => {
      window.__nativeNext = true
      window.__nativeFrame = null
    })
    if (forward) await page.goForward()
    else await page.goBack()
    await page.waitForFunction(() => window.__nativeFrame)
    return page.evaluate(() => window.__nativeFrame)
  }
  const gallery = () => page.goto(base + '/transitions', { waitUntil: 'networkidle0' })
  try {
    await gallery()
    await page.click('[data-testid=dialog-photo-pine-forest]')
    await opened()
    const scroll = await page.evaluate(() => scrollY)
    const back = await native()
    ok(
      'gallery motion: native Back has no modal, backdrop, hidden source or scroll lock in its first frame',
      back.path === '/transitions' &&
        !back.popup &&
        !back.backdrop &&
        !back.locked &&
        !back.ownLock &&
        back.sourceVisible &&
        Math.abs(back.scroll - scroll) <= 1,
    )
    await gone()
    const forward = await native(true)
    ok(
      'gallery motion: native Forward lands on an already-open modal, with no author animation or extra frame',
      forward.path === '/transitions/dialog/pine-forest' &&
        forward.popup &&
        forward.native &&
        forward.locked &&
        forward.ownLock &&
        forward.duration === '0s' &&
        forward.imageDuration === '0s' &&
        forward.backdropDuration === '0s' &&
        forward.transform === 'none' &&
        forward.clip === 'inset(0px)' &&
        Math.abs(forward.scroll - scroll) <= 1,
    )
    await opened()
    const exit = await page.evaluateHandle(() => {
      const popup = document.querySelector('[data-testid=photo-dialog]')
      const result = { animated: false }
      const observer = new MutationObserver(() => {
        if (
          popup.hasAttribute('data-ending-style') &&
          !popup.hasAttribute('data-native-transition')
        )
          result.animated ||= popup
            .getAnimations({ subtree: true })
            .some((a) => a.transitionProperty === 'transform')
      })
      observer.observe(popup, { subtree: true, attributes: true })
      return { observer, result }
    })
    await page.goBack()
    await gone()
    const ordinary = await exit.evaluate(({ observer, result }) => {
      observer.disconnect()
      return result.animated
    })
    await exit.dispose()
    ok('gallery motion: an ordinary Back still shrinks the photo after a native Forward', ordinary)
    await native(true)
    await opened()
    await native()
    await gone()
    await page.click('[data-testid=dialog-photo-pine-forest]')
    await page.waitForSelector(`${dialog}:not([data-starting-style])`)
    ok(
      'gallery motion: a fresh card click resets native motion suppression',
      await page.$eval(
        dialog,
        (popup) =>
          !popup.hasAttribute('data-native-transition') &&
          getComputedStyle(popup).transitionDuration.includes('0.35s'),
      ),
    )
    await opened()
    await page.keyboard.press('Escape')
    await gone()

    await page.click('[data-testid=dialog-photo-pine-forest]')
    await opened()
    await page.evaluate(() => history.replaceState(history.state, '', location.href))
    // History API mutations do not emit popstate. A custom history caller notifies the client explicitly.
    await page.evaluate(() =>
      dispatchEvent(new PopStateEvent('popstate', { state: history.state })),
    )
    ok(
      'gallery motion: replacing same-address history metadata preserves the dialog entry',
      (await page.$(dialog)) !== null && (await page.$('[data-testid=photo-page]')) === null,
    )
    await page.evaluate(() => {
      history.replaceState(history.state, '', location.pathname + '?standalone')
      dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
    })
    await page.waitForSelector('[data-testid=photo-page]')
    ok(
      'gallery motion: replacing an entry’s address drops its old dialog presentation',
      (await page.$(dialog)) === null && (await page.$('[data-testid=gallery]')) === null,
    )
    await page.evaluate(() => history.replaceState(history.state, '', location.pathname))
    await page.goBack()
    await page.waitForSelector('[data-testid=gallery]')

    // Remembered gallery metadata must not replace an ordinary page before Fondu captures its old snapshot.
    await page.evaluate(() => {
      window.__pausePhoto = true
      window.__photoReady = false
    })
    await page.click('[data-testid=photo-pine-forest]')
    await page.waitForFunction(() => window.__photoReady)
    await page.evaluate(async () => {
      window.__view.skipTransition()
      await window.__view.finished
    })
    const detailSize = await page.$eval('main img', (img) => ({
      width: img.getBoundingClientRect().width,
      height: img.getBoundingClientRect().height,
    }))
    await page.evaluate(() => {
      window.__photoReady = false
    })
    await page.goBack()
    await page.waitForFunction(() => window.__photoReady)
    const backSize = await page.evaluate(() => {
      const group = getComputedStyle(
        document.documentElement,
        '::view-transition-group(photo-pine-forest)',
      )
      return { width: parseFloat(group.width), height: parseFloat(group.height) }
    })
    ok(
      'gallery motion: Card to page Back captures the full detail, not a prematurely rendered cached gallery',
      Math.abs(backSize.width - detailSize.width) < 1 &&
        Math.abs(backSize.height - detailSize.height) < 1,
    )
    await page.evaluate(async () => {
      window.__pausePhoto = false
      window.__view.skipTransition()
      await window.__view.finished
    })

    // The first row's third photo has not loaded its large image in the dialog cases above.
    await gallery()
    large = 'hold'
    await page.evaluate(() => {
      window.__pausePhoto = true
      window.__photoReady = false
    })
    await page.$eval('[data-testid=photo-snowy-peak] img', (img) => img.decode())
    await page.click('[data-testid=photo-snowy-peak]')
    await page.waitForFunction(() => window.__photoReady)
    ok(
      'gallery motion: the page snapshot has a decoded cached thumbnail while the large image is pending',
      await page.$eval(
        'main img',
        (img) =>
          img.complete && img.naturalWidth > 0 && new URL(img.src).searchParams.get('w') === '640',
      ),
    )
    for (const time of [0, 100, 200, 249]) {
      const sizes = await page.evaluate((time) => {
        document.getAnimations().forEach((a) => {
          a.pause()
          a.currentTime = time
        })
        const style = (type) =>
          getComputedStyle(document.documentElement, `::view-transition-${type}(photo-snowy-peak)`)
        const group = style('group'),
          old = style('old'),
          next = style('new'),
          pair = style('image-pair')
        return {
          group: parseFloat(group.height),
          old: parseFloat(old.height),
          next: parseFloat(next.height),
          oldFit: old.objectFit,
          nextFit: next.objectFit,
          oldAnimation: old.animationName,
          nextAnimation: next.animationName,
          topRadius: parseFloat(pair.borderTopLeftRadius),
          clip: pair.overflow,
        }
      }, time)
      ok(
        `gallery motion: shared page snapshots fill the same animated height at ${time}ms (4:3 to 3:2)`,
        sizes.group > 0 &&
          Math.abs(sizes.group - sizes.old) < 0.2 &&
          Math.abs(sizes.group - sizes.next) < 0.2 &&
          sizes.oldFit === 'contain' &&
          sizes.nextFit === 'cover' &&
          sizes.oldAnimation === 'none' &&
          sizes.nextAnimation === 'none' &&
          sizes.topRadius > 0 &&
          sizes.clip === 'clip',
        JSON.stringify(sizes),
      )
    }
    ok(
      'gallery motion: unmatched cards retain their ordinary exit fade',
      await page.evaluate(() =>
        getComputedStyle(
          document.documentElement,
          '::view-transition-old(photo-pine-forest)',
        ).animationName.includes('fade-out'),
      ),
    )
    const before = await page.$eval('main img', (img) => ({
      width: img.offsetWidth,
      height: img.offsetHeight,
    }))
    await page.evaluate(async () => {
      window.__pausePhoto = false
      window.__view.skipTransition()
      await window.__view.finished
    })
    large = 'ok'
    await Promise.all(held.splice(0).map((request) => request.respond(image)))
    await page.waitForFunction(
      () => new URL(document.querySelector('main img').src).searchParams.get('w') === '1200',
    )
    ok(
      'gallery motion: the decoded large image upgrades without changing the photo’s layout',
      await page.$eval(
        'main img',
        (img, before) =>
          img.complete &&
          img.naturalWidth > 0 &&
          img.offsetWidth === before.width &&
          img.offsetHeight === before.height,
        before,
      ),
    )
    await page.goBack()
    await page.waitForSelector('[data-testid=gallery]')
    await page.evaluate(async () => {
      if (window.__view) await window.__view.finished
    })
    large = 'invalid'
    await page.click('[data-testid=photo-misty-ridge]')
    await page.waitForFunction(() => window.__decodeFailures.some((src) => src.includes('w=1200')))
    ok(
      'gallery motion: a failed large image keeps the working thumbnail on the detail page',
      await page.$eval(
        'main img',
        (img) =>
          img.alt === 'Misty ridge' &&
          img.complete &&
          img.naturalWidth > 0 &&
          new URL(img.src).searchParams.get('w') === '640',
      ),
    )
    await page.evaluate(async () => {
      if (window.__view) await window.__view.finished
    })
    const calls = await page.evaluate(() => window.__viewCalls)
    await native()
    await page.waitForSelector('[data-testid=gallery]')
    ok(
      'gallery motion: a native page Back also skips Fondu’s View Transition',
      (await page.evaluate(() => window.__viewCalls)) === calls,
    )
  } finally {
    await Promise.all(held.splice(0).map((request) => request.abort().catch(() => {})))
    await page.close()
  }
}
