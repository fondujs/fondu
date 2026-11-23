import type { ReactNode } from 'react'

import { SettingsDialog } from '#/components/settings-dialog.tsx'
import { Toasts } from '#/components/toasts.tsx'

import '../styles/app.css'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <>
      <Toasts />
      <SettingsDialog />
      {children}
    </>
  )
}
