import { usePage } from 'fondu/client'
import { useEffect } from 'react'

import { toastManager, ToastProvider } from '#/components/ui/toast.tsx'

/**
 * The flash data (`flash(c, { message })` or `{ error }` on the server) as toasts: each page brings its own, the first
 * one too, so one effect covers navigations, redirects after an action and full page loads. Without JavaScript (a
 * plain form post), the message is in the page.
 */
export function Toasts() {
  const { flash } = usePage()
  useEffect(() => {
    if (flash.message) toastManager.add({ title: flash.message, type: 'success' })
    if (flash.error) toastManager.add({ title: flash.error, type: 'error' })
  }, [flash])
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
