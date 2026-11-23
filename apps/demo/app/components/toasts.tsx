import { usePage } from 'fondu/client'
import { useEffect } from 'react'

import { toastManager, ToastProvider } from '#/components/ui/toast.tsx'

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
