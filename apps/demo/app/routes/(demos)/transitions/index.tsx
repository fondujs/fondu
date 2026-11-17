import { defineHandler, render } from 'fondu'
import { href } from 'fondu/client'

import { DemoCard, Title } from '#/components/demo.tsx'
import { Card } from '#/components/ui/card.tsx'
import { imageUrl, photos } from '#/modules/gallery/photos.ts'

export const loader = defineHandler((c) => render(c, Gallery, {}))

const code = (lines: string[]) => (
  <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed">
    {lines.join('\n')}
  </pre>
)

export default function Gallery() {
  return (
    <>
      <Title>View transitions</Title>
      <div className="gallery-page">
        <h1>View transitions</h1>
        <p className="lede">
          A link with <code>data-transition</code> animates between two pages with the
          browser&apos;s View Transition API: the photo is one element on both pages and moves from
          card to page and back, and the page slides in the direction of the navigation. The links
          of the other demos have no attribute, and don&apos;t animate. See{' '}
          <a href="https://fondu.dev/docs/navigation#view-transitions">the docs</a>.
        </p>
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
                    className="aspect-4/3 w-full object-cover"
                    style={{ viewTransitionName: `photo-${photo.id}` }}
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
      </div>
    </>
  )
}
