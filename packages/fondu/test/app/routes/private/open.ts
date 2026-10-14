import { defineHandler, render } from 'fondu'

export const loader = defineHandler((c) => render(c, 'home', { plain: 'open' }, { encryptHistory: false }))
