import { defineHandler, render } from 'fondu'

export const loader = defineHandler((c) => render(c, 'ssr', { ssr: true }))
