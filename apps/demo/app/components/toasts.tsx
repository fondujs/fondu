import { Toast } from '@base-ui/react/toast'
import { router, usePage } from '@inertiajs/react'
import { X } from 'lucide-react'
import { useEffect } from 'react'

const toasts = Toast.createToastManager()

/**
 * The flash data (`flash(c, { message })` or `{ error }` on the server) as toasts. Inertia fires `flash` for the
 * first page too, so one listener covers visits, redirects after an action and full page loads. Without
 * JavaScript (a plain form post), the message is in the page.
 */
export function Toasts() {
  const { flash } = usePage()
  useEffect(
    () =>
      router.on('flash', ({ detail }) => {
        if (detail.flash.message) toasts.add({ title: detail.flash.message })
        if (detail.flash.error) toasts.add({ title: detail.flash.error, type: 'error' })
      }),
    [],
  )
  const text = flash.error ?? flash.message
  return (
    <Toast.Provider toastManager={toasts}>
      <Toast.Portal>
        <Toast.Viewport className="fixed right-4 bottom-4 z-50 grid w-[min(22rem,calc(100vw-2rem))] gap-2">
          <List />
        </Toast.Viewport>
      </Toast.Portal>
      {text && (
        <noscript>
          <p className="mx-5 mt-4 rounded-md bg-accent-soft px-3 py-2 text-[13px] text-accent">{text}</p>
        </noscript>
      )}
    </Toast.Provider>
  )
}

function List() {
  return Toast.useToastManager().toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      className="popup flex items-start gap-3 px-3 py-2.5 transition-[opacity,translate] duration-200 data-ending-style:translate-y-2 data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0 data-[type=error]:border-danger/40 data-[type=error]:text-danger"
    >
      <Toast.Title className="flex-1 font-medium" data-testid="flash" />
      <Toast.Close aria-label="Close" className="text-muted hover:text-ink">
        <X size={16} />
      </Toast.Close>
    </Toast.Root>
  ))
}
