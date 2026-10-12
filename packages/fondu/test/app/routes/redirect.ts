import { defineHandler, location } from 'fondu'

export const actions = {
  fragment: defineHandler((c) => c.redirect('/#target', 303)),
  away: defineHandler((c) => location(c, 'https://example.com/')),
}
export const PUT = defineHandler((c) => c.redirect('/', 302))
