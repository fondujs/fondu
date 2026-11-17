import { usePage } from 'fondu/client'
import { useLayoutEffect, useRef, type ReactNode } from 'react'

import { PhotoDialog } from '#/components/gallery-dialog.tsx'
import { Gallery } from '#/components/gallery.tsx'
import { useGalleryEntry } from '#/modules/gallery/entries.ts'
import { photos, type Photo } from '#/modules/gallery/photos.ts'

/** Only these routes can render a gallery background. Ordinary detail entries still render their own page. */
export default function TransitionsLayout({ children }: { children: ReactNode }) {
  const { component, props, url } = usePage<{ photo?: Photo }>()
  const { origin, nativeTransition } = useGalleryEntry(url)
  const photo = origin?.photo
    ? props.photo?.id === origin.photo
      ? props.photo
      : photos.find((p) => p.id === origin.photo)
    : undefined
  const closing = useRef(false)
  useLayoutEffect(() => {
    closing.current = false
    if (!origin?.photo) return
    // Fondu restores scroll after its page commit. Restore this background before paint, not a frame later.
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) scrollTo(origin.x, origin.y)
    })
    return () => {
      cancelled = true
    }
  }, [origin, url])

  // Never pre-render over Card to page: Fondu must capture that page before committing a shared transition.
  if (
    component === '(demos)/transitions/[id]' ||
    (!origin && component !== '(demos)/transitions/index')
  )
    return children
  return (
    <>
      <Gallery title={photo?.title} />
      <PhotoDialog
        photo={photo}
        nativeTransition={nativeTransition}
        onClose={() => {
          if (!photo || closing.current) return
          closing.current = true
          history.back()
        }}
      />
    </>
  )
}
