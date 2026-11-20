import type { ReactNode } from 'react'

export default function Blog({ children }: { children: ReactNode }) {
  return (
    <>
      <aside>
        Blog sidebar
        <label>
          Sidebar draft <input />
        </label>
      </aside>
      {children}
    </>
  )
}
