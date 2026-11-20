import type { ReactNode } from 'react'

export function Workspace({ children }: { children: ReactNode }) {
  return (
    <>
      <label>
        Workspace filter <input />
      </label>
      {children}
    </>
  )
}
