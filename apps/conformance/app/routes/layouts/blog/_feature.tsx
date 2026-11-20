import type { ReactNode } from 'react'

import './feature.css'

export function Feature({ children }: { children: ReactNode }) {
  return <article aria-label="Special feature">{children}</article>
}
