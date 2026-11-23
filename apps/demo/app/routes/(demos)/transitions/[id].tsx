import { defineHandler, render } from 'fondu'
import { href } from 'fondu/client'
import { HTTPException } from 'hono/http-exception'

import { Title } from '#/components/demo.tsx'
import { photos, type Photo } from '#/modules/gallery/photos.ts'
import { usePhotoSrc } from '#/modules/gallery/use-photo-src.ts'

export const loader = defineHandler((c) => {
  const photo = photos.find((p) => p.id === c.req.param('id'))
  if (!photo) throw new HTTPException(404)
  return render(c, Show, { photo })
})

export default function Show({ photo }: { photo: Photo }) {
  const src = usePhotoSrc(photo)
  return (
    <>
      <Title>{photo.title}</Title>
      <div className="gallery-page">
        <p className="mb-2 text-sm text-muted-foreground">
          <a href={href('/transitions')} data-transition>
            ← Gallery
          </a>
        </p>
        <h1 data-testid="photo-title">{photo.title}</h1>
        <img
          src={src}
          alt={photo.title}
          width={1200}
          height={800}
          className="my-6 aspect-3/2 w-full rounded-2xl object-cover"
          style={{ viewTransitionName: `photo-${photo.id}`, viewTransitionClass: 'gallery-photo' }}
        />
        <p className="mb-8 text-xs text-muted-foreground">
          Photo by <a href={photo.page}>{photo.photographer}</a> on Unsplash
        </p>
        <p className="lede">{photo.text}</p>
      </div>
    </>
  )
}
