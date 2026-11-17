import { useEffect, useState } from 'react'

import { imageUrl, type Photo } from '#/modules/gallery/photos.ts'

/** Reuse the gallery's cached thumbnail until the large image has decoded, including during a page transition. */
export function usePhotoSrc(photo: Photo) {
  const [decoded, setDecoded] = useState<string>()
  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.src = imageUrl(photo, 1200)
    image.decode().then(
      () => !cancelled && setDecoded(photo.id),
      () => {}, // A failed large image must not replace a working thumbnail.
    )
    return () => {
      cancelled = true
    }
  }, [photo])
  return imageUrl(photo, decoded === photo.id ? 1200 : 640)
}
