import { defineHandler, render } from 'fondu'

export const loader = defineHandler((c) => render(c, 'about', { runtime: 'Bun' in globalThis ? 'Bun' : `Node ${process.version}` }))
