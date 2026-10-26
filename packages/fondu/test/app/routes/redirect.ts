import { clearHistory, defineHandler, location } from 'fondu'

export const loader = defineHandler((c) => c.redirect('/', 302))

export const actions = {
  away: defineHandler((c) => location(c, 'https://example.com/')),
  nothing: defineHandler((c) => c.body(null)),
  fragment: defineHandler((c) => c.redirect('/notes#end', 303)),
  signout: defineHandler((c) => {
    clearHistory(c)
    return c.redirect('/', 303)
  }),
}
