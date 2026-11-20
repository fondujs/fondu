import type { ReactNode } from 'react'

import { Workspace } from './_workspace.tsx'

export const layout = [Workspace]
export default function Contacts({ children }: { children: ReactNode }) {
  return <section aria-label="Contacts">{children}</section>
}
