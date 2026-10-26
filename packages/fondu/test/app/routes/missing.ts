import { defineHandler, render } from 'fondu'

import Home from './index.tsx'

// a .ts route has no page to render: an error
export const loader = defineHandler((c) => render(c, Home, { plain: 'x' }))
