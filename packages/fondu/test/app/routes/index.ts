import { defineHandler, render } from 'fondu'

export const prerender = true

export const loader = defineHandler((c) => render(c, 'home' as never, { plain: 'value' } as never))
