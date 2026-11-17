import { defineHandler, render } from 'fondu'
import { closeShallow, href, usePage } from 'fondu/client'
import { useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'

import { DemoCard, Title } from '#/components/demo.tsx'
import { PhotoDialog } from '#/components/gallery-dialog.tsx'
import { Card } from '#/components/ui/card.tsx'
import { imageUrl, photos } from '#/modules/gallery/photos.ts'

export const loader = defineHandler((c) => render(c, Gallery, {}))

const code = (lines: string[]) => (
  <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed">
    {lines.join('\n')}
  </pre>
)

// Both sections use the same URLs. A shallow click keeps this page; the photo's route serves ordinary visits.
// Ordinary Back/Forward animate too. A scoped listener reads only the browser's native-animation flag so Safari's
// swipe is not followed by a second animation. It never changes history, predicts a target or restores scroll.
export default function Gallery() {
  const { url } = usePage()
  const path = new URL(url, 'http://localhost').pathname
  const photo = photos.find((photo) => href('/transitions/:id', { id: photo.id }) === path)
  const [nativeTransition, setNativeTransition] = useState(false)
  useLayoutEffect(() => {
    // The browser needs its landing frame synchronously; a queued flag could leave an exiting popup over it.
    const popped = (event: PopStateEvent) => {
      flushSync(() =>
        setNativeTransition(
          (event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition ===
            true,
        ),
      )
    }
    addEventListener('popstate', popped, true)
    return () => removeEventListener('popstate', popped, true)
  }, [])
  const close = () => {
    if (!photo) return // The exiting popup can outlive the URL's open state.
    setNativeTransition(false)
    closeShallow(href('/transitions')) // Fondu already guards a second close before Back lands.
  }
  return (
    <>
      <Title>View transitions</Title>
      <div className="gallery-page" data-gallery-url={url}>
        <h1>View transitions</h1>
        <p className="lede">
          A link with <code>data-transition</code> animates between two pages with the
          browser&apos;s View Transition API: the photo is one element on both pages and moves from
          card to page and back, and the page slides in the direction of the navigation. The links
          of the other demos have no attribute, and don&apos;t animate. See{' '}
          <a href="https://fondu.dev/docs/navigation#view-transitions">the docs</a>.
        </p>
        <h2 className="mb-4 text-lg font-semibold">Card to page</h2>
        <ul className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="gallery">
          {photos.map((photo, i) => (
            <li key={photo.id} className="min-w-0">
              <Card className="h-full overflow-hidden transition-colors hover:border-foreground/16">
                <a
                  href={href('/transitions/:id', { id: photo.id })}
                  data-transition
                  className="block"
                  data-testid={`photo-${photo.id}`}
                >
                  <img
                    src={imageUrl(photo, 640)}
                    alt=""
                    width={640}
                    height={480}
                    // the first row is on the screen at once
                    loading={i < 3 ? undefined : 'lazy'}
                    // An independently captured image needs its own corners, not only the card's clipping.
                    className="aspect-4/3 w-full rounded-t-[calc(var(--radius-2xl)-1px)] object-cover"
                    style={{
                      viewTransitionName: `photo-${photo.id}`,
                      viewTransitionClass: 'gallery-photo',
                    }}
                  />
                  <span className="block p-4 font-medium">{photo.title}</span>
                </a>
                <p className="px-4 pb-4 text-xs text-muted-foreground">
                  Photo by <a href={photo.page}>{photo.photographer}</a> on Unsplash
                </p>
              </Card>
            </li>
          ))}
        </ul>
        <div className="grid gap-4 sm:grid-cols-2">
          <DemoCard title="Opt in, per link" tag="data-transition">
            {code([
              "<a href={href('/transitions/:id', { id })} data-transition>",
              '  <img src={…} style={{ viewTransitionName: `photo-${id}` }} />',
              '</a>',
            ])}
          </DemoCard>
          <DemoCard title="The animation is CSS" tag="::view-transition-*">
            {code([
              '@media (prefers-reduced-motion: no-preference) {',
              '  :root:active-view-transition-type(navigation-forward)',
              '    ::view-transition-new(gallery-page) {',
              '    animation: slide-in-right 250ms ease-out;',
              '  }',
              '  :root:active-view-transition-type(navigation-back)',
              '    ::view-transition-new(gallery-page) {',
              '    animation: slide-in-left 250ms ease-out;',
              '  }',
              '}',
            ])}
          </DemoCard>
        </div>
        <h2 className="mt-12 mb-3 text-lg font-semibold">Card to dialog</h2>
        <p className="lede">
          One URL serves both: a dialog when opened from this gallery with <code>data-shallow</code>
          , the photo&apos;s page on a reload, shared link or new tab. Nothing is requested for the
          dialog; the gallery and its scroll stay where they are.
        </p>
        <ul className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="dialog-gallery">
          {photos.map((photo) => (
            <li key={photo.id} className="min-w-0">
              <a
                href={href('/transitions/:id', { id: photo.id })}
                data-shallow
                aria-haspopup="dialog"
                className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                data-testid={`dialog-photo-${photo.id}`}
                onClick={(event) => {
                  if (
                    !event.defaultPrevented &&
                    event.button === 0 &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.altKey &&
                    !event.shiftKey
                  )
                    setNativeTransition(false)
                }}
              >
                <img
                  id={`dialog-photo-${photo.id}`}
                  src={imageUrl(photo, 640)}
                  alt=""
                  width={640}
                  height={480}
                  loading="lazy"
                  className="aspect-4/3 w-full rounded-2xl object-cover"
                />
                <span className="mt-3 block font-medium underline-offset-4 group-hover:underline">
                  {photo.title}
                </span>
              </a>
              <p className="mt-1 text-xs text-muted-foreground">
                Photo by <a href={photo.page}>{photo.photographer}</a> on Unsplash
              </p>
            </li>
          ))}
        </ul>
        <DemoCard title="One URL, two presentations" tag="data-shallow · usePage().url">
          {code([
            "<a href={href('/transitions/:id', { id })} data-shallow>…</a>",
            'const { url } = usePage()',
            "const path = new URL(url, 'http://localhost').pathname",
            "const photo = photos.find(p => href('/transitions/:id', { id: p.id }) === path)",
            "<PhotoDialog photo={photo} onClose={() => closeShallow(href('/transitions'))} />",
          ])}
        </DemoCard>
      </div>
      <PhotoDialog photo={photo} animate={!nativeTransition} onClose={close} />
    </>
  )
}
