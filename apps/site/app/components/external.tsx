import type { ComponentProps } from 'react'

/** A link to another site: opened in a new tab */
export const External = (props: ComponentProps<'a'>) => (
  <a target="_blank" rel="noopener noreferrer" {...props} />
)
