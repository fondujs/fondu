import type { ComponentProps } from 'react'

export const External = (props: ComponentProps<'a'>) => (
  <a target="_blank" rel="noopener noreferrer" {...props} />
)
