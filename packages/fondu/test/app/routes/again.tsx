import { defineHandler, render } from 'fondu'

import Home from './index.tsx'

// another route's page as this one's too
export const loader = defineHandler((c) => render(c, Home, { plain: 'again' }))

export default Home
