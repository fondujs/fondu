import { href } from 'fondu/client'

import { DemoCard, Title } from '#/components/demo.tsx'
import { GalleryDialog } from '#/components/gallery-dialog.tsx'
import { Card } from '#/components/ui/card.tsx'
import { imageUrl, photos } from '#/modules/gallery/photos.ts'

const code = (lines: string[]) => (
  <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed">
    {lines.join('\n')}
  </pre>
)

/** Shared content for the gallery route and the explicit background of its photo dialogs. No cached page tree. */
export function Gallery({ title = 'View transitions' }: { title?: string }) {
  return (
    <>
      <Title>{title}</Title>
      <div className="gallery-page">
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
                    // A transition captures the image without its Card's clipping: it needs its own corners.
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
        <section className="mt-12" aria-labelledby="dialog-gallery-title">
          <h2 id="dialog-gallery-title" className="mb-2 text-lg font-semibold">
            Card to dialog
          </h2>
          <p className="lede">
            The same photos, without leaving the gallery. Click a card to expand it; close with the
            ×, Escape, a click on the backdrop, or Back. The photo returns to its card and the
            gallery stays where you left it. Forward opens it again. Reload or open the URL in a new
            tab to see the photo as its own page, without the gallery behind it.
          </p>
          <GalleryDialog />
          <DemoCard title="One URL, a dialog or a page" tag="a href · persistent layout">
            <p className="mb-3 text-sm text-muted-foreground">
              These links visit <code>/transitions/dialog/:id</code>, separate from the page
              transition above. The loader supplies the photo; the layout shows a gallery background
              only for a history entry opened by a card here. A reload, a new tab, or an ordinary
              link shows the standalone photo page. A small app-owned history field remembers only
              the source and scroll for this document, without caching a page tree or reading
              Fondu&apos;s history fields. The app&apos;s CSS respects reduced motion and yields to
              native swipe navigation.
            </p>
            {code([
              'import { rememberDialog } from "#/modules/gallery/entries.ts"',
              "<a href={href('/transitions/dialog/:id', { id: photo.id })}",
              '   onClick={event => rememberDialog(event, photo.id)}>',
              '  <img src={…} />',
              '</a>',
              '',
              '// The link navigates normally; remember only its entry and scroll.',
              '// Close goes Back. A reload renders only the detail page.',
            ])}
          </DemoCard>
        </section>
      </div>
    </>
  )
}
