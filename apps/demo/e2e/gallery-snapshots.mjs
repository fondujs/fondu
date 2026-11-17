// Snapshot geometry and image decoding only; no dialog or application history controller.
export async function checkGallerySnapshots({ browser, base, ok, watchProblems }) {
  const page = await browser.newPage()
  watchProblems(page)
  await page.setViewport({ width: 1100, height: 850 })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  const image = {
    status: 200,
    contentType: 'image/png',
    body: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    ),
  }
  let large = 'hold'
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
    const start = document.startViewTransition
    if (start)
      document.startViewTransition = function (options) {
        const view = (window.__photoView = start.call(this, options))
        view.ready.then(
          () => {
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
    HTMLImageElement.prototype.decode = function () {
      return decode.call(this).catch((error) => {
        window.__photoDecodeFailed = true
        throw error
      })
    }
  })
  const ready = () => page.waitForFunction(() => window.__photoReady)
  const finish = () =>
    page.evaluate(async () => {
      window.__photoView.skipTransition()
      await window.__photoView.finished
      window.__photoReady = false
    })
  try {
    await page.goto(base + '/transitions', { waitUntil: 'networkidle0' })
    await page.$eval('[data-testid=photo-snowy-peak] img', (img) => img.decode())
    ok(
      'gallery snapshots: the thumbnail has its own top corners',
      await page.$eval(
        '[data-testid=photo-snowy-peak] img',
        (img) => parseFloat(getComputedStyle(img).borderTopLeftRadius) > 0,
      ),
    )
    await page.click('[data-testid=photo-snowy-peak]')
    await ready()
    ok(
      'gallery snapshots: the pending large image leaves a decoded thumbnail in the snapshot',
      await page.$eval(
        'main img',
        (img) =>
          img.complete && img.naturalWidth > 0 && new URL(img.src).searchParams.get('w') === '640',
      ),
    )
    for (const time of [0, 125, 249]) {
      const correct = await page.evaluate((time) => {
        document.getAnimations().forEach((animation) => {
          animation.pause()
          animation.currentTime = time
        })
        const style = (type) =>
          getComputedStyle(document.documentElement, `::view-transition-${type}(photo-snowy-peak)`)
        const group = style('group'),
          old = style('old'),
          next = style('new'),
          pair = style('image-pair')
        const height = parseFloat(group.height)
        return (
          height > 0 &&
          Math.abs(height - parseFloat(old.height)) < 0.2 &&
          Math.abs(height - parseFloat(next.height)) < 0.2 &&
          old.objectFit === 'contain' &&
          next.objectFit === 'cover' &&
          old.animationName === 'none' &&
          next.animationName === 'none' &&
          parseFloat(pair.borderTopLeftRadius) > 0 &&
          pair.overflow === 'clip'
        )
      }, time)
      ok(`gallery snapshots: both snapshots fill the rounded animated group at ${time}ms`, correct)
    }
    ok(
      'gallery snapshots: unmatched cards keep their exit fade',
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
    await finish()
    large = 'ok'
    await Promise.all(held.splice(0).map((request) => request.respond(image)))
    await page.waitForFunction(
      () => new URL(document.querySelector('main img').src).searchParams.get('w') === '1200',
    )
    ok(
      'gallery snapshots: the decoded image upgrades without a layout change',
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
    await ready()
    await finish()
    large = 'invalid'
    await page.click('[data-testid=photo-misty-ridge]')
    await ready()
    await page.waitForFunction(() => window.__photoDecodeFailed)
    ok(
      'gallery snapshots: a failed upgrade keeps the thumbnail',
      await page.$eval(
        'main img',
        (img) =>
          img.complete && img.naturalWidth > 0 && new URL(img.src).searchParams.get('w') === '640',
      ),
    )
    await finish()
  } finally {
    await Promise.all(held.splice(0).map((request) => request.abort().catch(() => {})))
    await page.close()
  }
}
