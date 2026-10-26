import { defineHandler, render } from 'fondu'

import Home from './index.tsx'

// renders another route's page: an error
export const loader = defineHandler((c) => render(c, Home, { plain: 'x' }))

export default function Wrong() {
  return null
}
