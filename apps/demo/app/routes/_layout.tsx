import type { ReactNode } from 'react'

import { SettingsDialog } from '#/components/settings-dialog.tsx'
import { Toasts } from '#/components/toasts.tsx'

import '../styles/app.css'

// Around every page, the error page too: the styles, the flash messages as toasts, the settings dialog (over any page: its URL's fragment opens it). Inside it, the demos' layout
// ((demos)/_layout.tsx: the sidebar, a group adds no URL segment) or the admin's (admin/_layout.tsx: a top bar).
export default function Root({ children }: { children: ReactNode }) {
  return (
    <>
      <Toasts />
      <SettingsDialog />
      {children}
    </>
  )
}
