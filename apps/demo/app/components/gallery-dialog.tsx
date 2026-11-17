import { href } from 'fondu/client'
import { XIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'

import { GalleryPhoto } from '#/components/gallery-photo.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogPortal,
  DialogPrimitive,
} from '#/components/ui/dialog.tsx'
import { rememberDialog } from '#/modules/gallery/entries.ts'
import { imageUrl, photos, type Photo } from '#/modules/gallery/photos.ts'
import { usePhotoSrc } from '#/modules/gallery/use-photo-src.ts'

/** Real page links: only a plain card click records a dialog entry, not a new tab or an ordinary detail link. */
export function GalleryDialog() {
  return (
    <ul className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="dialog-gallery">
      {photos.map((photo) => (
        <li key={photo.id} className="min-w-0">
          <a
            href={href('/transitions/dialog/:id', { id: photo.id })}
            onClick={(event) => rememberDialog(event, photo.id)}
            aria-haspopup="dialog"
            className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
            data-testid={`dialog-photo-${photo.id}`}
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
  )
}

export function PhotoDialog({
  photo,
  nativeTransition,
  onClose,
}: {
  photo?: Photo
  nativeTransition: boolean
  onClose: () => void
}) {
  // Keep the photo for an ordinary exit. A browser-owned transition must release focus and scroll lock at once,
  // rather than keep a closing dialog over Safari's landing snapshot for another 350ms.
  const [shown, setShown] = useState(photo)
  if (photo && photo !== shown) setShown(photo)
  if (nativeTransition && !photo) return null
  return (
    <Dialog
      // This image viewer locks scroll synchronously via CSS; Base UI's default lock/unlock is deferred.
      modal="trap-focus"
      open={!!photo}
      onOpenChange={(open) => !open && onClose()}
      onOpenChangeComplete={(open) => !open && setShown(undefined)}
    >
      {shown && (
        <DialogPortal>
          <DialogBackdrop
            className="gallery-dialog-backdrop"
            data-native-transition={nativeTransition ? '' : undefined}
          />
          <PhotoPopup photo={shown} nativeTransition={nativeTransition} />
        </DialogPortal>
      )}
    </Dialog>
  )
}

function PhotoPopup({ photo, nativeTransition }: { photo: Photo; nativeTransition: boolean }) {
  const popup = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const src = usePhotoSrc(photo)

  useLayoutEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-gallery-dialog', '')
    return () => {
      root.removeAttribute('data-gallery-dialog')
    }
  }, [])

  useLayoutEffect(() => {
    const element = popup.current
    const media = frame.current
    const source = document.getElementById(`dialog-photo-${photo.id}`)
    if (!element || !media || !source) return
    const update = () => {
      const from = source.getBoundingClientRect()
      // The frame never transforms, so its rect is valid during entry, exit and a resize.
      const to = media.getBoundingClientRect()
      const visible =
        from.width > 0 &&
        to.width > 0 &&
        from.bottom > 0 &&
        from.top < innerHeight &&
        from.right > 0 &&
        from.left < innerWidth
      if (!visible) {
        // The viewport may have changed since the card was opened: don't fly from off screen.
        element.style.removeProperty('--photo-origin-clip')
        element.style.removeProperty('--photo-origin-transform')
        element.style.removeProperty('--photo-origin-radius')
        element.style.removeProperty('--photo-origin-opacity')
        return
      }
      const scale = from.width / to.width
      const radius = getComputedStyle(source).borderTopLeftRadius
      element.style.setProperty(
        '--photo-origin-clip',
        `inset(${from.top}px ${innerWidth - from.right}px ${innerHeight - from.bottom}px ${from.left}px round ${radius})`,
      )
      element.style.setProperty(
        '--photo-origin-transform',
        `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scale})`,
      )
      element.style.setProperty('--photo-origin-radius', `${parseFloat(radius) / scale}px`)
      element.style.setProperty('--photo-origin-opacity', '1')
    }
    update()
    // Establish the starting clip before Base UI removes data-starting-style on its next frame.
    element.getBoundingClientRect()
    const visibility = source.style.visibility
    source.style.visibility = 'hidden'
    const observer = new ResizeObserver(update)
    observer.observe(source)
    observer.observe(media)
    addEventListener('resize', update)
    element.addEventListener('scroll', update, { passive: true })
    return () => {
      source.style.visibility = visibility
      observer.disconnect()
      removeEventListener('resize', update)
      element.removeEventListener('scroll', update)
    }
  }, [photo.id])

  return (
    <DialogPrimitive.Popup
      ref={popup}
      className="gallery-dialog fixed inset-0 z-50 grid items-center justify-items-center overflow-y-auto p-6 py-20 text-white outline-none sm:p-12"
      initialFocus={closeButton}
      finalFocus={() => document.getElementById(`dialog-photo-${photo.id}`)?.closest('a')}
      data-native-transition={nativeTransition ? '' : undefined}
      data-testid="photo-dialog"
    >
      <DialogClose
        className="absolute inset-0 cursor-default"
        tabIndex={-1}
        aria-label="Close photo backdrop"
        data-testid="photo-dialog-backdrop"
      />
      <GalleryPhoto photo={photo} dialog mediaRef={frame} src={src} />
      <DialogClose
        ref={closeButton}
        aria-label="Close photo"
        className="gallery-dialog-info fixed top-4 right-4 rounded-full bg-white/12 text-white hover:bg-white/20 sm:top-6 sm:right-6"
        render={<Button size="icon-lg" variant="ghost" />}
        data-testid="photo-dialog-close"
      >
        <XIcon />
      </DialogClose>
    </DialogPrimitive.Popup>
  )
}
