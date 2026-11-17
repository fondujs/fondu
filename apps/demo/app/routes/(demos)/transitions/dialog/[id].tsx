import { defineHandler, render } from 'fondu'
import { href } from 'fondu/client'
import { HTTPException } from 'hono/http-exception'

import { Title } from '#/components/demo.tsx'
import { GalleryPhoto } from '#/components/gallery-photo.tsx'
import { photos, type Photo } from '#/modules/gallery/photos.ts'

export const loader = defineHandler((c) => {
  const photo = photos.find((p) => p.id === c.req.param('id'))
  if (!photo) throw new HTTPException(404)
  return render(c, Show, { photo })
})

/** A fresh document has no gallery behind it, but keeps the dialog's image and information layout. */
export default function Show({ photo }: { photo: Photo }) {
  return (
    <>
      <Title>{photo.title}</Title>
      <div data-testid="photo-page">
        <p className="mb-6 text-sm text-muted-foreground">
          <a href={href('/transitions')}>← Gallery</a>
        </p>
        <GalleryPhoto photo={photo} />
      </div>
    </>
  )
}
