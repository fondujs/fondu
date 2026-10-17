import { router, usePage } from '@inertiajs/react'
import { useEffect } from 'react'

import { toastManager, ToastProvider } from '#/components/ui/toast.tsx'

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
        if (detail.flash.message) toastManager.add({ title: detail.flash.message, type: 'success' })
        if (detail.flash.error) toastManager.add({ title: detail.flash.error, type: 'error' })
      }),
    [],
  )
  // production: a form's answer that isn't a page (a proxy's 502, a CDN's timeout) as a toast, the form as it was.
  // Inertia's dialog is for development (Fondu loads a GET's answer as a document)
  useEffect(() => {
    if (!import.meta.env.PROD) return
    let method = 'get'
    const offStart = router.on('start', ({ detail }) => void (method = detail.visit.method))
    const offException = router.on('httpException', (event) => {
      if (method === 'get' || event.detail.response.headers['x-inertia']) return
      event.preventDefault()
      toastManager.add({
        title: `The server did not answer (${event.detail.response.status})`,
        description: 'What you typed is still here: try again.',
        type: 'error',
      })
    })
    return () => (offStart(), offException())
  }, [])
  const text = flash.error ?? flash.message
  return (
    <ToastProvider>
      {text && (
        <noscript>
          <p className="mx-5 mt-4 rounded-lg border bg-card px-3 py-2">{text}</p>
        </noscript>
      )}
    </ToastProvider>
  )
}
