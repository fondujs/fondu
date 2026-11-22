import { memo, type ReactNode } from 'react'

export default memo(function NotesLayout({ children }: { children: ReactNode }) {
  return <section>{children}</section>
})
