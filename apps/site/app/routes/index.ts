import { defineHandler, render } from 'fondu'

// GET /: the landing page
export const loader = defineHandler((c) => render(c, 'index'))
