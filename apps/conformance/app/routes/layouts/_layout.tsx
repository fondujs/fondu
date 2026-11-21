import type { ReactNode } from 'react'

import './site.css'

export const layout = []
export default function Site({ children }: { children: ReactNode }) {
  return (
    <>
      <label>
        Site search <input />
      </label>
      {children}
    </>
  )
}
