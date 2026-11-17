import { XIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'

import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPortal,
  DialogPrimitive,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import type { Photo } from '#/modules/gallery/photos.ts'
import { usePhotoSrc } from '#/modules/gallery/use-photo-src.ts'

export function PhotoDialog({
  photo,
  animate = false,
  onClose,
  onFinished,
}: {
  photo?: Photo
  animate?: boolean
  onClose: () => void
  onFinished?: () => void
}) {
  const [shown, setShown] = useState(photo)
  if (photo && photo !== shown) setShown(photo)
  // Only an explicit UI close retains the popup for its exit. History releases focus/scroll immediately.
  return (
    <Dialog
      open={!!photo}
      modal="trap-focus"
      onOpenChange={(open) => !open && onClose()}
      onOpenChangeComplete={(open) => {
        if (!open) setShown(undefined)
        onFinished?.()
      }}
    >
      {shown && (photo || animate) && (
        <DialogPortal>
          <DialogBackdrop
            className="gallery-dialog-backdrop"
            data-animate={animate ? '' : undefined}
          />
          <PhotoPopup photo={shown} animate={animate} onFinished={onFinished} />
        </DialogPortal>
      )}
    </Dialog>
  )
}

function PhotoPopup({
  photo,
  animate,
  onFinished,
}: {
  photo: Photo
  animate: boolean
  onFinished?: () => void
}) {
  const popup = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const src = usePhotoSrc(photo)
  useLayoutEffect(() => {
    // Synchronous CSS lock/unlock keeps a browser gesture's landing frame free of a deferred library scroll lock.
    document.documentElement.setAttribute('data-gallery-dialog', '')
    return () => {
      document.documentElement.removeAttribute('data-gallery-dialog')
      onFinished?.() // Discard the animation hint even if history interrupts entry before it finishes.
    }
  }, [onFinished])
  useLayoutEffect(() => {
    const element = popup.current,
      media = frame.current
    const source = document.getElementById(`dialog-photo-${photo.id}`)
    if (!element || !media || !source) return
    const update = () => {
      const from = source.getBoundingClientRect(),
        to = media.getBoundingClientRect()
      if (
        !from.width ||
        !to.width ||
        from.bottom <= 0 ||
        from.top >= innerHeight ||
        from.right <= 0 ||
        from.left >= innerWidth
      ) {
        for (const name of ['clip', 'transform', 'radius', 'opacity'])
          element.style.removeProperty(`--photo-origin-${name}`)
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
    element.getBoundingClientRect() // Establish the clip before Base UI removes data-starting-style next frame.
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
      initialFocus={closeButton}
      finalFocus={() => document.getElementById(`dialog-photo-${photo.id}`)?.closest('a')}
      className="gallery-dialog fixed inset-0 z-50 grid items-center justify-items-center overflow-y-auto p-6 py-20 text-white outline-none sm:p-12"
      data-animate={animate ? '' : undefined}
      data-testid="photo-dialog"
    >
      <DialogClose
        className="absolute inset-0 cursor-default"
        tabIndex={-1}
        aria-label="Close photo backdrop"
        data-testid="photo-dialog-backdrop"
      />
      <div className="relative grid w-full max-w-5xl items-center gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:gap-10">
        <div ref={frame} className="aspect-4/3 min-w-0">
          <img
            src={src}
            alt={photo.title}
            width={1200}
            height={900}
            className="gallery-dialog-media aspect-4/3 w-full rounded-2xl object-cover"
          />
        </div>
        <div className="gallery-dialog-info">
          <p className="mb-3 font-mono text-xs text-white/50">A closer look</p>
          <DialogTitle className="mb-4 text-2xl leading-tight font-semibold">
            {photo.title}
          </DialogTitle>
          <DialogDescription className="mb-6 text-sm/relaxed text-white/72">
            {photo.text}
          </DialogDescription>
          <p className="text-xs text-white/64">
            Photo by{' '}
            <a
              href={photo.page}
              className="text-white underline decoration-white/40 underline-offset-4"
            >
              {photo.photographer}
            </a>{' '}
            on Unsplash
          </p>
          <p className="mt-8 text-xs text-white/50">
            Escape or click outside to return to the gallery.
          </p>
        </div>
      </div>
      <DialogClose
        ref={closeButton}
        aria-label="Close photo"
        render={<Button size="icon-lg" variant="ghost" />}
        className="gallery-dialog-info fixed top-4 right-4 rounded-full bg-white/12 text-white hover:bg-white/20 sm:top-6 sm:right-6"
        data-testid="photo-dialog-close"
      >
        <XIcon />
      </DialogClose>
    </DialogPrimitive.Popup>
  )
}
