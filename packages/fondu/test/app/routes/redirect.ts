import { defineHandler, location } from 'fondu'

export const loader = defineHandler((c) => c.redirect('/#target', 302))

export const actions = {
  fragment: defineHandler((c) => c.redirect('/#target', 303)),
  away: defineHandler((c) => location(c, 'https://example.com/')),
  nothing: defineHandler((c) => c.body(null)),
}
export const PUT = defineHandler((c) => c.redirect('/', 302))
