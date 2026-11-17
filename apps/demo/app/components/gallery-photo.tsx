import type { Ref } from 'react'

import { DialogDescription, DialogTitle } from '#/components/ui/dialog.tsx'
import { cn } from '#/lib/utils.ts'
import { imageUrl, type Photo } from '#/modules/gallery/photos.ts'

/** The dialog and its standalone route show the same photo and information. */
export function GalleryPhoto({
  photo,
  dialog = false,
  mediaRef,
  src = imageUrl(photo, 1200),
}: {
  photo: Photo
  dialog?: boolean
  mediaRef?: Ref<HTMLDivElement>
  src?: string
}) {
  const Heading = dialog ? DialogTitle : 'h1'
  const Description = dialog ? DialogDescription : 'p'
  return (
    <div className="relative grid w-full max-w-5xl items-center gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:gap-10">
      <div ref={mediaRef} className="aspect-4/3 min-w-0">
        <img
          src={src}
          alt={photo.title}
          width={1200}
          height={900}
          className="gallery-dialog-media aspect-4/3 w-full rounded-2xl object-cover"
        />
      </div>
      <div className="gallery-dialog-info">
        <p
          className={cn(
            'mb-3 font-mono text-xs',
            dialog ? 'text-white/50' : 'text-muted-foreground',
          )}
        >
          A closer look
        </p>
        <Heading className="mb-4 text-2xl leading-tight font-semibold">{photo.title}</Heading>
        <Description
          className={cn('mb-6 text-sm/relaxed', dialog ? 'text-white/72' : 'text-muted-foreground')}
        >
          {photo.text}
        </Description>
        <p className={cn('text-xs', dialog ? 'text-white/64' : 'text-muted-foreground')}>
          Photo by{' '}
          <a
            href={photo.page}
            className={cn(
              'underline underline-offset-4',
              dialog
                ? 'text-white decoration-white/40'
                : 'text-brand-foreground decoration-brand-foreground/40',
            )}
          >
            {photo.photographer}
          </a>{' '}
          on Unsplash
        </p>
        {dialog && (
          <p className="mt-8 text-xs text-white/50">
            Escape or click outside to return to the gallery.
          </p>
        )}
      </div>
    </div>
  )
}
