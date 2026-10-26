import { defineHandler, render } from 'fondu'

export const prerender = true

export const loader = defineHandler((c) => render(c, Home, { plain: 'value' }))

export default function Home(_: { plain: string }) {
  return null
}
